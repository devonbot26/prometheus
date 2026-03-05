const xlsx = require('xlsx');

// Create a dummy workbook with VBA
const wb = xlsx.utils.book_new();
const ws = xlsx.utils.aoa_to_sheet([["A", "B"], [1, 2]]);
xlsx.utils.book_append_sheet(wb, ws, "Sheet1");

// NOTE: Creating a macro-enabled workbook from scratch with valid VBA is complex
// in 'xlsx' community edition, it mainly extracts existing VBA.

// Let's check the docs for extracting VBA
console.log("To extract VBA from an existing .xlsm:");
console.log("const workbook = xlsx.readFile('file.xlsm', { bookVBA: true });");
console.log("if (workbook.vbaraw) { ... save workbook.vbaraw to a file } else { console.log('No VBA found'); }");
