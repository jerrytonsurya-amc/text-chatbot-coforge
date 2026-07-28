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

function extractTerms(text, maxTerms = 60) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);

  return [...new Set(tokens)].slice(0, maxTerms);
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

function writeMonolithicCatalog(company, chunks) {
  const catalog = buildCatalogFromChunks(chunks);
  const outPath = path.join(CATALOG_DIR, `${company.toLowerCase()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(catalog));
  const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`${company} monolith: ${catalog.length} docs -> ${outPath} (${sizeMb} MB)`);
}

function writeSplitCatalog(company, chunks) {
  const catalog = buildCatalogFromChunks(chunks);
  const companyDir = path.join(CATALOG_DIR, company.toLowerCase());
  const docsDir = path.join(companyDir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });

  const indexDocs = [];

  for (const doc of catalog) {
    const fileName = `${String(doc.id).padStart(2, '0')}.json`;
    const docTerms = new Set();
    const compactChunks = doc.chunks.map((chunk) => {
      const terms = extractTerms(chunk.text);
      terms.forEach((term) => docTerms.add(term));
      return {
        id: chunk.id,
        text: chunk.text,
        terms,
      };
    });

    fs.writeFileSync(
      path.join(docsDir, fileName),
      JSON.stringify({
        source: doc.source,
        category: doc.category,
        company: doc.company,
        chunks: compactChunks,
      })
    );

    const preview = (doc.chunks[0]?.text || '').slice(0, 280).replace(/\s+/g, ' ').trim();
    indexDocs.push({
      id: doc.id,
      source: doc.source,
      category: doc.category,
      company: doc.company,
      file: fileName,
      terms: [...docTerms].slice(0, 200),
      preview,
      chunkCount: doc.chunks.length,
    });
  }

  const indexPath = path.join(companyDir, 'index.json');
  fs.writeFileSync(
    indexPath,
    JSON.stringify({
      company,
      version: 2,
      documents: indexDocs,
    })
  );

  const indexKb = (fs.statSync(indexPath).size / 1024).toFixed(1);
  const docsMb = (
    indexDocs.reduce((sum, doc) => sum + fs.statSync(path.join(docsDir, doc.file)).size, 0) /
    1024 /
    1024
  ).toFixed(2);

  console.log(
    `${company} split: ${indexDocs.length} docs, index ${indexKb} KB, doc files ${docsMb} MB -> ${companyDir}`
  );
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
  writeSplitCatalog('CIFC', cifcChunks);
  writeSplitCatalog('Coforge', coforgeChunks);
  writeMonolithicCatalog('CIFC', cifcChunks);
  writeMonolithicCatalog('Coforge', coforgeChunks);
  console.log('\nDone.');
}

buildCatalogs();
