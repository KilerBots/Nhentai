const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const PDFDocument = require('pdfkit');
const app = express();
const port = 7860;

async function toPDF(images, opt = {}) {
    return new Promise(async (resolve, reject) => {
        if (!Array.isArray(images)) images = [images];
        let buffs = [], doc = new PDFDocument({ margin: 0, size: 'A4' });
        for (let x = 0; x < images.length; x++) {
            if (!images[x]) continue;
            try {
                let data = (await axios.get(images[x], { responseType: 'arraybuffer', ...opt })).data;
                doc.image(data, 0, 0, { fit: [595.28, 841.89], align: 'center', valign: 'center' });
                if (images.length !== x + 1) doc.addPage();
            } catch (err) {
                console.error('Failed to fetch image:', images[x], err.message);
            }
        }
        doc.on('data', (chunk) => buffs.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffs)));
        doc.on('error', (err) => reject(err));
        doc.end();
    });
}

async function nhentaiDL(id) {
    const html = await axios.get(`https://nhentai.net/g/${id}`);
    const $ = cheerio.load(html.data);
    const match = html.data.match(/JSON\.parse\((['"`])(.+?)\1\)/);

    let images = [];
    $('.thumb-container').each((i, el) => {
        let url = $(el).find('.lazyload').attr('data-src').replace('https://t', 'https://i').replace((i + 1) + 't', (i + 1));
        images.push(url);
    });

    if (match) {
        let json = match[2].replace(/\\"/g, '"').replace(/\\u([\dA-Fa-f]{4})/g, (m, g) => String.fromCharCode(parseInt(g, 16)));
        let data = JSON.parse(json);
        data.images.pages = images;
        data.images.cover = $('meta[itemprop="image"]').attr('content');
        data.images.thumbnail = $('meta[itemprop="image"]').attr('content').replace('cover', 'thumb');
        data.tags = data.tags.map(tags => tags.name);
        return data;
    }
}

async function nhentaiSearch(query) {
    try {
        const { data } = await axios.get(`https://nhentai.net/search/?q=${query}`);
        const $ = cheerio.load(data);
        const result = [];
        $('.gallery').each((i, el) => {
            result.push({
                title: $(el).find('.caption').text().trim(),
                thumb: $(el).find('.lazyload').attr("data-src").trim(),
                link: 'https://nhentai.net' + $(el).find('a').attr("href").trim(),
            });
        });
        return result;
    } catch (e) {
        console.log(e);
        return [];
    }
}

app.get('/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter q is required' });
    const results = await nhentaiSearch(q);
    res.json(results);
});

app.get('/download/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const data = await nhentaiDL(id);
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/pdf/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const data = await nhentaiDL(id);
        if (!data || !data.images.pages.length) return res.status(404).json({ error: 'Not found' });
        const pdfBuffer = await toPDF(data.images.pages);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="nhentai-${id}.pdf"`);
        res.send(pdfBuffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
