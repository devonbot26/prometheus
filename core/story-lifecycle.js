import fs from 'fs';
import path from 'path';
import { promoteToRegistry, demoteStory } from './port-router.js';

const REGISTRY_PATH = path.join(process.cwd(), 'config/success_stories.json');

/**
 * Tiered Devon Story Lifecycle (R3/R4)
 * Manages the promotion and demotion of tasks between Reasoner (9B) and Worker (2B).
 */

export function handlePromotion(details) {
    const { id, intent, description, keywords, tools, reactions, complexity } = details;
    
    const newStory = {
        id: id || `story_${Date.now()}`,
        intent,
        description,
        keywords: keywords || [],
        tools: tools || [],
        reactions: reactions || [],
        complexity: complexity || 'low',
        strikes: 0,
        added_at: new Date().toISOString()
    };

    console.log(`🚀 [LIFECYCLE] Promoting task "${newStory.id}" to Worker Registry (Success Story).`);
    promoteToRegistry(newStory);
    return { status: 'promoted', id: newStory.id };
}

export function handleDemotion(storyId, reason) {
    console.log(`❌ [LIFECYCLE] Demoting task "${storyId}" due to failure. Reason: ${reason}`);
    
    // Increment strikes
    demoteStory(storyId);
    
    // Check if story should be removed entirely
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
    const story = registry.stories.find(s => s.id === storyId);
    
    if (story && story.strikes >= 3) {
        console.log(`🗑️ [LIFECYCLE] Story "${storyId}" reached strike limit. Removing from 2B registry.`);
        registry.stories = registry.stories.filter(s => s.id !== storyId);
        fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
        return { status: 'removed', id: storyId };
    }
    
    return { status: 'demoted', strikes: story ? story.strikes : 0 };
}
