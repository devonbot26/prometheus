import { executePython } from '../core/python-executor.js';

console.log("🧪 Testing Python Sandbox Security & Execution...");

const cases = [
    {
        name: "Simple Math (Success)",
        code: "print(sum([x for x in range(101)]))",
        expected: "5050"
    },
    {
        name: "Security Block: OS System (Blocked)",
        code: "import os\nos.system('ls')",
        expectedError: "Security Violation: Import of 'os' is restricted."
    },
    {
        name: "Security Block: Subprocess (Blocked)",
        code: "from subprocess import Popen",
        expectedError: "Security Violation: Import from 'subprocess' is restricted."
    },
    {
        name: "Security Block: Restricted Built-in (exec)",
        code: "exec('print(1)')",
        expectedError: "Security Violation: Use of 'exec()' is restricted."
    },
    {
        name: "Security Block: Dunder Access (Blocked)",
        code: "print([].__class__)",
        expectedError: "Security Violation: Access to dunder attribute '__class__' is restricted."
    },
    {
        name: "Timeout (Blocked)",
        code: "import time\nwhile True:\n    time.sleep(1)",
        expected: null // Should timeout
    }
];

async function runTests() {
    for (const test of cases) {
        process.stdout.write(`🏃 [TEST] ${test.name}... `);
        
        try {
            const result = executePython(test.code);
            
            if (test.expectedError) {
                if (!result.success && result.error.includes(test.expectedError)) {
                    console.log("✅ PASSED (Blocked correctly)");
                } else {
                    console.log(`❌ FAILED (Expected block: ${test.expectedError}, Got: ${result.error || result.output})`);
                }
            } else if (test.name.includes("Timeout")) {
                 if (!result.success && (result.error.includes("timed out") || result.error.includes("ETIMEDOUT"))) {
                    console.log("✅ PASSED (Timed out correctly)");
                } else {
                    console.log(`❌ FAILED (Expected timeout, Got: ${result.error || result.output})`);
                }
            } else {
                if (result.success && result.output.trim() === test.expected) {
                    console.log("✅ PASSED (Output correct)");
                } else {
                    console.log(`❌ FAILED (Expected: ${test.expected}, Got: ${result.output || result.error})`);
                }
            }
        } catch (e) {
            console.log(`💥 CRASHED: ${e.message}`);
        }
    }
}

runTests();
