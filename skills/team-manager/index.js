import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logAction } from '../../core/action-logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF_PATH = path.join(__dirname, '../../HANDOFF.json');
const TASKS_PATH = path.join(__dirname, '../../TEAM_TASKS.md');

const PM_STATE_PATH = path.join(__dirname, '../../PM_STATE.json');

/**
 * Helper to discover valid roles from static list + dynamic roles folder
 */
function getValidRoles() {
    const BASE_ROLES = ['architect', 'coder', 'designer', 'qa', 'researcher', 'team lead',
        'team-architect', 'team-coder', 'team-designer', 'team-qa', 'team-researcher'];

    try {
        const rolesDir = path.resolve(__dirname, '../../roles');
        if (fs.existsSync(rolesDir)) {
            const files = fs.readdirSync(rolesDir).filter(f => f.endsWith('.md'));
            for (const file of files) {
                const roleName = file.replace('.md', '').replace(/^team-/, '');
                // Add both short and team- prefixed versions to validation
                if (!BASE_ROLES.includes(roleName)) BASE_ROLES.push(roleName);
                if (!BASE_ROLES.includes(`team-${roleName}`)) BASE_ROLES.push(`team-${roleName}`);
            }
        }
    } catch (err) {
        // Fallback to BASE_ROLES if file system error
    }
    return BASE_ROLES;
}

export async function handoff_to(args) {
    const role = args?.role || "coder";
    const context = args?.context || "No context provided";

    // Validate role against known team roles (Dynamic)
    const VALID_ROLES = getValidRoles();
    const normalizedRole = role.toLowerCase().trim();

    if (!VALID_ROLES.includes(normalizedRole)) {
        return {
            error: `Invalid role "${role}". Valid roles discovery includes: ${VALID_ROLES.slice(0, 10).join(', ')}...`
        };
    }

    // Step 3: Prevent Infinite Critique Loops by tracking retry_count
    let currentRetryCount = 0;
    if (fs.existsSync(HANDOFF_PATH)) {
        try {
            const oldHandoff = JSON.parse(fs.readFileSync(HANDOFF_PATH, 'utf-8'));
            // If the PM is sending it back to the SAME role that just returned it, increment retry
            // Remember: oldHandoff.from_role might be "team-coder", but normalizedRole is "coder"
            const oldFromBase = oldHandoff.from_role ? oldHandoff.from_role.replace('team-', '') : '';
            if (args?._caller_role === 'team-manager' && oldFromBase === normalizedRole.replace('team-', '')) {
                currentRetryCount = (oldHandoff.retry_count || 0) + 1;
            }
        } catch (e) { /* ignore parse error */ }
    }

    const handoff = {
        to: normalizedRole,
        from_role: args?._caller_role || 'unknown',
        timestamp: new Date().toISOString(),
        context: context,
        return_to: 'team-manager', // Enforce auto-return to PM
        retry_count: currentRetryCount
    };

    fs.writeFileSync(HANDOFF_PATH, JSON.stringify(handoff, null, 2));

    let logMessage = `Delegated control to ${normalizedRole}: "${context.substring(0, 100)}..."`;
    if (args?._caller_role && args?._caller_role !== 'team-manager') {
        logMessage = `Returned control from ${args._caller_role} to ${normalizedRole}: "${context.substring(0, 100)}..."`;
    }
    logAction("PM_HANDOFF", logMessage, args?._caller_role || "team-manager");

    const modeKey = normalizedRole.startsWith('team-') ? normalizedRole : `team-${normalizedRole}`;

    return {
        status: 'success',
        message: `Handoff to ${normalizedRole} initiated with context.`,
        next_mode: modeKey,
        auto_continue: true
    };
}

/**
 * Delegate a task to a specific role (Without Handoff)
 */
export async function delegate_task(args) {
    const role = args?.role || "coder";
    const task = args?.task || "Unspecified task";
    const timestamp = new Date().toLocaleString();

    const taskEntry = `\n- [ ] **[${role}]** (${timestamp}): ${task}`;

    if (!fs.existsSync(TASKS_PATH)) {
        fs.writeFileSync(TASKS_PATH, '# Team Task Board\n');
    }

    fs.appendFileSync(TASKS_PATH, taskEntry);

    return {
        status: 'success',
        message: `Task delegated to ${role}.`
    };
}

/**
 * Save a multi-step plan for the PM to track
 */
export async function save_plan(args) {
    const plan_steps = args?.plan_steps || [];
    if (!Array.isArray(plan_steps) || plan_steps.length === 0) {
        return { error: "plan_steps must be a non-empty array of step objects." };
    }

    const state = {
        steps: plan_steps.map((s, index) => {
            // Handle new object format
            if (typeof s === 'object' && s !== null) {
                return {
                    id: s.step || index + 1,
                    description: s.task || s.description || "No task provided",
                    assignee: s.assignee || "team-coder",
                    status: 'pending',
                    result: null
                };
            }
            // Fallback for old string format
            return {
                id: index + 1,
                description: String(s),
                assignee: "team-coder", // Default fallback if not specified
                status: 'pending',
                result: null
            };
        }),
        current_step_id: 1,
        started_at: new Date().toISOString()
    };

    fs.writeFileSync(PM_STATE_PATH, JSON.stringify(state, null, 2));

    logAction("PLAN_SAVED", `Saved structured team plan with ${plan_steps.length} steps.`, "team-manager");

    return {
        status: 'success',
        message: `Saved structured plan with ${plan_steps.length} steps.`,
        state
    };
}

