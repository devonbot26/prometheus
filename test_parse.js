const text = `<tool_call>\n{"tool": "get_weather", "args": {}}\n</tool_call>`;

function extractToolCall(text) {
        try {
            // Normalize: handle <tool_call> tags and remove <think> blocks
            let cleanText = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            cleanText = cleanText.replace(/<tool_call>/gi, '').replace(/<\/tool_call>/gi, '');

            // Try markdown blocks first
            const blockMatch = cleanText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
            if (blockMatch) {
                try {
                    const parsed = JSON.parse(blockMatch[1]);
                    if (parsed.tool) return parsed;
                } catch (e) {
                }
            }

            // Fallback: Intelligent Brace Matcher avoiding strings
            const inlineMatch = cleanText.match(/\{[\s\n]*"tool"[\s\n]*:[\s\n]*"[^"]+"/);
            if (inlineMatch) {
                const start = cleanText.indexOf(inlineMatch[0]); // Look in cleanText, not raw text
                let depth = 0;
                let end = start;
                let inString = false;
                let isEscaped = false;

                for (let i = start; i < cleanText.length; i++) {
                    const char = cleanText[i];

                    if (char === '\\') {
                        isEscaped = !isEscaped;
                    } else {
                        if (char === '"' && !isEscaped) {
                            inString = !inString;
                        } else if (!inString) {
                            if (char === '{') depth++;
                            if (char === '}') depth--;
                        }
                        isEscaped = false;
                    }

                    if (depth === 0 && char === '}') {
                        end = i + 1;
                        break;
                    }
                }

                if (end > start) {
                    try {
                        const extracted = cleanText.substring(start, end);
                        const parsed = JSON.parse(extracted);
                        if (parsed.tool) return parsed;
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
            return null;
        } catch (error) {
            return null;
        }
}
console.log(extractToolCall(text));
