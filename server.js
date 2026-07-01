const express = require('express');
const axios = require('axios');
const { pipeline } = require('stream');
const app = express();

app.get('/stream', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('Missing stream URL');
    }

    const controller = new AbortController();
    
    // Kill the target fetch immediately if the user closes the player/tab
    req.on('close', () => {
        controller.abort();
    });

    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                // Accept range headers if the player requests a specific chunk of the audio/video
                'Range': req.headers.range || '' 
            }
        });

        // 1. Pass down vital streaming headers
        if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);
        if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
        if (response.headers['content-range']) res.setHeader('Content-Range', response.headers['content-range']);
        if (response.headers['accept-ranges']) res.setHeader('Accept-Ranges', response.headers['accept-ranges']);

        // Set status code based on what the source stream returned (e.g., 206 Partial Content)
        res.status(response.status);

        // 2. Stream the chunks to the browser smoothly
        pipeline(response.data, res, (err) => {
            if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
                console.error('Stream transmission broken:', err.message);
            }
        });

    } catch (error) {
        if (axios.isCancel(error)) return;
        
        console.error('Target stream unreachable:', error.message);
        if (!res.headersSent) {
            res.status(500).send('Unable to fetch media stream.');
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Secure Stream Proxy on port ${PORT}`));