/**
 * Get the next pending step from the plan
 */
export async function get_next_step() {
    if (!fs.existsSync(PM_STATE_PATH)) {
        return { message: "No active plan found." };
    }

    const state = JSON.parse(fs.readFileSync(PM_STATE_PATH, 'utf-8'));
    const pendingSteps = state.steps.filter(s => s.status === 'pending');

    if (pendingSteps.length === 0) {
        return {
            message: "All steps complete!",
            plan_status: "complete",
            full_state: state
        };
    }

    const nextStep = pendingSteps[0];
    state.current_step_id = nextStep.id;
    fs.writeFileSync(PM_STATE_PATH, JSON.stringify(state, null, 2));

    return {
        step: nextStep,
        remaining_steps: pendingSteps.length - 1
    };
}

/**
 * Mark a step as complete or failed
 */
export async function mark_step_done(args) {
    const step_id = args?.step_id;
    const status = args?.status || 'completed';
    const result = args?.result || 'No details provided';

    if (step_id === undefined || step_id === null) {
        return { error: "Requires step_id" };
    }

    if (!fs.existsSync(PM_STATE_PATH)) {
        return { error: "No active plan found." };
    }

    const state = JSON.parse(fs.readFileSync(PM_STATE_PATH, 'utf-8'));
    const stepIndex = state.steps.findIndex(s => s.id === step_id);

    if (stepIndex === -1) {
        return { error: `Step ID ${step_id} not found.` };
    }

    state.steps[stepIndex].status = status;
    state.steps[stepIndex].result = result;

    fs.writeFileSync(PM_STATE_PATH, JSON.stringify(state, null, 2));

    return {
        message: `Step ${step_id} marked as ${status}.`,
        next_step: state.steps.find(s => s.status === 'pending') || null
    };
}

/**
 * Get current team status
 */
export async function get_team_status() {
    let status = "## Team Status\n";

    if (fs.existsSync(HANDOFF_PATH)) {
        const handoff = JSON.parse(fs.readFileSync(HANDOFF_PATH, 'utf-8'));
        status += `\n**Active Handoff:** To ${handoff.to} (at ${handoff.timestamp})\n`;
    } else {
        status += "\nNo active handoff context.\n";
    }

    if (fs.existsSync(PM_STATE_PATH)) {
        const pmState = JSON.parse(fs.readFileSync(PM_STATE_PATH, 'utf-8'));
        const pending = pmState.steps.filter(s => s.status === 'pending').length;
        const complete = pmState.steps.filter(s => s.status === 'completed').length;
        status += `\n### Active Plan:\n- Completed Steps: ${complete}\n- Pending Steps: ${pending}\n`;
    }

    if (fs.existsSync(TASKS_PATH)) {
        status += "\n### Pending Tasks:\n" + fs.readFileSync(TASKS_PATH, 'utf-8');
    }

    return { status_report: status };
}

/**
 * Monitor system resources (RAM)
 */
export async function monitor_resources() {
    const os = await import('os');
    const freeMB = Math.floor(os.freemem() / (1024 * 1024));
    const totalMB = Math.floor(os.totalmem() / (1024 * 1024));
    const usedMB = totalMB - freeMB;

    return {
        free_mb: freeMB,
        total_mb: totalMB,
        used_mb: usedMB,
        recommendation: freeMB < 1000 ? "Low RAM. Run tasks sequentially." : "Sufficient RAM. Can run parallel roles."
    };
}

/**
 * Set a task timer to avoid "never-ending" pending
 */
export async function set_task_timer(args) {
    const role = args?.role || "unspecified";
    const timeout_ms = args?.timeout_ms || 300000; // Default 5 mins
    const timestamp = new Date().getTime();
    const expiry = timestamp + timeout_ms;

    const TIMER_PATH = path.join(__dirname, '../../TASK_TIMERS.json');
    let timers = {};
    if (fs.existsSync(TIMER_PATH)) {
        timers = JSON.parse(fs.readFileSync(TIMER_PATH, 'utf-8'));
    }

    timers[role] = {
        started_at: timestamp,
        expires_at: expiry,
        timeout_ms
    };

    fs.writeFileSync(TIMER_PATH, JSON.stringify(timers, null, 2));

    return {
        status: 'success',
        message: `Timer set for ${role}. Expires in ${timeout_ms / 1000}s.`
    };
}

/**
 * Escalate task to 9B model
 */
