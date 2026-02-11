import fs from 'fs';
import path from 'path';
import axios from 'axios';
import fetch from 'node-fetch';
import { execSync } from 'child_process';
import pLimit from 'p-limit';

const FILE_PATH = './characters.json';
const FOTOS_DIR = path.join(process.cwd(), 'fotos');
const limit = pLimit(1); 

const SCRAPER_HEADERS = {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'referer': 'https://www.google.com/'
};

// --- FUNCIÓN DE DETECCIÓN DE "CÓDIGO" ---
function isFileCorrupted(filePath) {
    if (!fs.existsSync(filePath)) return true;
    
    // Leemos los primeros 100 bytes del archivo
    const buffer = Buffer.alloc(100);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 100, 0);
    fs.closeSync(fd);

    const content = buffer.toString().toLowerCase();
    // Si contiene etiquetas comunes de HTML o scripts, es "código", no imagen
    if (content.includes('<!doctype') || content.includes('<html') || 
        content.includes('<xml') || content.includes('script>') || 
        content.includes('forbidden') || content.includes('error')) {
        return true;
    }
    return false;
}

async function fetchGoogleImages(charName, source) {
    const queries = [`${charName} ${source}`, `${charName}`];
    for (let query of queries) {
        try {
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&udm=2`;
            const response = await fetch(searchUrl, { headers: SCRAPER_HEADERS });
            const html = await response.text();
            const pattern = /\[1,\[0,"(?<id>[\d\w\-_]+)",\["https?:\/\/(?:[^"]+)",\d+,\d+\]\s?,\["(?<url>https?:\/\/(?:[^"]+))",\d+,\d+\]/gm;
            const matches = [...html.matchAll(pattern)];
            let urls = matches
                .map(m => m.groups?.url?.replace(/\\u003d/g, '=').replace(/\\u0026/g, '&'))
                .filter(v => v && !v.includes('gstatic.com') && /.*\.jpe?g|png|webp$/gi.test(v));

            if (urls.length >= 1) return urls.slice(0, 4);
        } catch (e) { continue; }
    }
    return [];
}

async function downloadImage(url, charName, index) {
    try {
        const charFolderName = charName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const folder = path.join(FOTOS_DIR, charFolderName);
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

        const fileName = `img_${index}.jpg`;
        const finalPath = path.join(folder, fileName);

        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 10000,
            headers: { ...SCRAPER_HEADERS, 'referer': (new URL(url)).origin }
        });

        const writer = fs.createWriteStream(finalPath);
        response.data.pipe(writer);

        return new Promise((resolve) => {
            writer.on('finish', () => {
                // VERIFICACIÓN INMEDIATA POST-DESCARGA
                if (isFileCorrupted(finalPath)) {
                    fs.unlinkSync(finalPath); // Borrar si es código
                    resolve(null);
                } else {
                    resolve(`https://raw.githubusercontent.com/nevi-dev/nevi-dev/main/fotos/${charFolderName}/${fileName}`);
                }
            });
            writer.on('error', () => resolve(null));
        });
    } catch (e) { return null; }
}

async function run() {
    let db = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    let count = 0;

    console.log("--- INICIANDO ESCANEO DE CARPETAS Y LIMPIEZA DE CÓDIGO ---");

    for (let char of db) {
        const charFolderName = char.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const folderPath = path.join(FOTOS_DIR, charFolderName);
        
        let needsFix = false;

        // 1. Revisar si la carpeta existe y tiene archivos reales
        if (!fs.existsSync(folderPath)) {
            needsFix = true;
        } else {
            const files = fs.readdirSync(folderPath);
            if (files.length === 0) {
                needsFix = true;
            } else {
                // 2. Revisar si los archivos existentes son "código"
                for (const file of files) {
                    if (isFileCorrupted(path.join(folderPath, file))) {
                        console.log(`[CORRUPTO] Detectado código en: ${char.name}/${file}. Borrando...`);
                        fs.unlinkSync(path.join(folderPath, file));
                        needsFix = true;
                    }
                }
            }
        }

        // Si detectamos que no tiene fotos o las que tiene son código:
        if (needsFix) {
            await limit(async () => {
                console.log(`[Buscando] ${char.name} (${char.source})...`);
                const urls = await fetchGoogleImages(char.name, char.source || "");
                const newPhotos = [];
                
                for (let i = 0; i < urls.length; i++) {
                    const res = await downloadImage(urls[i], char.name, i);
                    if (res) newPhotos.push(res);
                }

                if (newPhotos.length > 0) {
                    char.img = newPhotos;
                    count++;
                }
                await new Promise(r => setTimeout(r, 1000));
            });
        }
    }

    fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 4));
    console.log(`--- SE REPARARON ${count} PERSONAJES CON ARCHIVOS MALOS ---`);

    try {
        console.log("--- SUBIENDO LIMPIEZA A GITHUB ---");
        execSync('git add .');
        execSync('git commit -m "Cleanup: Removed corrupted code files and replaced with real images"');
        execSync('git push origin main');
    } catch (e) { console.error("Nada nuevo que subir."); }
}

run();