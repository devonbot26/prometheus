import crypto from 'crypto';
import fetch from 'node-fetch';
import { logDebug, logDebugError } from '../../core/logger.js';

/**
 * Twitter (X) API Skill
 * Interface for posting and searching tweets using V2 API.
 */

// Configuration
const API_KEY = process.env.TWITTER_API_KEY?.trim();
const API_SECRET = process.env.TWITTER_API_SECRET?.trim();
const ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN?.trim();
const ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET?.trim();

/**
 * Helper: RFC 3986 Strict Encoding
 * encodeURIComponent leaves !'()* unencoded, but OAuth 1.0a requires them encoded.
 */
function rfc3986(str) {
    if (typeof str !== 'string') str = String(str);
    return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Helper: Generate OAuth 1.0a Authorization Header
 * Required for X API V2 POST requests when using User Context.
 */
function getOAuthHeader(method, url, params = {}) {
    logDebug(`[DEBUG] getOAuthHeader keys: API=${API_KEY?.substring(0, 4)}, ACCESS=${ACCESS_TOKEN?.substring(0, 4)}`);
    if (!API_KEY || !API_SECRET || !ACCESS_TOKEN || !ACCESS_SECRET) {
        throw new Error("Missing Twitter API credentials in .env");
    }

    const oauth_params = {
        oauth_consumer_key: API_KEY,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: ACCESS_TOKEN,
        oauth_version: '1.0',
        ...params
    };

    // 1. Collect and Sort Params
    const sortedKeys = Object.keys(oauth_params).sort();
    const parameterString = sortedKeys
        .map(key => `${rfc3986(key)}=${rfc3986(oauth_params[key])}`)
        .join('&');

    // 2. Create Signature Base String
    const baseString = [
        method.toUpperCase(),
        rfc3986(url),
        rfc3986(parameterString)
    ].join('&');

    logDebug(`[DEBUG] OAuth Base String: ${baseString}`);

    // 3. Create Signing Key
    const signingKey = [
        rfc3986(API_SECRET),
        rfc3986(ACCESS_SECRET)
    ].join('&');

    // 4. Calculate HMAC-SHA1 Signature
    const signature = crypto
        .createHmac('sha1', Buffer.from(signingKey))
        .update(Buffer.from(baseString))
        .digest('base64');

    oauth_params.oauth_signature = signature;

    // 5. Build Header String
    const headerString = 'OAuth ' + Object.keys(oauth_params)
        .sort()
        .map(key => `${rfc3986(key)}="${rfc3986(oauth_params[key])}"`)
        .join(', ');

    return headerString;
}

/**
 * Tool: post_tweet
 */
export async function post_tweet(args) {
    const { text } = args;

    if (!text || text.length > 280) {
        return { error: "Tweet text must be between 1 and 280 characters." };
    }

    const url = 'https://api.twitter.com/2/tweets';

    try {
        logDebug(`[DEBUG] Posting tweet: "${text.substring(0, 30)}..."`);

        const authHeader = getOAuthHeader('POST', url);
        logDebug(`[DEBUG] Auth Header: ${authHeader}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'User-Agent': 'PrometheusAssistant/1.0'
            },
            body: JSON.stringify({ text })
        });

        const data = await response.json();

        if (response.ok) {
            return {
                success: true,
                tweet_id: data.data.id,
                text: data.data.text,
                url: `https://twitter.com/user/status/${data.data.id}`
            };
        } else {
            logDebugError(`[ERROR] X API Response (${response.status}):`, JSON.stringify(data));
            const errorType = response.status === 429 ? "RATE_LIMIT" : "API_ERROR";
            return {
                error: `Twitter API Error (${response.status}): ${JSON.stringify(data)}`,
                error_type: errorType,
                hint: response.status === 429 ? "Rate limit reached. Wait a few minutes." : "Check your API credentials.",
                details: data
            };
        }
    } catch (e) {
        logDebugError(`[DEBUG] post_tweet failed: ${e.message}`);
        return { error: `Network error: ${e.message}` };
    }
}

