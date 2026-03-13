import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logDebug, logDebugError } from '../../core/logger.js';
import { chat } from '../../core/llm.js';

export async function download_youtube_mp3(args, options = {}) {
    const { url, output_dir, smart_rename = true } = args;
    const { onStream } = options;
    
    // Validate URL briefly
    if (!url || typeof url !== 'string' || !url.includes('youtu')) {
        return { error: 'Invalid YouTube URL provided.' };
    }

    const downloadDir = output_dir ? path.resolve(output_dir) : path.resolve(process.cwd(), 'downloads', 'youtube');
    if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
    }

    logDebug(`[DEBUG] Starting yt-dlp for URL: ${url} -> ${downloadDir}`);

    return new Promise((resolve) => {
        const sendActivity = () => {
            if (process.send && process.connected) {
                try {
                    process.send({ type: 'ACTIVITY' });
                } catch (e) { /* ignore */ }
            }
        };

        // Keep the main process alive during long downloads
        const activityInterval = setInterval(sendActivity, 60000);


        // yt-dlp command to extract highest quality audio as 320kbps MP3
        // Also handling playlists by dumping into a folder named after the playlist
        const ytargs = [
            '-f', 'bestaudio',
            '-x', 
            '--audio-format', 'mp3',
            '--audio-quality', '320K',
            '-o', path.join(downloadDir, '%(playlist_title|YouTube)s', '%(title)s.%(ext)s'),
            url
        ];

        const child = spawn('yt-dlp', ytargs);

        let errorLines = [];
        let downloadedFiles = [];

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    sendActivity(); // frequent short pings
                    logDebug(`[yt-dlp] ${line.trim()}`);
                    
                    // Progress Streaming (Phase 9)
                    if (onStream) onStream(line.trim());

                    // Output parsing to detect final file
                    if (line.includes('[ExtractAudio] Destination:')) {
                        const file = line.split('[ExtractAudio] Destination:')[1].trim();
                        downloadedFiles.push(file);
                    } else if (line.includes('has already been downloaded')) {
                        downloadedFiles.push(line.trim());
                    }
                }
            }
        });

        child.stderr.on('data', (data) => {
            errorLines.push(data.toString().trim());
            if (errorLines.length > 200) errorLines.shift(); // Prevent OOM
        });

        child.on('close', (code) => {
            clearInterval(activityInterval);
            if (code !== 0) {
                logDebugError(`[DEBUG] yt-dlp exited with code ${code}. Errors: ${errorLines.join(' | ')}`);
                resolve({
                    error: `Download failed with code ${code}`,
                    details: errorLines.join('\n').substring(0, 1000)
                });
            } else {
                const resultCount = downloadedFiles.length;
                
                // Smart Renaming Phase (Phase 19)
                const finalFiles = [];
                if (smart_rename && resultCount > 0) {
                    if (onStream) onStream("✨ Performing 'Clever Rename' using 9B model...");
                    performSmartRename(downloadedFiles, onStream)
                        .then(renamed => {
                            resolve({
                                message: `Successfully downloaded and cleverly renamed ${resultCount} MP3(s)!`,
                                files_detected: renamed.slice(0, 5),
                                total_count: resultCount,
                                output_directory: downloadDir
                            });
                        })
                        .catch(err => {
                            logDebugError(`[DEBUG] Smart rename failed: ${err.message}`);
                            resolve({
                                message: `Downloaded ${resultCount} MP3(s) (Smart rename failed).`,
                                files_detected: downloadedFiles.slice(0, 5),
                                total_count: resultCount,
                                output_directory: downloadDir
                            });
                        });
                } else {
                    let displayFiles = downloadedFiles;
                    let summary = "";

                    if (resultCount > 5) {
                        displayFiles = downloadedFiles.slice(0, 5);
                        summary = `(...and ${resultCount - 5} more tracks). `;
                    }

                    resolve({
                        message: `Successfully downloaded and converted ${resultCount} MP3(s)! ${summary}`,
                        files_detected: displayFiles,
                        total_count: resultCount,
                        output_directory: downloadDir
                    });
                }
            }
        });

        child.on('error', (err) => {
            clearInterval(activityInterval);
            logDebugError(`[DEBUG] Failed to start yt-dlp: ${err.message}`);
            resolve({ error: `Failed to spawn yt-dlp: ${err.message}. Is yt-dlp installed on the system?` });
        });
    });
}

