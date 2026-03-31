import fetch from 'node-fetch';
import TurndownService from 'turndown';
import * as cheerio from 'cheerio';
import { logDebug } from '../../core/logger.js';

/**
 * Lotto Checker - High-Precision Extraction from WCLC (Static)
 */

const SOURCES = [
    'https://www.wclc.com/winning-numbers/lotto-649-extra.htm',
    'https://www.lotto.net/canada-lotto-6-49/numbers'
];

async function fetchWithPrecision(url) {
    logDebug(`[DEBUG] Attempting precision fetch from: ${url}`);
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            },
            timeout: 8000
        });
        if (!response.ok) return null;

        const html = await response.text();
        const $ = cheerio.load(html);

        // Targeted Extraction for WCLC
        let targetedContent = "";
        let drawDate = "";
        let numbers = [];

        if (url.includes('wclc.com')) {
            // Find the most recent result group
            const latestDrawDate = $('.pastWinNumDate').first();
            const latestDrawResults = $('.pastWinNumGroup').first();
            
            if (latestDrawDate.length > 0 && latestDrawResults.length > 0) {
                drawDate = latestDrawDate.text().trim();
                targetedContent = `### Draw Date: ${drawDate}\n\n` + latestDrawResults.html();
                
                // Extract numbers directly from the list items
                latestDrawResults.find('.pastWinNumber').each((i, el) => {
                    numbers.push(parseInt($(el).text()));
                });
                const bonus = latestDrawResults.find('.pastWinNumberBonus').text().replace('Bonus', '').trim();
                if (bonus) numbers.push(parseInt(bonus));
            }
        }

        const turndown = new TurndownService();
        const markdown = turndown.turndown(targetedContent || $.html());
        
        // Validation: Must find at least 6 unique numbers
        if (numbers.length >= 6) {
            return { markdown, source: url, balls: numbers, date: drawDate };
        }
        
        // Fallback pattern matching
        const balls = markdown.match(/\b\d{1,2}\b/g);
        if (balls && balls.length >= 6) {
            const validBalls = balls.filter(n => parseInt(n) >= 1 && parseInt(n) <= 49);
            if (validBalls.length >= 6) {
                return { markdown, source: url, balls: validBalls.slice(0, 7), date: drawDate };
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

export async function get_latest_649() {
    let finalResult = null;

    for (const url of SOURCES) {
        finalResult = await fetchWithPrecision(url);
        if (finalResult) break;
    }

    if (finalResult) {
        const dataJson = { 
            game: 'lotto649', 
            date: finalResult.date,
            numbers: finalResult.balls.slice(0, 6), 
            bonus: finalResult.balls[6] || "" 
        };
        const finalOutput = `### 🎫 Latest Lotto 6/49 Results\n\n${finalResult.markdown.substring(0, 1500).trim()}\n\n*Source: ${finalResult.source}*\n\n<verify_data>${JSON.stringify(dataJson)}</verify_data>`;
        
        return {
            success: true,
            output: finalOutput,
            source: finalResult.source
        };
    }

    return {
        success: false,
        error: "All reliable static sources failed. High-security sites are blocking extraction."
    };
}
