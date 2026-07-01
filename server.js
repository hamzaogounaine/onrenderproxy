const express = require('express');
const axios = require('axios');
const { pipeline } = require('stream');
const app = express();

// Enable CORS so your web player can fetch the manifest
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.get('/stream', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing target URL');

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    try {
        const isM3U8 = targetUrl.includes('.m3u8');

        const response = await axios({
            method: 'get',
            url: targetUrl,
            // If it's a text manifest, parse as text to rewrite it. Otherwise, treat as a binary stream (.ts)
            responseType: isM3U8 ? 'text' : 'stream',
            signal: controller.signal,
            maxRedirects: 5, // Follow the redirect from freeiptv.ottc.xyz automatically
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        // Track the final URL after redirects (e.g., http://5.253.86.12/.../play.m3u8)
        const finalTargetUrl = response.request.res.responseUrl || targetUrl;
        const parsedBase = new URL(finalTargetUrl);
        const baseUrl = `${parsedBase.protocol}//${parsedBase.host}`;

        if (isM3U8) {
            let manifestText = response.data;
            
            // Build the absolute base path context for relative links in the file
            // e.g., http://5.253.86.12/4d71d85dc9846a6381e91b97fd10fd8c/1782922864/t2/4a90f9a1.../
            const basePath = finalTargetUrl.substring(0, finalTargetUrl.lastIndexOf('/') + 1);

            // Rewrite lines that don't start with '#' (these are the chunk links)
            const lines = manifestText.split('\n').map(line => {
                line = line.trim();
                if (!line || line.startsWith('#')) return line;

                let absoluteChunkUrl = line;
                if (!line.startsWith('http')) {
                    if (line.startsWith('/')) {
                        absoluteChunkUrl = baseUrl + line;
                    } else {
                        absoluteChunkUrl = basePath + line;
                    }
                }

                // Rewrite the link to loop back through your HTTPS proxy
                const myHost = `${req.protocol}://${req.get('host')}`;
                return `${myHost}/stream?url=${encodeURIComponent(absoluteChunkUrl)}`;
            });

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            return res.send(lines.join('\n'));
        }

        // --- Handling the Binary (.ts) Chunks ---
        if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);
        if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);

        pipeline(response.data, res, (err) => {
            if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
                console.error('Chunk pipeline failed:', err.message);
            }
        });

    } catch (error) {
        if (axios.isCancel(error)) return;
        console.error('Proxy Error:', error.message);
        if (!res.headersSent) res.status(500).send('Proxy processing failed.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`IPTV Manifest rewriter running on port ${PORT}`));
