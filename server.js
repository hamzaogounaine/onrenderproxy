const express = require('express');
const axios = require('axios');
const app = express();

app.get('/stream', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('Missing target URL');
    }

    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        res.setHeader('Content-Type', response.headers['content-type']);
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }

        response.data.pipe(res);

    } catch (error) {
        console.error('Error fetching stream:', error.message);
        res.status(500).send('Stream proxy error');
    }
});

// Render dynamically assigns a port via process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));