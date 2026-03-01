import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF_PATH = path.join(__dirname, '../../HANDOFF.json');
const TASKS_PATH = path.join(__dirname, '../../TEAM_TASKS.md');

/**
 * Switch persona and pass context to next role
 */
export async function handoff_to(args) {
    const { role, context } = args;

    // Validate role against known team roles
    const VALID_ROLES = ['architect', 'coder', 'designer', 'qa', 'team lead',
        'team-architect', 'team-coder', 'team-designer', 'team-qa'];
    const normalizedRole = role.toLowerCase().trim();

    if (!VALID_ROLES.includes(normalizedRole)) {
        return {
            error: `Invalid role "${role}". Valid roles are: architect, coder, designer, qa.`
        };
    }

    const handoff = {
        to: normalizedRole,
        timestamp: new Date().toISOString(),
        context: context
    };

    fs.writeFileSync(HANDOFF_PATH, JSON.stringify(handoff, null, 2));

    const modeKey = normalizedRole.startsWith('team-') ? normalizedRole : `team-${normalizedRole}`;

    return {
        status: 'success',
        message: `Handoff to ${normalizedRole} initiated with context.`,
        next_mode: modeKey,
        auto_continue: true
    };
}

/**
 * Delegate a task to a specific role
 */
export async function delegate_task(args) {
    const { role, task } = args;
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

    if (fs.existsSync(TASKS_PATH)) {
        status += "\n### Pending Tasks:\n" + fs.readFileSync(TASKS_PATH, 'utf-8');
    }

    return { status_report: status };
}
