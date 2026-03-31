/**
 * Prometheus Traffic Analyzer
 * Compresses raw network traces from Puppeteer/Playwright into a 
 * "Signature Map" suitable for local LLM context windows.
 */

export class TrafficAnalyzer {
    constructor() {
        this.requests = [];
    }

    /**
     * Records a new request/response pair
     */
    addRecord(request, response) {
        this.requests.push({
            url: request.url(),
            method: request.method(),
            postData: request.postData(),
            status: response ? response.status() : 0,
            contentType: response ? response.headers()['content-type'] : null
        });
    }

    /**
     * Condenses the recorded traffic into a unique signature map
     */
    getSignatureMap() {
        const signatures = {};

        for (const req of this.requests) {
            // Normalize URL by removing query params and IDs
            const url = new URL(req.url);
            const path = url.origin + url.pathname.replace(/\d+/g, '{id}');
            
            const sigKey = `${req.method}:${path}`;

            if (!signatures[sigKey]) {
                signatures[sigKey] = {
                    count: 0,
                    methods: new Set([req.method]),
                    contentTypes: new Set([req.contentType]).filter(Boolean),
                    hasPostData: !!req.postData
                };
            }

            signatures[sigKey].count++;
        }

        // Convert sets for JSON serialization
        return Object.entries(signatures).map(([key, sig]) => ({
            endpoint: key.split(':')[1],
            method: Array.from(sig.methods)[0],
            types: Array.from(sig.contentTypes),
            is_api: sig.contentTypes.some(t => t.includes('json')),
            calls: sig.count
        }));
    }

    clear() {
        this.requests = [];
    }
}
