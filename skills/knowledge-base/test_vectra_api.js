import { LocalIndex } from 'vectra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, 'memory');

async function testVectraAPI() {
    const index = new LocalIndex(INDEX_PATH);
    console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(index)));
}

testVectraAPI().catch(console.error);