/**
 * Searches for a song and downloads the best match.
 */
export async function search_and_download_mp3(args, options = {}) {
    const { query, output_dir } = args;
    const { onStream } = options;

    if (!query) return { error: 'No search query provided.' };
    if (onStream) onStream(`🔍 Searching YouTube for: "${query}"...`);

    try {
        // 1. Execute Search
        const searchCmd = `yt-dlp "ytsearch5:${query.replace(/"/g, '')}" --dump-json --flat-playlist`;
        const output = execSync(searchCmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        
        const results = output.split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    const data = JSON.parse(line);
                    return {
                        title: data.title,
                        uploader: data.uploader,
                        duration: data.duration,
                        url: `https://www.youtube.com/watch?v=${data.id}`,
                        view_count: data.view_count || 0
                    };
                } catch (e) { return null; }
            }).filter(r => r);

        if (results.length === 0) return { error: `No results found for "${query}".` };

        // 2. Select Best Match via LLM
        if (onStream) onStream(`🧠 Identifying the best match from ${results.length} results...`);
        
        const selectionPrompt = `You are a music expert. I searched for "${query}" on YouTube. 
Based on these top results, identify the URL that is most likely the "Official Audio", "Studio Version", or "Official Music Video". 
Prefer official artist channels over lyric videos or fan-made covers.
Results:
${results.map((r, i) => `${i + 1}. Title: ${r.title} | Uploader: ${r.uploader} | Duration: ${r.duration}s | Views: ${r.view_count}`).join('\n')}

Return ONLY the URL of the best result. No other text.`;

        let bestUrl;
        try {
            const selection = await chat([
                { role: 'system', content: 'You are a precise link extractor. Return ONLY a URL.' },
                { role: 'user', content: selectionPrompt }
            ], { deepThinking: true, forceLocal: true });
            bestUrl = selection.text.trim().match(/https?:\/\/[^\s]+/)?.[0];
        } catch (llmErr) {
            logDebugError(`[SEARCH] LLM selection failed: ${llmErr.message}`);
        }
        
        if (!bestUrl) {
            const fallback = results[0].url;
            if (onStream) onStream(`⚠️ Selection failed or LLM offline. Falling back to first result: ${results[0].title}`);
            return download_youtube_mp3({ url: fallback, output_dir }, options);
        }

        const selectedResult = results.find(r => r.url === bestUrl) || results[0];
        if (onStream) onStream(`✅ Best match found: "${selectedResult.title}" by ${selectedResult.uploader}.`);

        // 3. Delegate to Download
        return download_youtube_mp3({ url: bestUrl, output_dir }, options);

    } catch (e) {
        logDebugError(`[SEARCH] Search and download failed: ${e.message}`);
        return { error: `Search failed: ${e.message}` };
    }
}

/**
 * Scans and organizes an existing library.
 */
export async function organize_library(args, options = {}) {
    const { directory } = args;
    const { onStream } = options;

    const targetDir = directory ? path.resolve(directory) : path.resolve(process.cwd(), 'downloads', 'youtube');
    if (!fs.existsSync(targetDir)) return { error: `Directory ${targetDir} does not exist.` };

    if (onStream) onStream(`📂 Scanning library in: ${targetDir}...`);
    
    // Scan recursively to find all MP3s scattered in subfolders
    const allFiles = getAllFiles(targetDir).filter(f => f.endsWith('.mp3'));
    const initialCount = allFiles.length;
    if (initialCount === 0) return { message: "No MP3 files found to organize." };

    if (onStream) onStream(`🎶 Found ${initialCount} MP3 files. Batching for 'Clever Rename' and Folder Move...`);

    const batchSize = 10; 
    for (let i = 0; i < allFiles.length; i += batchSize) {
        const batch = allFiles.slice(i, i + batchSize);
        const validBatch = batch.filter(f => fs.existsSync(f));
        if (validBatch.length === 0) continue;

        if (onStream) onStream(`📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allFiles.length/batchSize)}...`);
        try {
            // Pass targetDir to ensure renames move files to artist folders relative to library root
            await performSmartRename(validBatch, onStream, targetDir); 
        } catch (e) {
            logDebugError(`[ORGANIZE] Batch failed: ${e.message}`);
            if (onStream) onStream(`⚠️ Batch failed due to LLM timeout or error. Moving to next...`);
        }
    }
    
    // Cleanup: Remove empty subdirectories after organization
    if (onStream) onStream(`🧹 Cleaning up empty messy folders in ${targetDir}...`);
    try {
        const cleanupCmd = `find "${targetDir}" -mindepth 1 -type d -empty -delete`;
        execSync(cleanupCmd);
    } catch (e) {
        logDebugError(`[CLEANUP] Failed to remove empty dirs: ${e.message}`);
    }

    const finalFiles = getAllFiles(targetDir).filter(f => f.endsWith('.mp3'));
    const finalCount = finalFiles.length;
    
    return {
        message: `Library organization complete!`,
        initial_file_count: initialCount,
        final_file_count: finalCount,
        deduplicated_count: initialCount - finalCount,
        directory: targetDir
    };
}

