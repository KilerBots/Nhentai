const axios = require('axios');
const morgan = require('morgan');
const express = require('express');
const PDFDocument = require('pdfkit');

const app = express();
app.set('json spaces', 4);
app.use(morgan('dev'));
app.use(express.json());

function toPDF(images, opt = {}) {
	return new Promise(async (resolve, reject) => {
		if (!Array.isArray(images)) images = [images];
		let buffs = [], doc = new PDFDocument({ margin: 0, size: 'A4' });
		for (let x = 0; x < images.length; x++) {
			if (/.webp|.gif/.test(images[x])) continue;
			let data = (await axios.get(images[x], { responseType: 'arraybuffer', ...opt })).data;
			doc.image(data, 0, 0, { fit: [595.28, 841.89], align: 'center', valign: 'center' });
			if (images.length != x + 1) doc.addPage();
		}
		doc.on('data', (chunk) => buffs.push(chunk));
		doc.on('end', () => resolve(Buffer.concat(buffs)));
		doc.on('error', (err) => reject(err));
		doc.end();
	});
}

let baseUrl = 'https://cin.guru/';

async function nh(id) {
	let uri = id ? baseUrl + `v/${+id}/` : baseUrl;
	let html = (await axios.get(uri)).data;
	return JSON.parse(html.split('<script id="__NEXT_DATA__" type="application/json">')[1].split('</script>')[0]).props.pageProps.data;
}

async function getID(id) {
	return new Promise(async (resolve, reject) => {
		try {
			let data = await nh(id);
			let pages = data.images.pages.map((v, i) => {
				let ext = new URL(v.t).pathname.split('.')[1];
				return `https://external-content.duckduckgo.com/iu/?u=https://i7.nhentai.net/galleries/${data.media_id}/${i + 1}.${ext}`;
			});
			let tags = data.tags.reduce((acc, tag) => {
				acc[tag.type] = acc[tag.type] || [];
				acc[tag.type].push(tag.name);
				return acc;
			}, {});
			resolve({
				id: data.id,
				title: data.title,
				thumb: `https://external-content.duckduckgo.com/iu/?u=https://t.nhentai.net/galleries/${data.media_id}/thumb.jpg`,
				pages,
				tag: tags.tag || [],
				artist: tags.artist || [],
				category: tags.category || [],
				language: tags.language || [],
				media_id: data.media_id,
				num_pages: pages.length,
				upload_date: data.upload_date
			});
		} catch (err) {
			resolve({ message: err.message });
		}
	});
}

app.all('/', (req, res) => {
	const baseUrl = `https://${req.get('host')}`;
	res.json({
		runtime: new Date(process.uptime() * 1000).toTimeString().split(' ')[0],
		endpoint: {
			detail: `${baseUrl}/detail?code=212121`,
			read: `${baseUrl}/read?code=212121`,
			pdf: `${baseUrl}/pdf?code=212121`
		},
	});
});

app.get('/detail', async (req, res) => {
	const code = req.query.code;
	if (!code) return res.json({ message: 'Input parameter code' });
	try {
		const result = await getID(code);
		res.json(result);
	} catch (e) {
		console.error(e);
		res.json({ message: e.message });
	}
});

app.get('/read', async (req, res) => {
	const code = req.query.code;
	if (!code) return res.json({ message: 'Input parameter code' });
	try {
		const result = await getID(code);
		const images = await Promise.all(
			result.pages.map(async (url) => {
				const response = await axios.get(url, { responseType: 'arraybuffer' });
				return Buffer.from(response.data).toString('base64');
			})
		);
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
			    <h3>Server uptime</h3>
				<h1>${result.title.english}</h1>
				${images.map((img) => `<img src="data:image/jpeg;base64,${img}">`).join('')}
			</body>
			<script>
			setInterval(async () => {
			const uptime = Math.floor(process.uptime()); // Uptime dalam detik
            const hours = String(Math.floor(uptime / 3600)).padStart(2, '0');
            const minutes = String(Math.floor((uptime % 3600) / 60)).padStart(2, '0');
            const seconds = String(uptime % 60).padStart(2, '0');
			document.getElementById("uptime").innerHTML = `${hours}:${minutes}:${seconds}`
			},1000)
			</script>`;
		res.send(html);
	} catch (err) {
		res.json({ error: err.message });
	}
});
app.get('/pdf', async (req, res) => {
	const code = req.query.code;
	if (!code) return res.json({ message: 'Input parameter code' });
	try {
		const result = await getID(code);
		const pdfBuffer = await toPDF(result.pages);
		res.set({
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${result.title.english || 'document'}.pdf"`
		});
		res.send(pdfBuffer);
	} catch (e) {
		console.error(e);
		res.json({ message: e.message });
	}
});

app.listen(3000, () => console.log('App running on port 3000'));
