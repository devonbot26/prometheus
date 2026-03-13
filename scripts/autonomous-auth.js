
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

async function startAutonomousAuth() {
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

        const PORT = 80; // Standard for http://localhost
        const FALLBACK_PORT = 3000;

        const startServer = (port) => {
            const server = http.createServer(async (req, res) => {
                try {
                    const parsedUrl = url.parse(req.url, true);
                    if (parsedUrl.query.code) {
                        const code = parsedUrl.query.code;
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end('<h1>✅ Success!</h1><p>Captured! You can close this window.</p>');

                        console.log(`\n⏳ Code captured via listener on port ${port}.`);
                        const { tokens } = await oAuth2Client.getToken(code);
                        await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
                        console.log('\n✅ [SUCCESS] New token saved to config/token.json');

                        server.close();
                        process.exit(0);
                    } else {
                        res.writeHead(200);
                        res.end('Awaiting code...');
                    }
                } catch (err) {
                    res.writeHead(500);
                    res.end('Error');
                }
            });

            server.listen(port, () => {
                console.log(`\n🚀 [AUTONOMOUS GMAIL AUTHENTICATION]`);
                console.log(`📡 Listener active on http://localhost:${port}`);
                console.log('\n🔗 Please open this URL in your browser:');
                console.log('\x1b[36m%s\x1b[0m', authUrl);
                console.log('\nOnce you sign in, I will automatically capture the code.');
            });

            server.on('error', (e) => {
                if (e.code === 'EACCES' && port === 80) {
                    console.log('⚠️  Port 80 requires sudo. Falling back to port 3000...');
                    startServer(FALLBACK_PORT);
                } else if (e.code === 'EADDRINUSE') {
                    console.error(`❌ Port ${port} is in use.`);
                    process.exit(1);
                } else {
                    console.error('Server error:', e.message);
                    process.exit(1);
                }
            });
        };

        startServer(PORT);

    } catch (e) {
        console.error('❌ [ERROR] Fatal:', e.message);
        process.exit(1);
    }
}

startAutonomousAuth();
