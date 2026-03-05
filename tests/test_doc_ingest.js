import { convert_to_markdown } from '../skills/doc-ingestor/index.js';

(async () => {
    console.log("Testing PDF Extraction...");
    const pdfRes = await convert_to_markdown({ absolutePath: '/Users/nelsonwong/Documents/projects/Prometheus/test samples/Nelson Wong - NBCC- Course Registration Form FILLABLE.pdf' });
    console.log(pdfRes.substring(0, 300) + "\\n...[truncated]...\\n");

    console.log("Test execution completed successfully.");
})();
