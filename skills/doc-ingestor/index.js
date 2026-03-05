import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import xlsx from 'xlsx';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
});
turndownService.use(gfm);

function applySafeguards(text) {
    const isLocalModel = process.env.LLM_MODEL && process.env.LLM_MODEL.includes('Qwen');
    const MAX_CHARS = isLocalModel ? 100000 : Number.MAX_SAFE_INTEGER;

    if (text.length > MAX_CHARS) {
        return text.substring(0, MAX_CHARS) + '\n\n--- [WARNING: DOCUMENT TRUNCATED TO PROTECT CONTEXT WINDOW] ---';
    }
    return text;
}

export async function convert_to_markdown(args) {
    try {
        const file_path = args.absolutePath;
        if (!file_path) {
            return "Terminal Failure: Missing absolutePath parameter.";
        }

        if (!fs.existsSync(file_path)) {
            return `Terminal Failure: File not found at ${file_path}`;
        }

        const stats = fs.statSync(file_path);
        if (stats.size > MAX_FILE_SIZE) {
            return `Terminal Failure: File too large for processing (${(stats.size / 1024 / 1024).toFixed(2)} MB). Max allowed is 25 MB.`;
        }

        const ext = path.extname(file_path).toLowerCase();
        let markdownOutput = "";

        if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(file_path);
            const parser = new PDFParse({ data: dataBuffer });
            const result = await parser.getText();
            markdownOutput = result.text;
        } else if (ext === '.docx') {
            const result = await mammoth.convertToHtml({ path: file_path });
            markdownOutput = turndownService.turndown(result.value);
        } else if (ext === '.txt' || ext === '.md') {
            markdownOutput = fs.readFileSync(file_path, 'utf8');
        } else if (ext === '.xlsx' || ext === '.xlsm' || ext === '.numbers' || ext === '.csv') {
            const workbook = xlsx.readFile(file_path, { bookVBA: true });
            let output = "";
            for (const sheetName of workbook.SheetNames) {
                output += `### Sheet: ${sheetName}\n\n`;
                const worksheet = workbook.Sheets[sheetName];
                const csv = xlsx.utils.sheet_to_csv(worksheet);
                const lines = csv.split('\n').filter(line => line.trim() !== '');
                if (lines.length > 0) {
                    const headers = lines[0].split(',');
                    let mdTable = '| ' + headers.join(' | ') + ' |\n';
                    mdTable += '|' + headers.map(() => '---').join('|') + '|\n';

                    for (let i = 1; i < lines.length; i++) {
                        const row = lines[i].split(',');
                        mdTable += '| ' + row.join(' | ') + ' |\n';
                    }
                    output += mdTable + '\n\n';
                }
            }

            if (ext === '.xlsm' && workbook.vbaraw) {
                output += `\n### VBA Macros\n\n\`\`\`vba\n`;
                output += `[VBA Macro Binary Payload Extracted. Raw length: ${workbook.vbaraw.length} bytes]\n`;
                output += `\`\`\`\n`;
            }
            markdownOutput = output;
        } else {
            return `Terminal Failure: Unsupported file type '${ext}'`;
        }

        return applySafeguards(markdownOutput);

    } catch (e) {
        return `Terminal Failure: Failed to process document. Details: ${e.message}`;
    }
}
