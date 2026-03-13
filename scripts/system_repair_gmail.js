
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import url from 'url';

const CREDENTIALS_PATH = path.join(process.cwd(), 'config', 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'config', 'token.json');
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/drive.file'
];

async function runAutonomousRepair() {
    try {
        const content = await fs.readFile(CREDENTIALS_PATH);
        const keys = JSON.parse(content);
        const key = keys.installed || keys.web;
        const { client_secret, client_id, redirect_uris } = key;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent'
        });

        // We'll try port 80, then 3000
        const startServer = (port) => {
            const server = http.createServer(async (req, res) => {
                try {
                    const parsedUrl = url.parse(req.url, true);
                    if (parsedUrl.query.code) {
                        const code = parsedUrl.query.code;
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end('<h1>✅ Success!</h1><p>Auth code captured. Prometheus is now restoring access...</p>');

                        const { tokens } = await oAuth2Client.getToken(code);
                        await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));

                        console.log('✅ [SUCCESS] Token updated.');
                        server.close();
                        process.exit(0);
                    } else {
                        res.writeHead(200);
                        res.end('Awaiting authorization...');
                    }
                } catch (err) {
                    console.error('Request Error:', err.message);
                }
            });

            server.listen(port, () => {
                // This is the CRITICAL line the agent parses
                console.log(`AUTH_URL: ${authUrl}`);
                console.log(`LISTENER_PORT: ${port}`);
            });

            server.on('error', (e) => {
                if ((e.code === 'EACCES' || e.code === 'EADDRINUSE') && port === 80) {
                    console.log(`⚠️ Port 80 unavailable (${e.code}), falling back to 8080...`);
                    startServer(8080); // Safer fallback
                } else {
                    console.error('Server error:', e.message);
                    process.exit(1);
                }
            });
        };

        startServer(80);

    } catch (e) {
        console.error('Fatal Error:', e.message);
        process.exit(1);
    }
}

runAutonomousRepair();
