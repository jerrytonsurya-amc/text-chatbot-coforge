import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'data', 'knowledge-index.json');
const CATALOG_DIR = path.join(ROOT, 'data', 'catalogs');

function getChunkCompany(chunk) {
  return chunk.company || (chunk.category.startsWith('CIFC') ? 'CIFC' : 'Coforge');
}

function buildCatalogFromChunks(chunks) {
  const docs = new Map();

  for (const chunk of chunks) {
    const key = `${chunk.source}::${chunk.category}`;
    if (!docs.has(key)) {
      docs.set(key, {
        id: docs.size + 1,
        source: chunk.source,
        category: chunk.category,
        company: getChunkCompany(chunk),
        chunks: [],
      });
    }
    docs.get(key).chunks.push(chunk);
  }

  return [...docs.values()];
}

function writeCatalog(company, chunks) {
  const catalog = buildCatalogFromChunks(chunks);
  const outPath = path.join(CATALOG_DIR, `${company.toLowerCase()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(catalog));
  const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`${company}: ${catalog.length} documents, ${chunks.length} chunks -> ${outPath} (${sizeMb} MB)`);
}

function buildCatalogs() {
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error(`Missing ${INDEX_PATH}. Run: npm run ingest:fast`);
  }

  console.log('Building company catalogs...\n');
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  const cifcChunks = index.chunks.filter((chunk) => getChunkCompany(chunk) === 'CIFC');
  const coforgeChunks = index.chunks.filter((chunk) => getChunkCompany(chunk) === 'Coforge');

  fs.mkdirSync(CATALOG_DIR, { recursive: true });
  writeCatalog('CIFC', cifcChunks);
  writeCatalog('Coforge', coforgeChunks);
  console.log('\nDone.');
}

buildCatalogs();
