import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const FILE_PATH = './characters.json';
const FOTOS_DIR = path.join(process.cwd(), 'fotos');
const REPO_BASE_URL = 'https://raw.githubusercontent.com/nevi-dev/nevi-dev/main/fotos';

const newEntries = [
    { name: "Akita Neru", source: "UTAU", gender: "Mujer" },
    { name: "Monika", source: "p-club", gender: "Mujer" },
    { name: "Natasha", source: "p-club", gender: "Mujer" },
    { name: "Yasuri", source: "p-club", gender: "Mujer" }
];

function getLocalImages(charName) {
    const charFolderName = charName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const folderPath = path.join(FOTOS_DIR, charFolderName);
    
    if (fs.existsSync(folderPath)) {
        return fs.readdirSync(folderPath)
            .filter(file => /\.(jpg|jpeg|png|webp|gif)$/i.test(file))
            .map(file => `${REPO_BASE_URL}/${charFolderName}/${file}`);
    }
    return [];
}

async function run() {
    let db = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    let currentId = Math.max(...db.map(c => parseInt(c.id) || 0));

    console.log("--- ACTUALIZANDO BASE DE DATOS LOCAL ---");

    // Agregar nuevos si no existen
    newEntries.forEach(entry => {
        if (!db.some(c => c.name.toLowerCase() === entry.name.toLowerCase())) {
            const photos = getLocalImages(entry.name);
            if (photos.length > 0) {
                currentId++;
                const price = Math.floor(Math.random() * (1900 - 1300 + 1)) + 1300;
                db.push({
                    id: currentId.toString(),
                    name: entry.name,
                    gender: entry.gender,
                    value: price.toString(),
                    source: entry.source,
                    img: photos,
                    vid: [], user: null, status: "Libre", votes: 0
                });
                console.log(`[AÑADIDO] ${entry.name} con valor ${price}.`);
            }
        }
    });

    // Actualizar rutas para todos (Borra Pinterest)
    db.forEach(char => {
        const photos = getLocalImages(char.name);
        if (photos.length > 0) {
            char.img = photos;
        }
    });

    fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 4));
    console.log("--- JSON LISTO PARA SUBIR ---");

    try {
        execSync('git add .');
        execSync('git commit -m "Update: Linked local photos and added Neru/P-Club"');
        execSync('git push origin main');
        console.log("--- DESPLIEGUE COMPLETO ---");
    } catch (e) {
        console.error("Error al subir:", e.message);
    }
}

run();