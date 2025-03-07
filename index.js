const axios = require('axios')
const cheerio = require('cheerio')
const morgan = require('morgan')
const express = require('express')
const PDFDocument = require('pdfkit')

const app = express()
const port = 7860
app.set('json spaces', 4)
app.use(morgan('dev'))
app.use(express.json())


function toPDF(images, opt = {}) {
return new Promise(async (resolve, reject) => {
if (!Array.isArray(images)) images = [images]
let buffs = [], doc = new PDFDocument({ margin: 0, size: 'A4' })
for (let x = 0; x < images.length; x++) {
if (!images[x]) continue // Skip jika URL kosong
try {
let data = (await axios.get(images[x], { responseType: 'arraybuffer', ...opt })).data
doc.image(data, 0, 0, { fit: [595.28, 841.89], align: 'center', valign: 'center' })
if (images.length !== x + 1) doc.addPage()
} catch (err) {
console.error('Failed to fetch image:', images[x], err.message)
}
}

doc.on('data', (chunk) => buffs.push(chunk))
doc.on('end', () => resolve(Buffer.concat(buffs)))
doc.on('error', (err) => reject(err))
doc.end()
})
}



async function nhentaiDL(id) {
const html = await (await axios.get('https://nhentai.net/g/'+id)).data
const $ = cheerio.load(html)
const match = html.match(/JSON\.parse\((['"`])(.+?)\1\)/)

let images = []

$('.thumb-container').each((i, el) => {
let url = $(el).find('.lazyload').attr('data-src').replace('https://t', 'https://i').replace((i + 1) + 't', (i + 1));
images.push(url);
});
if(match) {
let json = match[2].replace(/\\"/g, '"').replace(/\\u([\dA-Fa-f]{4})/g, (m, g) => String.fromCharCode(parseInt(g, 16)))
let data = JSON.parse(json)
data.images.pages = images
data.images.cover = $('meta[itemprop="image"]').attr('content')
data.images.thumbnail = $('meta[itemprop="image"]').attr('content').replace('cover', 'thumb')
data.tags = data.tags.map(tags => tags.name)

return data
}
}

async function nhentaiSearch(query) {
try {
const { data } = await axios.get(`https://nhentai.net/search/?q=${query}`)
const $ = cheerio.load(data)
const result = []

$('.gallery').each((i, el) => {
result.push({
title: $(el).find('.caption').text().trim(),
thumb: $(el).find('.lazyload').attr("data-src").trim(),
link: 'https://nhentai.net'+$(el).find('a').attr("href").trim(),
})
})

return result
} catch (e) {
console.log(e)
}
}


app.all('/', (req, res) => {
const baseUrl = `https://${req.get('host')}`
res.json({
runtime: new Date(process.uptime() * 1000).toTimeString().split(' ')[0],
endpoint: {
detail: `${baseUrl}/detail?code=212121`,
search: `${baseUrl}/search?q=yuusha`,
pdf: `${baseUrl}/pdf?code=212121`,
read: `${baseUrl}/read?code=212121`,
},
})
})

app.get('/detail', async (req, res) => {
const code = req.query.code
if (!code) return res.json({ message: 'Input parameter code' })
try {
const result = await nhentaiDL(code)
res.json(result)
} catch (e) {
console.error(e)
res.json({ message: e.message })
}
})

app.get('/search', async (req, res) => {
const query = req.query.q
if (!query) return res.json({ message: 'Input parameter q' })
try {
const result = await nhentaiSearch(query)
res.json(result)
} catch (e) {
console.error(e)
res.json({ status: e?.status, message: e.message })
}
})

app.get('/pdf', async (req, res) => {
const code = req.query.code
if (!code) return res.status(400).json({ message: 'Input parameter code' })

try {
const result = await nhentaiDL(code)
if (!result || !result.images || !Array.isArray(result.images.pages) || result.images.pages.length === 0) {
return res.status(404).json({ message: 'No images found for this code' })
}

const pdfBuffer = await toPDF(result.images.pages)
let title = result.title.english || result.title.pretty || 'document'

res.set({
'Content-Type': 'application/pdf',
'Content-Disposition': `attachment; filename="${title}.pdf"`
})

res.send(pdfBuffer)
} catch (e) {
console.error(e)
res.status(500).json({ message: 'Failed to generate PDF', error: e.message })
}
})

app.get('/read', async (req, res) => {
const code = req.query.code
if (!code) return res.json({ message: 'Input parameter code' })
try {
const result = await nhentaiDL(code)
let images = await Promise.all(
result.images.pages.map(async (url) => {
const response = await axios.get(url, { responseType: 'arraybuffer' })
return Buffer.from(response.data).toString('base64')
})
)

const html = `
<!DOCTYPE html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${result.title.english}</title>
<style>
img { display: block; margin: auto; width: 100%; }
body { background-color: #1a202c; color: #ffffff; text-align: center; }
@media (min-width: 576px) { img { width: auto; max-width: 100%; height: auto; } }
</style>
</head>
<body>
<h1>${result.title.english}</h1>
${images.map((img) => `<img src="data:image/jpeg;base64,${img}">`).join('')}
</body>`
res.send(html)
} catch (err) {
res.json({ error: err.message })
}
})

app.listen(port, () => console.log('App running on port '+port))