/**
 * Recursive file finder helper.
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);
    files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            arrayOfFiles.push(fullPath);
        }
    });
    return arrayOfFiles;
}

/**
 * Uses LLM to clean titles into "Artist - Song" format.
 */
async function performSmartRename(files, onStream, libraryRoot) {
    try {
        const fileMap = files.map(f => ({
            original: f,
            basename: path.basename(f, '.mp3')
        }));

        const prompt = `You are a music librarian. Clean the following YouTube video titles and format them precisely as "Artist - Song". 
CRITICAL: Use ONLY a single dash with spaces around it " - " as the separator. Do NOT use "|", ":", "—", or just spaces.
Remove junk like "[Official Video]", "(HD)", year dates, or channel watermarks. 
If a title is just a song name, try to infer the artist or use "Unknown Artist".
Return ONLY a JSON array of objects: [{"original": "...", "new": "..."}]

Titles to process:
${fileMap.map((m, i) => `${i + 1}. ${m.basename}`).join('\n')}
`;

        const response = await chat([
            { role: 'system', content: 'You are a JSON formatter. Return ONLY a valid JSON array of objects.' },
            { role: 'user', content: prompt }
        ], { deepThinking: true, forceLocal: true });

        // Extract JSON - handle common LLM formatting artifacts
        let rawJson = response.text.trim();
        if (rawJson.startsWith('```json')) rawJson = rawJson.replace(/^```json/, '').replace(/```$/, '');
        else if (rawJson.startsWith('```')) rawJson = rawJson.replace(/^```/, '').replace(/```$/, '');
        
        const jsonMatch = rawJson.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            logDebugError(`[DEBUG] Failed to extract JSON from: ${response.text}`);
            throw new Error("Could not parse LLM response as JSON");
        }
        
        const suggestions = JSON.parse(jsonMatch[0]);
        return applyRenames(fileMap, suggestions, onStream, libraryRoot);

    } catch (e) {
        logDebugError(`[DEBUG] performSmartRename LLM error: ${e.message}`);
        
        // Final Fallback: Basic regex cleaning if LLM fails
        if (onStream) onStream(`⚠️ LLM failed, using basic rename logic for this batch.`);
        const fallbackSuggestions = files.map(f => {
            const base = path.basename(f, '.mp3');
            const cleaned = base
                .replace(/\[.*?\]/g, '')
                .replace(/\(.*?\)/g, '')
                .replace(/MV|Official|HD|HQ/gi, '')
                .replace(/\s*[|\-—~:;｜]\s*/g, " - ") // Normalize separators (added full-width bar)
                .replace(/\s+/g, ' ')
                .trim();
            
            // Ensure there is a dash
            let finalName = cleaned;
            if (!cleaned.includes(' - ')) {
                // Specific heuristic for common artist names if LLM is offline
                if (cleaned.includes('陈奕迅') || cleaned.toLowerCase().includes('eason chan') || cleaned.includes('陳奕迅')) {
                    const songPart = cleaned.replace(/陈奕迅|Eason Chan|陳奕迅/gi, '').replace(/^[\s_\-@]+|[\s_\-@]+$/g, '').trim();
                    finalName = `陳奕迅 - ${songPart || 'Unknown Song'}`;
                } else {
                    const parts = cleaned.split(' ');
                    if (parts.length > 1) {
                        finalName = `${parts[0]} - ${parts.slice(1).join(' ')}`;
                    } else {
                        finalName = `Unknown Artist - ${cleaned}`;
                    }
                }
            }
            return { original: base, new: finalName };
        });
        
        const fileMap = files.map(f => ({ original: f, basename: path.basename(f, '.mp3') }));
        return applyRenames(fileMap, fallbackSuggestions, onStream, libraryRoot);
    }
}