/**
 * Tool: search_tweets
 */
export async function search_tweets(args) {
    const { query } = args;
    if (!query) return { error: "Missing query parameter." };

    // Search uses Bearer token for simpler access if preferred, 
    // but we can use OAuth 1.0a for consistency with User Context.
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=10&tweet.fields=created_at,author_id`;

    try {
        logDebug(`[DEBUG] Searching tweets for: ${query}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': getOAuthHeader('GET', url.split('?')[0], { query }),
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok && data.data) {
            // Simplified format for token efficiency
            const simplified = data.data.slice(0, 5).map(t => ({
                date: t.created_at,
                text: t.text
            }));

            return {
                query,
                results: simplified,
                note: "Showing top 5 results to save context tokens."
            };
        } else {
            return { error: `Search failed: ${JSON.stringify(data)}` };
        }
    } catch (e) {
        return { error: e.message };
    }
}

/**
 * Tool: get_user_tweets
 */
export async function get_user_tweets(args) {
    const { username } = args;
    if (!username) return { error: "Missing username." };

    try {
        // Step 1: Resolve username to ID
        const userUrl = `https://api.twitter.com/2/users/by/username/${username.replace('@', '')}`;
        const userRes = await fetch(userUrl, {
            method: 'GET',
            headers: { 'Authorization': getOAuthHeader('GET', userUrl) }
        });
        const userData = await userRes.json();

        if (!userRes.ok || !userData.data) {
            return { error: `Could not find user ${username}: ${JSON.stringify(userData)}` };
        }

        const userId = userData.data.id;

        // Step 2: Get tweets
        const tweetUrl = `https://api.twitter.com/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at`;
        const tweetRes = await fetch(tweetUrl, {
            method: 'GET',
            headers: { 'Authorization': getOAuthHeader('GET', tweetUrl) }
        });
        const tweetData = await tweetRes.json();

        if (tweetRes.ok && tweetData.data) {
            return {
                username,
                tweets: tweetData.data.map(t => ({ date: t.created_at, text: t.text }))
            };
        } else {
            return { error: `Failed to fetch tweets: ${JSON.stringify(tweetData)}` };
        }
    } catch (e) {
        return { error: e.message };
    }
}

/**
 * Tool: trend_intelligence
 * Combines search results to provide a high-level view of what's trending.
 */
export async function trend_intelligence(args) {
    const { topic } = args;
    logDebug(`[DEBUG] Running trend intelligence for: ${topic}`);

    // In a real scenario, this would call search_tweets and reddit-observer
    // For Phase 1, we provide a structured template for the agent to fill.
    return {
        topic,
        analysis: "Combine search_tweets and reddit_observer to find high-engagement hooks.",
        strategy: "Draft a thread summarizing the top 3 insights found online."
    };
}

/**
 * Internal Logic: sentiment_gatekeeper
 * (Can be called by the agent to double-check a draft).
 */
export async function sentiment_gatekeeper(args) {
    const { draft } = args;
    const banned = ['spam', 'buy now', 'click here']; // Simple example
    const containsBanned = banned.some(word => draft.toLowerCase().includes(word));

    return {
        safe: !containsBanned,
        reason: containsBanned ? "Draft contains promotional 'spam' keywords." : "Draft is safe for posting."
    };
}

/**
 * Tool: get_me
 * Minimal test to see if credentials work at all.
 */
export async function get_me() {
    const url = 'https://api.twitter.com/2/users/me';
    try {
        const authHeader = getOAuthHeader('GET', url);
        logDebug(`[DEBUG] Auth Header: ${authHeader}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'User-Agent': 'PrometheusAssistant/1.0'
            }
        });
        const data = await response.json();
        return { status: response.status, data };
    } catch (e) {
        return { error: e.message };
    }
}
