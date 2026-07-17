import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import pdf from 'pdf-parse/lib/pdf-parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const EXTRACTED_DIR = path.join(ROOT, 'data', 'extracted');
const INDEX_PATH = path.join(ROOT, 'data', 'knowledge-index.json');

const ZIP_SOURCES = [
  { zip: 'AR.zip', dest: 'AR' },
  { zip: 'PPT.zip', dest: 'PPT' },
  { zip: 'Transcripts.zip', dest: 'Transcripts' },
];

function extractZips() {
  for (const { zip, dest } of ZIP_SOURCES) {
    const zipPath = path.join(ROOT, zip);
    const destPath = path.join(EXTRACTED_DIR, dest);
    if (!fs.existsSync(zipPath)) continue;
    if (fs.existsSync(destPath) && fs.readdirSync(destPath).length > 0) continue;

    fs.mkdirSync(destPath, { recursive: true });
    console.log(`Extracting ${zip}...`);
    execSync(`unzip -q -o "${zipPath}" -d "${destPath}"`, { cwd: ROOT });
  }
}

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

function chunkText(text, source, category) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const chunks = [];
  let start = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + CHUNK_SIZE, cleaned.length);
    let slice = cleaned.slice(start, end);

    if (end < cleaned.length) {
      const lastSpace = slice.lastIndexOf(' ');
      if (lastSpace > CHUNK_SIZE * 0.6) {
        slice = slice.slice(0, lastSpace);
      }
    }

    chunks.push({
      id: `${source}-${chunks.length}`,
      source,
      category,
      text: slice.trim(),
    });

    if (end >= cleaned.length) break;
    start += slice.length - CHUNK_OVERLAP;
    if (start < 0) start = 0;
  }

  return chunks;
}

async function extractPdf(filePath, category) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const source = path.basename(filePath);
  return chunkText(data.text, source, category);
}

async function walkPdfs(dir, category) {
  const chunks = [];
  if (!fs.existsSync(dir)) return chunks;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      chunks.push(...(await walkPdfs(fullPath, category)));
    } else if (entry.name.toLowerCase().endsWith('.pdf')) {
      try {
        console.log(`Processing: ${fullPath}`);
        const pdfChunks = await extractPdf(fullPath, category);
        chunks.push(...pdfChunks);
        console.log(`  -> ${pdfChunks.length} chunks`);
      } catch (err) {
        console.warn(`  Skipped ${fullPath}: ${err.message}`);
      }
    }
  }

  return chunks;
}

async function ingest() {
  console.log('Starting document ingestion...\n');
  extractZips();

  const allChunks = [];

  const categories = [
    { dir: path.join(EXTRACTED_DIR, 'AR'), category: 'Annual Reports' },
    { dir: path.join(EXTRACTED_DIR, 'PPT'), category: 'Investor Presentations' },
    { dir: path.join(EXTRACTED_DIR, 'Transcripts'), category: 'Earnings Transcripts' },
  ];

  for (const { dir, category } of categories) {
    console.log(`\nCategory: ${category}`);
    const chunks = await walkPdfs(dir, category);
    allChunks.push(...chunks);
  }

  const index = {
    createdAt: new Date().toISOString(),
    totalChunks: allChunks.length,
    categories: [...new Set(allChunks.map((c) => c.category))],
    chunks: allChunks,
  };

  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));

  console.log(`\nDone! Indexed ${allChunks.length} chunks -> ${INDEX_PATH}`);

  if (process.env.SKIP_EMBED === '1') {
    console.log('Skipping embeddings (SKIP_EMBED=1)');
    return;
  }

  const { generateChunkEmbeddings, saveEmbeddings } = await import('./embeddings.js');
  console.log('\nGenerating embeddings with gemini-embedding-2...');
  const embeddingData = await generateChunkEmbeddings(allChunks, (batch, total, done, all) => {
    console.log(`  Batch ${batch}/${total} (${done}/${all} chunks)`);
  });
  saveEmbeddings(embeddingData);
  console.log('Embeddings complete.');
}

ingest().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
