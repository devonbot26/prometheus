import { executePython } from '../../core/python-executor.js';

/**
 * python_run tool function
 */
export async function python_run(args, context) {
    const { code } = args;

    if (!code) {
        return { success: false, error: "Missing 'code' parameter." };
    }

    try {
        const result = executePython(code);
        
        if (result.success) {
            return {
                success: true,
                output: result.output.trim()
            };
        } else {
            return {
                success: false,
                blocked: result.blocked || false,
                error: result.error
            };
        }
    } catch (e) {
        return {
            success: false,
            error: `Sandbox Bridge Error: ${e.message}`
        };
    }
}
