import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const FILE_PATH = './characters.json';
const FOTOS_DIR = path.join(process.cwd(), 'fotos');
const REPO_BASE_URL = 'https://raw.githubusercontent.com/nevi-dev/nevi-dev/main/fotos';

// Personajes nuevos a integrar
const newEntries = [
    { name: "Akita Neru", source: "UTAU", gender: "Mujer" },
    { name: "Monika", source: "p-club", gender: "Mujer" },
    { name: "Natasha", source: "p-club", gender: "Mujer" },
    { name: "Yasuri", source: "p-club", gender: "Mujer" }
];

function getRawGithubUrls(charName) {
    // Normalizamos el nombre igual que antes para encontrar la carpeta
    const charFolderName = charName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const folderPath = path.join(FOTOS_DIR, charFolderName);
    
    if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath);
        return files
            .filter(file => /\.(jpg|jpeg|png|webp|gif)$/i.test(file))
            .map(file => `${REPO_BASE_URL}/${charFolderName}/${file}`);
    }
    return [];
}

async function run() {
    if (!fs.existsSync(FILE_PATH)) {
        console.error("No se encontró el archivo characters.json");
        return;
    }

    let db = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    let currentId = Math.max(...db.map(c => parseInt(c.id) || 0));

    console.log("--- PROCESANDO VINCULACIÓN DE ENLACES RAW ---");

    // 1. Agregar Neru y P-Club si hay fotos locales
    newEntries.forEach(entry => {
        if (!db.some(c => c.name.toLowerCase() === entry.name.toLowerCase())) {
            const rawUrls = getRawGithubUrls(entry.name);
            if (rawUrls.length > 0) {
                currentId++;
                const price = Math.floor(Math.random() * (1900 - 1300 + 1)) + 1300;
                db.push({
                    id: currentId.toString(),
                    name: entry.name,
                    gender: entry.gender,
                    value: price.toString(),
                    source: entry.source,
                    img: rawUrls,
                    vid: [], user: null, status: "Libre", votes: 0
                });
                console.log(`[NUEVO] ${entry.name} -> Agregado (Precio: ${price})`);
            }
        }
    });

    // 2. Actualizar el resto y limpiar Pinterest
    db.forEach(char => {
        const rawUrls = getRawGithubUrls(char.name);
        if (rawUrls.length > 0) {
            char.img = rawUrls;
        }
    });

    // Guardar JSON
    fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 4));
    console.log("--- JSON ACTUALIZADO CON ENLACES RAW ---");

    // 3. Subida limpia a GitHub
    try {
        console.log("--- SUBIENDO A GITHUB (IGNORANDO NODE_MODULES) ---");
        
        // Si por error se agregaron antes, esto los quita del seguimiento de git
        if (fs.existsSync('node_modules')) {
            try { execSync('git rm -r --cached node_modules'); } catch (e) { /* ignorar si no estaban */ }
        }

        execSync('git add .'); // Ahora respetará el .gitignore
        execSync('git commit -m "Update: Added Neru/P-Club and RAW links. Ignored node_modules"');
        execSync('git push origin main');
        console.log("--- PROCESO COMPLETADO EXITOSAMENTE ---");
    } catch (e) {
        console.error("Error al sincronizar:", e.message);
    }
}

run();