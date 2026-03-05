import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
});
turndownService.use(gfm);

/**
 * Convert DOCX to Markdown
 */
async function convertDocx(filePath) {
    try {
        const result = await mammoth.convertToHtml({ path: filePath });
        const html = result.value;
        const markdown = turndownService.turndown(html);
        return markdown;
    } catch (error) {
        throw new Error(`DOCX Conversion Error: ${error.message}`);
    }
}

/**
 * Convert PDF to Markdown
 */
async function convertPdf(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const parser = new PDFParse({ data: dataBuffer });
        const result = await parser.getText();
        return result.text;
    } catch (error) {
        throw new Error(`PDF Conversion Error: ${error.message}`);
    }
}

/**
 * Main CLI Logic
 */
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log("🚀 Node.js MarkItDown PoC");
        console.log("Usage: node scripts/markitdown_poc.js <input_file>");
        return;
    }

    const inputPath = path.resolve(args[0]);
    if (!fs.existsSync(inputPath)) {
        console.error(`❌ File not found: ${inputPath}`);
        return;
    }

    const ext = path.extname(inputPath).toLowerCase();
    let markdown = "";

    console.log(`⏳ Converting ${path.basename(inputPath)}...`);

    try {
        if (ext === '.docx') {
            markdown = await convertDocx(inputPath);
        } else if (ext === '.pdf') {
            markdown = await convertPdf(inputPath);
        } else {
            console.error(`❌ Unsupported format: ${ext}. Only .docx and .pdf are supported in this PoC.`);
            return;
        }

        const outputPath = inputPath.replace(ext, '.md');
        fs.writeFileSync(outputPath, markdown);
        console.log(`✅ Success! Markdown saved to: ${outputPath}`);
        console.log("\n--- PREVIEW (First 500 chars) ---");
        console.log(markdown.substring(0, 500) + "...");
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
    }
}

main();
