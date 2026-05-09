import { LocalIndex } from 'vectra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, 'memory');

async function checkIndex() {
    const index = new LocalIndex(INDEX_PATH);
    if (!await index.isIndexCreated()) {
        console.log('Index not created.');
        return;
    }

    const items = await index.listItems();
    console.log(`Total items: ${items.length}`);
    items.forEach((item, i) => {
        console.log(`\nItem ${i} (ID: ${item.id}):`);
        console.log(`Text: ${item.metadata.text.substring(0, 100)}...`);
        console.log(`Topic: ${item.metadata.topic}`);
    });
}

checkIndex().catch(console.error);
