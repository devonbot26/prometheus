import { getSubtitles } from 'youtube-captions-scraper';
import { read_webpage } from '../web-scraper/index.js';
import { prompt } from '../../core/llm.js';
import { logDebug, logDebugError } from '../../core/logger.js';

/**
 * Validates and extracts the Video ID from a URL
 */
function extractVideoId(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|live\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : (url.length === 11 ? url : null);
}

/**
 * Node-based decision tree for fetching a transcript
 */
export async function fetch_transcript(args) {
    const { url } = args;

    // Node 1: Validation
    logDebug(`[DEBUG] Node 1: Validating YouTube URL...`);
    const videoId = extractVideoId(url);
    if (!videoId) {
        logDebugError(`[DEBUG] Node 1 Error: Invalid YouTube URL: ${url}`);
        return { error: "Invalid YouTube URL or ID." };
    }

    logDebug(`[DEBUG] Node 2: Fetching transcript for ${videoId} via youtube-captions-scraper...`);

    try {
        // Node 2: Fetch Transcript
        const captions = await getSubtitles({
            videoID: videoId,
            lang: 'en'
        });

        if (!captions || captions.length === 0) {
            throw new Error("No captions found or transcript disabled.");
        }

        const fullText = captions.map(c => c.text).join(' ');

        // Node 3: Formatting Return
        logDebug(`[DEBUG] Node 3: Successfully extracted ${fullText.length} chars of transcript.`);

        const MAX_CHARS = 15000;
        const truncated = fullText.length > MAX_CHARS
            ? fullText.substring(0, MAX_CHARS) + " ... (truncated)"
            : fullText;

        return {
            source: `YouTube Transcript for ${videoId}`,
            length: fullText.length,
            content: truncated
        };

    } catch (e) {
        logDebugError(`[DEBUG] Node 2 Error: Transcript fetch failed -> ${e.message}`);
        logDebug(`[DEBUG] Node 4: Fallback to reading the web page for Title/Description...`);

        // Node 4: Fallback
        try {
            const pageResult = await read_webpage({ url: `https://www.youtube.com/watch?v=${videoId}` });
            if (pageResult && typeof pageResult.result === 'string') {
                return {
                    warning: "Captions were disabled or unreachable. Falling back to video page metadata.",
                    source: `YouTube Meta for ${videoId}`,
                    content: pageResult.result.substring(0, 5000)
                };
            }
            throw new Error("Fallback webpage read failed.");
        } catch (fallbackErr) {
            return {
                error: `Failed to fetch transcript and meta: ${e.message}`,
                hint: "Use web_search to find information about this video."
            };
        }
    }
}

/**
 * Sub-agent workflow to fetch and summarize
 */
export async function summarize_video(args) {
    const { url } = args;

    logDebug(`[DEBUG] Node 1: Starting summarize_video workflow for ${url}`);

    const transcriptResult = await fetch_transcript({ url });
    if (transcriptResult.error) {
        return transcriptResult;
    }

    logDebug(`[DEBUG] Node 2: Summarizing transcript via LLM...`);
    const systemPrompt = "You are a Video Analyst. Read the following YouTube transcript or video metadata and extract the core message and top 3-5 key takeaways as bullet points. Keep it highly concise.";

    try {
        // Pass to LLM
        const fullPrompt = `${systemPrompt}\n\nTranscript or Metadata:\n${transcriptResult.content}`;
        const summary = await prompt(fullPrompt);
        logDebug(`[DEBUG] Node 3: Summarization complete.`);

        return {
            source: transcriptResult.source,
            summary: summary.text.trim()
        };
    } catch (e) {
        logDebugError(`[DEBUG] Node 2 Error: LLM summarization failed -> ${e.message}`);
        return { error: `Failed to summarize: ${e.message}` };
    }
}
