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

// --- TUS LISTAS DE PERSONAJES ---
const FRUITS_BASKET = [
    { name: "Tohru Honda", gender: "Mujer" }, { name: "Kyo Sohma", gender: "Hombre" },
    { name: "Yuki Sohma", gender: "Hombre" }, { name: "Shigure Sohma", gender: "Hombre" },
    { name: "Ayame Sohma", gender: "Hombre" }, { name: "Akito Sohma", gender: "Mujer" },
    { name: "Momiji Sohma", gender: "Hombre" }, { name: "Hatsuharu Sohma", gender: "Hombre" },
    { name: "Hiro Sohma", gender: "Hombre" }, { name: "Kagura Sohma", gender: "Mujer" },
    { name: "Kisa Sohma", gender: "Mujer" }, { name: "Rin Sohma", gender: "Mujer" },
    { name: "Hatori Sohma", gender: "Hombre" }, { name: "Kureno Sohma", gender: "Hombre" },
    { name: "Ritsu Sohma", gender: "Hombre" }, { name: "Arisa Uotani", gender: "Mujer" },
    { name: "Saki Hanajima", gender: "Mujer" }, { name: "Machi Kuragi", gender: "Mujer" },
    { name: "Kakeru Manabe", gender: "Hombre" }, { name: "Kyoko Honda", gender: "Mujer" }
].map(c => ({ ...c, source: "Fruits Basket" }));

const AZUR_LANE = [
    "Enterprise", "Belfast", "Atago", "Takao", "Akagi", "Kaga", "Amagi", "Laffey", "Javelin", "Ayanami", "Z23", 
    "Prinz Eugen", "Taihou", "Formidable", "Sirius", "Bremerton", "Shinano", "New Jersey", "Illustrious", 
    "Unicorn", "Noshiro", "Baltimore", "Bismarck", "Tirpitz", "Graf Zeppelin", "Roon", "Friedrich der Grosse", 
    "San Diego", "Helena", "Warspite", "Queen Elizabeth", "Hood", "Zuikaku", "Shoukaku", "Nagato", "Yukikaze"
].map(n => ({ name: n, source: "Azur Lane", gender: "Mujer" }));

const PROJECT_QT = [
    "Shizuka", "Kanna", "Haruka", "Sona", "Emilia", "Ariel", "Discordia", "Freya", "Gigi", "Kelly", "Celine", 
    "Luna", "Mia", "Nia", "Tina", "Geneva", "Clara", "Ellen", "Elva", "Erica", "Hazel", "Iris", "Pamela", 
    "Rachel", "Rayna", "Scarlett", "Una", "Venus", "Winni", "Abby", "Alberta", "Alice", "Alina", "Alizee"
].map(n => ({ name: n, source: "Project QT", gender: "Mujer" }));

const AEONS_ECHO = [
    "Aria", "Linn", "Freyja", "Elara", "Seraphina", "Kaelia", "Thalassa", "Nyx", "Aura", "Lyra", "Vex", 
    "Nova", "Stella", "Rin", "Kelis", "Ruka", "Janna", "Mamsa", "Hestia", "Biscuit", "Demeter", "Areka", 
    "Moana", "Apollo", "Heracles", "Prometheus", "Tammy", "Cyrene", "Athena", "Aphrodite", "Hera", "Artemis"
].map(n => ({ name: n, source: "Aeons Echo", gender: "Mujer" }));

const NEW_CHARACTERS = [...FRUITS_BASKET, ...AZUR_LANE, ...PROJECT_QT, ...AEONS_ECHO];

// --- FUNCIONES DE APOYO ---

const generatePrice = () => Math.floor(Math.random() * (1900 - 900 + 1) + 900).toString();

async function fetchPokeApi(name) {
    try {
        const cleanName = name.toLowerCase().replace(/\s+/g, '-');
        const res = await axios.get(`https://pokeapi.co/api/v2/pokemon/${cleanName}`);
        const d = res.data.sprites;
        const urls = [
            d.other['official-artwork']?.front_default,
            d.other['official-artwork']?.front_shiny,
            d.other['home']?.front_default,
            d.front_default
        ].filter(Boolean);
        return urls.length >= 1 ? urls : null;
    } catch { return null; }
}

async function fetchWebPhotos(charName, source) {
    let urls = [];
    const query = encodeURIComponent(`${charName} character from ${source} game anime official art`);
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
            if (json.status) urls = [...urls, ...json.data.map(item => item.image)].slice(0, 6);
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

        const res = await axios({ url, method: 'GET', responseType: 'arraybuffer', timeout: 8000, headers: SCRAPER_HEADERS });
        if (res.data.toString('utf8', 0, 50).includes('<html')) return null;
        fs.writeFileSync(finalPath, res.data);
        return `https://raw.githubusercontent.com/nevi-dev/nevi-dev/main/fotos/${folderName}/${fileName}`;
    } catch { return null; }
}

// --- PROCESO ---

async function run() {
    let db = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    let changes = 0;

    // 1. Inyectar Personajes de las listas
    for (const char of NEW_CHARACTERS) {
        if (!db.some(c => c.name.toLowerCase() === char.name.toLowerCase())) {
            const nextId = (Math.max(...db.map(c => parseInt(c.id))) + 1).toString();
            db.push({ ...char, id: nextId, value: generatePrice(), img: [], vid: [], user: null, status: "Libre", votes: 0 });
            changes++;
        }
    }

    // 2. Auditoría: Pokémon (PokeAPI) y Nuevos (Web)
    for (let char of db) {
        const isPokemon = char.source?.toLowerCase().includes('pokemon');
        const isNewWithoutImages = char.img.length === 0;

        if (isPokemon || isNewWithoutImages) {
            await limit(async () => {
                console.log(`[PROCESANDO] ${char.name} | Origen: ${char.source}`);
                let urls = [];

                if (isPokemon) {
                    urls = await fetchPokeApi(char.name);
                } else {
                    urls = await fetchWebPhotos(char.name, char.source);
                }

                if (urls && urls.length > 0) {
                    const saved = [];
                    for (let i = 0; i < urls.length; i++) {
                        const link = await download(urls[i], char.name, i);
                        if (link) saved.push(link);
                    }
                    if (saved.length > 0) {
                        char.img = saved;
                        changes++;
                        console.log(`[EXITO] ${saved.length} fotos guardadas.`);
                    }
                }
                await new Promise(r => setTimeout(r, 1100));
            });
        }
    }

    if (changes > 0) {
        fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 4));
        try {
            execSync('git add . && git commit -m "Auto: Update cast y fotos especificas" && git push origin main');
            console.log("--- GITHUB ACTUALIZADO ---");
        } catch { console.log("Error al subir."); }
    } else {
        console.log("--- TODO AL DÍA ---");
    }
}

run();