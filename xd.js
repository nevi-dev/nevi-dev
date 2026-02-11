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

// --- FUNCIÓN PARA VALIDAR SI UN ARCHIVO ES REALMENTE UNA IMAGEN ---
function isLocalFileBad(charName) {
    const charFolderName = charName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const folderPath = path.join(FOTOS_DIR, charFolderName);
    
    if (!fs.existsSync(folderPath)) return true;
    const files = fs.readdirSync(folderPath);
    if (files.length === 0) return true;

    for (const file of files) {
        const fullPath = path.join(folderPath, file);
        const buffer = fs.readFileSync(fullPath);
        const header = buffer.toString('utf8', 0, 100).toLowerCase();
        
        // Si el archivo empieza con etiquetas HTML o mensajes de error
        if (header.includes('<html') || header.includes('<!doc') || header.includes('forbidden') || header.includes('error')) {
            console.log(`[BASURA DETECTADA] Borrando archivo corrupto en: ${charName}`);
            fs.unlinkSync(fullPath);
            return true;
        }
    }
    return false;
}

// --- FUNCIÓN PARA VERIFICAR SI EL LINK EN EL JSON FUNCIONA ---
async function isUrlDead(url) {
    if (!url || !url.startsWith('http')) return true;
    try {
        const res = await axios.get(url, { timeout: 6000, headers: SCRAPER_HEADERS, responseType: 'arraybuffer' });
        const start = res.data.toString('utf8', 0, 50).toLowerCase();
        return start.includes('<html') || start.includes('<!doc');
    } catch {
        return true; 
    }
}

async function fetchNewPhotos(charName, source) {
    // Intento 1: Google
    try {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(charName + ' ' + (source || ''))}&udm=2`;
        const response = await fetch(searchUrl, { headers: SCRAPER_HEADERS });
        const html = await response.text();
        const pattern = /\[1,\[0,"(?<id>[\d\w\-_]+)",\["https?:\/\/(?:[^"]+)",\d+,\d+\]\s?,\["(?<url>https?:\/\/(?:[^"]+))",\d+,\d+\]/gm;
        const matches = [...html.matchAll(pattern)];
        let urls = matches.map(m => m.groups?.url?.replace(/\\u003d/g, '=').replace(/\\u0026/g, '&'))
                   .filter(v => v && !v.includes('gstatic.com')).slice(0, 3);
        if (urls.length > 0) return urls;
    } catch {}

    // Intento 2: Pinterest API
    try {
        const res = await fetch(`https://rest.apicausas.xyz/api/v1/buscadores/pinterest?q=${encodeURIComponent(charName + ' anime')}&apikey=${API_KEY}`);
        const json = await res.json();
        return json.status ? json.data.map(item => item.image).slice(0, 3) : [];
    } catch { return []; }
}

async function downloadPhoto(url, charName, index) {
    try {
        const charFolderName = charName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const folder = path.join(FOTOS_DIR, charFolderName);
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

        const fileName = `img_${index}.jpg`;
        const finalPath = path.join(folder, fileName);

        const response = await axios({ url, method: 'GET', responseType: 'arraybuffer', timeout: 10000, headers: SCRAPER_HEADERS });
        const start = response.data.toString('utf8', 0, 50).toLowerCase();
        if (start.includes('<html') || start.includes('<!doc')) return null;

        fs.writeFileSync(finalPath, response.data);
        return `https://raw.githubusercontent.com/nevi-dev/nevi-dev/main/fotos/${charFolderName}/${fileName}`;
    } catch { return null; }
}

async function run() {
    let db = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    let changes = 0;

    console.log(`--- INICIANDO AUDITORÍA DE ${db.length} PERSONAJES ---`);

    for (let char of db) {
        // ¿El archivo local está mal o el link del JSON está muerto?
        const localBad = isLocalFileBad(char.name);
        const linkBad = char.img.length === 0 || await isUrlDead(char.img[0]);

        if (localBad || linkBad) {
            await limit(async () => {
                console.log(`[AUDITORÍA] ${char.name} necesita reparación...`);
                const urls = await fetchNewPhotos(char.name, char.source);
                const newPhotos = [];

                for (let i = 0; i < urls.length; i++) {
                    const res = await downloadPhoto(urls[i], char.name, i);
                    if (res) newPhotos.push(res);
                }

                if (newPhotos.length > 0) {
                    char.img = newPhotos;
                    changes++;
                    console.log(`[CORREGIDO] ${char.name} con nuevas imágenes.`);
                } else {
                    console.log(`[AVISO] No se pudo rescatar a ${char.name}.`);
                }
                await new Promise(r => setTimeout(r, 1200));
            });
        }
    }

    if (changes > 0) {
        fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 4));
        try {
            console.log("--- SUBIENDO REPARACIONES A GITHUB ---");
            execSync('git add . && git commit -m "Fix: Auditoría completa de imágenes (remoción de código y links muertos)" && git push origin main');
        } catch { console.log("Error al sincronizar."); }
    } else {
        console.log("--- TODO PERFECTO: No se detectaron archivos corruptos ---");
    }
}

run();