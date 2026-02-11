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

        let ext = 'jpg';
        const match = url.match(/\.(jpg|jpeg|png|webp|gif)/i);
        if (match) ext = match[1];

        const fileName = `img_${index}.${ext}`;
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
            writer.on('finish', () => resolve(`https://raw.githubusercontent.com/nevi-dev/nevi-dev/main/fotos/${charFolderName}/${fileName}`));
            writer.on('error', () => resolve(null));
        });
    } catch (e) { return null; }
}

async function run() {
    let db = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));

    // Filtramos solo los que necesitan reparación: 
    // Aquellos con Pinterest o aquellos que no tienen fotos en absoluto.
    const toFix = db.filter(c => 
        c.img.length === 0 || 
        c.img.some(url => url.includes('pinimg.com'))
    );

    console.log(`--- REPARANDO ${toFix.length} PERSONAJES EXISTENTES (SIN AGREGAR NUEVOS) ---`);

    for (let char of toFix) {
        // Doble seguridad: Si el primer link ya es GitHub, saltar.
        if (char.img.length > 0 && char.img[0].includes('raw.githubusercontent.com')) {
            continue;
        }

        await limit(async () => {
            console.log(`[Reparando] ${char.name} (${char.source || 'Sin fuente'})...`);
            const urls = await fetchGoogleImages(char.name, char.source || "");
            
            const newPhotos = [];
            for (let i = 0; i < urls.length; i++) {
                const res = await downloadImage(urls[i], char.name, i);
                if (res) newPhotos.push(res);
            }

            if (newPhotos.length >= 1) {
                char.img = newPhotos;
                console.log(`[OK] Migrado exitosamente.`);
            } else {
                console.log(`[AVISO] No se encontraron resultados para ${char.name}.`);
            }
            // Pequeña espera para no saturar a Google
            await new Promise(r => setTimeout(r, 1500));
        });
    }

    // Guardar los cambios en el JSON
    fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 4));

    try {
        console.log("--- SINCRONIZANDO CON GITHUB ---");
        execSync('git add .');
        execSync('git commit -m "Fix: Replaced Pinterest links and filled empty images for existing characters"');
        execSync('git push origin main');
        console.log("--- PROCESO COMPLETADO ---");
    } catch (e) { 
        console.error("Error Git (posiblemente nada nuevo para subir):", e.message); 
    }
}

run();