/**
 * Centralized Logger for Prometheus
 * Manages verbose debug log visibility and heartbeat signals.
 */

let DEBUG_MODE = process.env.PROMETHEUS_DEBUG === 'true' || false;

/**
 * Log a debug message if DEBUG_MODE is ON.
 * Otherwise, output a '·' heartbeat signal.
 */
export function logDebug(...args) {
    if (DEBUG_MODE) {
        console.log(...args);
    } else {
        // Output a dot to stderr/stdout to show we are working without clutter
        process.stdout.write('·');
    }
}

/**
 * Log a debug error if DEBUG_MODE is ON.
 * Suppressed entirely when debug is OFF.
 */
export function logDebugError(...args) {
    if (DEBUG_MODE) {
        console.error(...args);
    }
}

/**
 * Toggle the debug mode state.
 * @returns {boolean} New debug state
 */
export function toggleDebug() {
    DEBUG_MODE = !DEBUG_MODE;
    return DEBUG_MODE;
}

/**
 * Check if debug mode is currently ON.
 */
export function isDebugOn() {
    return DEBUG_MODE;
}