export async function escalate_to_9b(args) {
    const reason = args?.reason || "Unspecified escalation reason";
    console.log(`🚀 [ESCALATION] Requested for reason: ${reason}`);

    // Hard RAM Guard
    const resStats = await monitor_resources();
    if (resStats.free_mb < 6000) {
        console.log(`❌ [ESCALATION BLOCKED] Insufficient RAM (${resStats.free_mb}MB free). Required: 6000MB.`);

        // Log Structured Escalation Failure
        const ESC_FAIL_PATH = path.join(__dirname, '../../logs/escalation_failures.json');
        let fails = [];
        if (fs.existsSync(ESC_FAIL_PATH)) {
            try { fails = JSON.parse(fs.readFileSync(ESC_FAIL_PATH, 'utf-8')); } catch (e) { }
        }
        fails.push({
            timestamp: new Date().toISOString(),
            reason: reason,
            error: "Insufficient RAM for 9B model",
            ram_at_failure_mb: resStats.free_mb,
            model_requested: "9B"
        });

        // Ensure logs directory exists
        const logsDir = path.dirname(ESC_FAIL_PATH);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        fs.writeFileSync(ESC_FAIL_PATH, JSON.stringify(fails, null, 2));

        return {
            status: 'denied',
            error: `Cannot escalate to 9B model. Insufficient RAM (${resStats.free_mb}MB free). You must stick to the 4B model or abort the task safely.`
        };
    }

    if (fs.existsSync(HANDOFF_PATH)) {
        const handoff = JSON.parse(fs.readFileSync(HANDOFF_PATH, 'utf-8'));
        handoff.requires_9b = true;
        handoff.escalation_reason = reason;
        fs.writeFileSync(HANDOFF_PATH, JSON.stringify(handoff, null, 2));
    }

    return {
        status: 'escalated',
        message: `Task escalated to 9B model. Reason: ${reason}`,
        next_mode: 'team-manager',
        deep_thinking: true
    };
}
/**
 * Helper to check and reset state if it's older than 24 hours
 */
function checkStaleState() {
    try {
        if (fs.existsSync(PM_STATE_PATH)) {
            const stats = fs.statSync(PM_STATE_PATH);
            const now = new Date().getTime();
            const modified = stats.mtimeMs;
            const hoursOld = (now - modified) / (1000 * 60 * 60);

            if (hoursOld > 24) {
                console.log(`🧹 [SYSTEM] Team state is ${Math.round(hoursOld)}h old. Auto-resetting for housekeeping.`);
                reset_team_state();
            }
        }
    } catch (e) { /* ignore */ }
}

// Run check on load
checkStaleState();

/**
 * Recover stalled tasks by scanning for expired timers and resetting those steps.
 */
export async function recover_stalled_task() {
    const TIMER_PATH = path.join(__dirname, '../../TASK_TIMERS.json');
    const results = { recovered: [], active: [], message: '' };

    if (!fs.existsSync(TIMER_PATH)) {
        results.message = 'No active timers found. Plan state appears healthy.';
        return results;
    }

    let timers = {};
    try {
        timers = JSON.parse(fs.readFileSync(TIMER_PATH, 'utf-8'));
    } catch (e) {
        return { error: 'Failed to parse TASK_TIMERS.json', message: e.message };
    }

    const now = Date.now();
    let stateChanged = false;

    for (const [role, timer] of Object.entries(timers)) {
        if (now > timer.expires_at) {
            // Timer expired — mark step for retry
            if (fs.existsSync(PM_STATE_PATH)) {
                const state = JSON.parse(fs.readFileSync(PM_STATE_PATH, 'utf-8'));
                const step = state.steps.find(s =>
                    s.assignee && s.assignee.replace('team-', '') === role.replace('team-', '')
                    && s.status === 'pending'
                );
                if (step) {
                    step.result = `TIMEOUT: No response after ${Math.round(timer.timeout_ms / 60000)} min. Reset for retry.`;
                    // Keep as pending so the PM picks it up again
                    stateChanged = true;
                    results.recovered.push({ role, step_id: step.id, task: step.description });
                    fs.writeFileSync(PM_STATE_PATH, JSON.stringify(state, null, 2));
                }
            }
            // Clear the expired timer entry
            delete timers[role];
        } else {
            const remainingSec = Math.round((timer.expires_at - now) / 1000);
            results.active.push({ role, remaining_seconds: remainingSec });
        }
    }

    fs.writeFileSync(TIMER_PATH, JSON.stringify(timers, null, 2));

    if (results.recovered.length > 0) {
        results.message = `Recovered ${results.recovered.length} stalled task(s). They are reset to pending and ready for re-delegation.`;
        logAction('TASK_RECOVERY', `Recovered stalled tasks: ${results.recovered.map(r => r.role).join(', ')}`, 'team-manager');
    } else {
        results.message = `No stalled tasks found. ${results.active.length} timer(s) still active.`;
    }

    return results;
}

/**
 * Reset all team management state files
 */
export async function reset_team_state() {
    const files = [HANDOFF_PATH, TASKS_PATH, PM_STATE_PATH, path.join(__dirname, '../../TASK_TIMERS.json')];
    let count = 0;
    for (const f of files) {
        if (fs.existsSync(f)) {
            fs.unlinkSync(f);
            count++;
        }
    }
    logAction("TEAM_RESET", `Cleared ${count} state files for clean startup.`, "team-manager");
    return {
        status: 'success',
        message: `Cleared ${count} state files. Team is now in clean state.`
    };
}
