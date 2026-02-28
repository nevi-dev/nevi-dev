import fs from 'fs';
import path from 'path';
import axios from 'axios';
import fetch from 'node-fetch';
import { execSync } from 'child_process';
import pLimit from 'p-limit';

const FILE_PATH = './characters.json';
const FOTOS_DIR = path.join(process.cwd(), 'fotos');
const API_KEY = 'causa-ee5ee31dcfc79da4';
const limit = pLimit(1); 

const SCRAPER_HEADERS = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
};

// --- LISTA DE MY HERO ACADEMIA ---
const MHA_LIST = [
    "elliot fem" 
].map(n => ({ name: n, source: "forsaken", gender: "mujel" }));

// --- FUNCIONES DE APOYO ---

const generatePrice = () => Math.floor(Math.random() * (2900 - 1200 + 1) + 1200).toString();

async function fetchWebPhotos(charName, source) {
    let urls = [];
    const query = encodeURIComponent(`${charName} ${source} official art hero costume`);
    
    try {
        const response = await fetch(`https://www.google.com/search?q=${query}&udm=2`, { headers: SCRAPER_HEADERS });
        const html = await response.text();
        const pattern = /\[1,\[0,"(?<id>[\d\w\-_]+)",\["https?:\/\/(?:[^"]+)",\d+,\d+\]\s?,\["(?<url>https?:\/\/(?:[^"]+))",\d+,\d+\]/gm;
        urls = [...html.matchAll(pattern)].map(m => m.groups?.url?.replace(/\\u003d/g, '=').replace(/\\u0026/g, '&'))
               .filter(v => v && !v.includes('gstatic.com')).slice(0, 5);
    } catch {}

    if (urls.length < 2) {
        try {
            const res = await fetch(`https://rest.apicausas.xyz/api/v1/buscadores/pinterest?q=${query}&apikey=${API_KEY}`);
            const json = await res.json();
            if (json.status && json.data) {
                urls = [...urls, ...json.data.map(item => item.image)].slice(0, 6);
            }
        } catch {}
    }
    return urls;
}

async function download(url, charName, index) {
    try {
        const folderName = charName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const folder = path.join(FOTOS_DIR, folderName);
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        const fileName = `img_${index}.jpg`;
        const finalPath = path.join(folder, fileName);
        const res = await axios({ url, method: 'GET', responseType: 'arraybuffer', timeout: 10000, headers: SCRAPER_HEADERS });
        if (res.data.toString('utf8', 0, 50).includes('<html')) return null;
        fs.writeFileSync(finalPath, res.data);
        return `https://raw.githubusercontent.com/nevi-dev/nevi-dev/main/fotos/${folderName}/${fileName}`;
    } catch { return null; }
}

// --- PROCESO ---

async function run() {
    if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, '[]');
    let db = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    let changes = 0;

    console.log("--- 🛡️ INICIANDO AUDITORÍA DE MY HERO ACADEMIA ---");

    for (const char of MHA_LIST) {
        const exists = db.some(c => c.name.toLowerCase() === char.name.toLowerCase());

        if (exists) {
            // AQUÍ ESTÁ EL LOG QUE PEDISTE: Avisa que ya está y lo ignora
            console.log(`⚠️  IGNORANDO: [${char.name}] ya se encuentra en la base de datos.`);
        } else {
            // SI NO ESTÁ, LO AGREGA
            console.log(`✅ AGREGANDO: [${char.name}] es nuevo. Generando ID y precio...`);
            const ids = db.map(c => parseInt(c.id)).filter(n => !isNaN(n));
            const nextId = ids.length > 0 ? (Math.max(...ids) + 1).toString() : "1";
            
            db.push({ ...char, id: nextId, value: generatePrice(), img: [], vid: [], user: null, status: "Libre", votes: 0 });
            changes++;
        }
    }

    // Buscar fotos para los que no tengan
    for (let char of db) {
        if (char.source === "My Hero Academia" && char.img.length === 0) {
            await limit(async () => {
                console.log(`📸 Buscando imágenes oficiales para: ${char.name}`);
                const urls = await fetchWebPhotos(char.name, char.source);
                if (urls.length > 0) {
                    const saved = [];
                    for (let i = 0; i < urls.length; i++) {
                        const link = await download(urls[i], char.name, i);
                        if (link) saved.push(link);
                    }
                    if (saved.length > 0) {
                        char.img = saved;
                        changes++;
                        console.log(`✨ Guardadas ${saved.length} fotos para ${char.name}.`);
                    }
                }
                await new Promise(r => setTimeout(r, 1300));
            });
        }
    }

    if (changes > 0) {
        fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 4));
        try {
            execSync('git add . && git commit -m "Auto: Update MHA cast (Skiped duplicates)" && git push origin main');
            console.log("🚀 GitHub actualizado.");
        } catch { console.log("❌ Error al subir a Git."); }
    } else {
        console.log("💎 No hay personajes nuevos que añadir. Todo está limpio.");
    }
}

run();