/**
 * Shared helper to apply rename/dedupe logic.
 */
function applyRenames(fileMap, suggestions, onStream, libraryRoot) {
    const finalFileList = [];
    for (const sugg of suggestions) {
        const entry = fileMap.find(m => m.basename === sugg.original);
        if (entry) {
            // Strict normalization: Ensure space-dash-space
            let normalizedNew = sugg.new
                .replace(/\s*[|\-—~:;｜]\s*/g, " - ")
                .replace(/\s+/g, " ")
                .trim();
            
            const newBasename = normalizedNew.replace(/[<>:"/\\|?*]/g, ''); 
            
            // Extract artist for folder organization
            let artist = "Unknown Artist";
            if (normalizedNew.includes(" - ")) {
                artist = normalizedNew.split(" - ")[0].trim();
            } else {
                // Heuristic: If it looks like 'Name(something)' or 'Name Song', try to split
                const fallbackMatch = normalizedNew.match(/^([^\s(]+)[\s(]/);
                if (fallbackMatch && fallbackMatch[1].length > 2) {
                    artist = fallbackMatch[1].trim();
                }
            }

            // Determine destination directory (Artist folder)
            const baseDir = libraryRoot || path.dirname(entry.original);
            const artistFolder = path.join(baseDir, artist);
            
            if (!fs.existsSync(artistFolder)) {
                fs.mkdirSync(artistFolder, { recursive: true });
            }

            const newPath = path.join(artistFolder, `${newBasename}.mp3`);
            
            if (entry.original !== newPath) {
                if (fs.existsSync(newPath)) {
                    if (onStream) onStream(`⚖️ Duplicate detected: ${sugg.new}. Comparing quality...`);
                    const keptPath = resolveDuplicate(entry.original, newPath, onStream);
                    finalFileList.push(keptPath);
                } else {
                    fs.renameSync(entry.original, newPath);
                    finalFileList.push(newPath);
                    if (onStream) onStream(`📝 Renamed & Moved to ${artist}: ${sugg.new}`);
                }
            } else {
                finalFileList.push(entry.original);
            }
        }
    }
    return finalFileList;
}


/**
 * Compares two files and returns the path to the higher quality one.
 * Deletes the lower quality one.
 */
function resolveDuplicate(newFile, existingFile, onStream) {
    try {
        const newQual = getAudioQuality(newFile);
        const existingQual = getAudioQuality(existingFile);

        logDebug(`[DEDUPE] New: ${newQual.bitrate} bps, ${newQual.size} bytes | Existing: ${existingQual.bitrate} bps, ${existingQual.size} bytes`);

        // 1. Bitrate priority
        if (newQual.bitrate > existingQual.bitrate) {
            if (onStream) onStream(`✅ New version is higher bitrate (${newQual.bitrate / 1000}k). Replacing...`);
            fs.unlinkSync(existingFile);
            fs.renameSync(newFile, existingFile);
            return existingFile;
        } else if (existingQual.bitrate > newQual.bitrate) {
            if (onStream) onStream(`⏭️ Existing version is superior (${existingQual.bitrate / 1000}k). Keeping existing.`);
            fs.unlinkSync(newFile);
            return existingFile;
        }

        // 2. Size fallback (if bitrates are equal)
        if (newQual.size > existingQual.size * 1.05) { // 5% buffer for metadata variation
            if (onStream) onStream(`✅ New version is larger/better quality. Replacing...`);
            fs.unlinkSync(existingFile);
            fs.renameSync(newFile, existingFile);
            return existingFile;
        } else {
            if (onStream) onStream(`⏭️ Existing version is identical or better. Skipping.`);
            fs.unlinkSync(newFile);
            return existingFile;
        }
    } catch (e) {
        logDebugError(`[DEDUPE] Error in resolveDuplicate: ${e.message}`);
        return newFile; // Safety fallback
    }
}

/**
 * Extracts bitrate and file size using ffprobe.
 */
function getAudioQuality(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const bitrate = execSync(`ffprobe -v error -show_entries stream=bit_rate -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { encoding: 'utf8' }).trim();
        return {
            bitrate: parseInt(bitrate) || 0,
            size: stats.size
        };
    } catch (e) {
        logDebugError(`[QUALITY] Error getting quality for ${filePath}: ${e.message}`);
        return { bitrate: 0, size: 0 };
    }
}
