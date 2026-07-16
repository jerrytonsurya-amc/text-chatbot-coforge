import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateChunkEmbeddings, saveEmbeddings } from './embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, '..', 'data', 'knowledge-index.json');

async function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error('Run npm run ingest first.');
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  console.log(`Embedding ${index.chunks.length} chunks with gemini-embedding-2...\n`);

  const data = await generateChunkEmbeddings(index.chunks, (batch, total, done, all) => {
    console.log(`Batch ${batch}/${total} (${done}/${all})`);
  });

  saveEmbeddings(data);
  console.log('\nDone!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
