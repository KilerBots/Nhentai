const axios = require('axios')
const morgan = require('morgan')
const express = require('express')
const PDFDocument = require('pdfkit')

const app = express()
app.set('json spaces', 4)
app.use(morgan('dev'))
app.use(express.json())

function toPDF(images, opt = {}) {
return new Promise(async (resolve, reject) => {
if (!Array.isArray(images)) images = [images]
let buffs = [], doc = new PDFDocument({ margin: 0, size: 'A4' })
for (let x = 0; x < images.length; x++) {
if (/.webp|.gif/.test(images[x])) continue
let data = (await axios.get(images[x], { responseType: 'arraybuffer', ...opt })).data
doc.image(data, 0, 0, { fit: [595.28, 841.89], align: 'center', valign: 'center' })
if (images.length != x + 1) doc.addPage()
}
doc.on('data', (chunk) => buffs.push(chunk))
doc.on('end', () => resolve(Buffer.concat(buffs)))
doc.on('error', (err) => reject(err))
doc.end()
})
}

async function nhentaiDL(id) {
const html = await (await axios.get('https://nhentai.net/g/'+id)).data
const match = html.match(/JSON\.parse\((['"`])(.+?)\1\)/)

if(match) {
let json = match[2].replace(/\\"/g, '"').replace(/\\u([\dA-Fa-f]{4})/g, (m, g) => String.fromCharCode(parseInt(g, 16)))
let data = JSON.parse(json)
data.images.pages = data.images.pages.map((v, i) => `https://zorocdn.xyz/galleries/${data.media_id}/${i + 1}.jpg`)
data.images.cover = `https://zorocdn.xyz/galleries/${data.media_id}/cover.jpg`
data.images.thumbnail = `https://zorocdn.xyz/galleries/${data.media_id}/thumb.jpg`
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
search: `${baseUrl}/search?query=yuusha`,
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
const query = req.query.query
if (!query) return res.json({ message: 'Input parameter query' })
try {
const result = await nhentaiSearch(query)
res.json(result)
} catch (e) {
console.error(e)
res.json({ message: e.message })
}
})

app.get('/pdf', async (req, res) => {
const code = req.query.code
if (!code) return res.json({ message: 'Input parameter code' })
try {
const result = await nhentaiDL(code)
const pdfBuffer = await toPDF(result.pages)
res.set({
'Content-Type': 'application/pdf',
'Content-Disposition': `attachment; filename="${result.title.english || 'document'}.pdf"`
})
res.send(pdfBuffer)
} catch (e) {
console.error(e)
res.json({ message: e.message })
}
})


app.get('/read', async (req, res) => {
const code = req.query.code
if (!code) return res.json({ message: 'Input parameter code' })
try {
const result = await nhentaiDL(code)
const images = await Promise.all(
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

app.listen(3000, () => console.log('App running on port 3000'))
