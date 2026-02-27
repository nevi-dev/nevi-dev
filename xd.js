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

// --- MEGA LISTAS ACTUALIZADAS ---

const LUCKY_STAR = [
    "Konata Izumi", "Kagami Hiiragi", "Tsukasa Hiiragi", "Miyuki Takara", "Yutaka Kobayakawa", 
    "Minami Iwasaki", "Hiyori Tamura", "Patricia Martin", "Misao Kusakabe", "Ayano Minegishi", 
    "Nanako Kuroi", "Yui Narumi", "Sohjiroh Izumi"
].map(n => ({ name: n, source: "Lucky Star", gender: "Mujer" }));

const NIKKE = [
    "Rapi", "Anis", "Neon", "Marian", "Modernia", "Alice", "Snow White", "Scarlet", "Dorothy", 
    "Privaty", "Diesel", "Rupee", "Volume", "Emma", "Viper", "Blanc", "Noir", "Maxwell", "Drake", 
    "Helm", "Sugar", "Exia", "Novel", "Guillotine", "Maiden", "Brid", "Poli", "Miranda"
].map(n => ({ name: n, source: "Goddess of Victory: Nikke", gender: "Mujer" }));

const RE_ZERO = [
    "Subaru Natsuki", "Emilia", "Rem", "Ram", "Beatrice", "Roswaal L. Mathers", "Echidna", 
    "Satella", "Garfiel Tinsel", "Otto Suwen", "Crusch Karsten", "Felix Argyle", "Reinhard van Astrea", 
    "Julius Juukulius", "Wilhelm van Astrea", "Felt", "Priscilla Barielle", "Anastasia Hoshin", 
    "Frederica Baumann", "Petra Leyte", "Meili Portroute", "Elsa Granhiert", "Petelgeuse Romanee-Conti"
].map(n => ({ name: n, source: "Re:ZERO -Starting Life in Another World-", gender: "Varios" }));

const CHAINSAW_MAN = [
    "Denji", "Power", "Makima", "Aki Hayakawa", "Pochita", "Kobeni Higashiyama", "Reze", "Himeno", 
    "Kishibe", "Quanxi", "Angel Devil", "Beam", "Galgali", "Princesa", "Katana Man", "Nayuta", "Asa Mitaka"
].map(n => ({ name: n, source: "Chainsaw Man", gender: "Varios" }));

const THE_LAST_OF_US = [
    "Joel Miller", "Ellie", "Tommy Miller", "Tess", "Bill", "Abby Anderson", "Dina", "Jesse", 
    "Lev", "Yara", "Marlene", "David", "Riley Abel", "Owen Moore", "Mel"
].map(n => ({ name: n, source: "The Last of Us", gender: "Varios" }));

const LUPIN = [
    "Arsene Lupin III", "Daisuke Jigen", "Goemon Ishikawa XIII", "Fujiko Mine", "Inspector Koichi Zenigata"
].map(n => ({ name: n, source: "Lupin III", gender: "Varios" }));

const FNAF = [
    "Springtrap", "Mangle", "The Puppet", "Balloon Boy", "Circus Baby", "Ballora", "Ennard", 
    "Funtime Freddy", "Funtime Foxy", "Lefty", "Helpy", "Roxanne Wolf", "Glamrock Chica", 
    "Montgomery Gator", "Vanny", "Golden Freddy", "Nightmare", "Plushtrap", "Glitchtrap"
].map(n => ({ name: n, source: "Five Nights at Freddy's", gender: "Animatrónico" }));

const FNIA = [
    "Fredina", "Bonnie (FNIA)", "Chicky", "Foxy (FNIA)", "Mangle (FNIA)", "Puppet (FNIA)", 
    "Springtrap (FNIA)", "Golden Fredina"
].map(n => ({ name: n, source: "Five Nights in Anime", gender: "Mujer" }));

const CLASH_ROYALE = [
    { name: "Bruja Madre (Mother Witch)", source: "Clash Royale", gender: "Mujer" }
];

const NEW_CHARACTERS = [
    ...LUCKY_STAR, ...NIKKE, ...RE_ZERO, ...CHAINSAW_MAN, 
    ...THE_LAST_OF_US, ...LUPIN, ...FNAF, ...FNIA, ...CLASH_ROYALE
];

// --- LÓGICA DE APOYO ---

const generatePrice = () => Math.floor(Math.random() * (2900 - 1200 + 1) + 1200).toString();

async function fetchWebPhotos(charName, source) {
    let urls = [];
    const query = encodeURIComponent(`${charName} ${source} official art`);
    
    // Intento 1: Google
    try {
        const response = await fetch(`https://www.google.com/search?q=${query}&udm=2`, { headers: SCRAPER_HEADERS });
        const html = await response.text();
        const pattern = /\[1,\[0,"(?<id>[\d\w\-_]+)",\["https?:\/\/(?:[^"]+)",\d+,\d+\]\s?,\["(?<url>https?:\/\/(?:[^"]+))",\d+,\d+\]/gm;
        urls = [...html.matchAll(pattern)].map(m => m.groups?.url?.replace(/\\u003d/g, '=').replace(/\\u0026/g, '&'))
               .filter(v => v && !v.includes('gstatic.com')).slice(0, 5);
    } catch {}

    // Intento 2: Pinterest API (Tu fallback específico)
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

// --- EJECUCIÓN ---

async function run() {
    if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, '[]');
    let db = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    let changes = 0;

    // Agregar nuevos
    for (const char of NEW_CHARACTERS) {
        if (!db.some(c => c.name.toLowerCase() === char.name.toLowerCase())) {
            const ids = db.map(c => parseInt(c.id)).filter(n => !isNaN(n));
            const nextId = ids.length > 0 ? (Math.max(...ids) + 1).toString() : "1";
            db.push({ ...char, id: nextId, value: generatePrice(), img: [], vid: [], user: null, status: "Libre", votes: 0 });
            changes++;
        }
    }

    // Auditoría de imágenes
    for (let char of db) {
        if (char.img.length === 0) {
            await limit(async () => {
                console.log(`🔎 Buscando: ${char.name} de ${char.source}`);
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
                        console.log(`✅ ${char.name}: ${saved.length} fotos.`);
                    }
                }
                await new Promise(r => setTimeout(r, 1200));
            });
        }
    }

    if (changes > 0) {
        fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 4));
        try {
            execSync('git add . && git commit -m "Auto: Update full cast y fotos" && git push origin main');
            console.log("🚀 Repositorio actualizado.");
        } catch { console.log("⚠️ Error al subir a Git."); }
    } else {
        console.log("✨ Todo actualizado.");
    }
}

run();