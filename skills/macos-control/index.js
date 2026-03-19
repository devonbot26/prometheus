import { logDebug, logDebugError } from '../../core/logger.js';

/**
 * Helper to emit native actions to the dashboard and wait for result
 */
async function sendNativeAction(action, target = null) {
    if (!global.io) {
        return { error: "Native Dashboard is not connected. Please launch the PrometheusDashboard app." };
    }

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            global._nativeActionCallback = null; // Clean up on timeout
            resolve({ error: "Dashboard did not respond in 5s. Is the app open?" });
        }, 5000);

        // Register the callback for when the result comes back through web_server.js
        global._nativeActionCallback = (result) => {
            clearTimeout(timeout);
            resolve(result);
        };

        logDebug(`[MACOS-CONTROL] Emitting native_action: ${action}`);
        global.io.emit('native_action', { action, target });
    });
}

export async function open_app(args) {
    const appName = args.app_name || "";
    if (!appName) return { error: "No app name provided." };
    return await sendNativeAction('open_app', appName);
}

export async function run_applescript(args) {
    const script = args.script || "";
    if (!script) return { error: "No script provided." };
    return await sendNativeAction('run_applescript', script);
}

export async function get_clipboard() {
    return await sendNativeAction('get_clipboard');
}
