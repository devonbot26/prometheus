import { handlePromotion, handleDemotion } from '../core/story-lifecycle.js';

/**
 * SKILL: Devon Lifecycle Management
 * Goal: Allow the 9B Reasoner to promote successful tasks to the 2B Worker or demote failures.
 */

export const meta = {
    name: "devon_lifecycle",
    description: "Manage the AI lifecycle by promoting successful task sequences (Action-Reaction) to the Worker model or demoting failures.",
    version: "1.0.0"
};

export async function promote_to_worker(args) {
    return handlePromotion(args);
}

export async function demote_from_worker(args) {
    return handleDemotion(args.storyId, args.reason);
}
