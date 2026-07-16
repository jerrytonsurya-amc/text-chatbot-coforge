import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMBEDDINGS_PATH = path.join(__dirname, '..', 'data', 'embeddings.json');

const EMBEDDING_MODEL = config.embeddingModel;
const EMBEDDING_DIM = 768;
const BATCH_SIZE = config.embedBatchSize;
const BATCH_DELAY_MS = config.embedBatchDelayMs;

let genAI = null;

function getClient() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function embedText(text, taskType = 'RETRIEVAL_QUERY') {
  const model = getClient().getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent({
    content: { parts: [{ text: text.slice(0, 8000) }] },
    taskType,
    outputDimensionality: EMBEDDING_DIM,
  });
  return result.embedding.values;
}

export async function embedBatch(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  const model = getClient().getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.batchEmbedContents({
    requests: texts.map((text) => ({
      content: { parts: [{ text: text.slice(0, 8000) }] },
      taskType,
      outputDimensionality: EMBEDDING_DIM,
    })),
  });
  return result.embeddings.map((e) => e.values);
}

export async function generateChunkEmbeddings(chunks, onProgress) {
  const vectors = new Array(chunks.length);
  const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => `${c.source} | ${c.category}\n${c.text}`);

    let attempt = 0;
    while (attempt < 4) {
      try {
        const embeddings = await embedBatch(texts, 'RETRIEVAL_DOCUMENT');
        embeddings.forEach((vec, j) => {
          vectors[i + j] = vec;
        });
        onProgress?.(batchNum, totalBatches, i + batch.length, chunks.length);
        break;
      } catch (err) {
        attempt += 1;
        const is429 = err.message?.includes('429') || err.message?.includes('quota');
        if (!is429 || attempt >= 4) throw err;
        const waitMs = 30000 * attempt;
        console.warn(`  Rate limited, waiting ${waitMs / 1000}s before retry...`);
        await sleep(waitMs);
      }
    }

    if (i + BATCH_SIZE < chunks.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return {
    model: EMBEDDING_MODEL,
    dimension: EMBEDDING_DIM,
    chunkCount: chunks.length,
    vectors,
  };
}

export function saveEmbeddings(data) {
  fs.mkdirSync(path.dirname(EMBEDDINGS_PATH), { recursive: true });
  fs.writeFileSync(EMBEDDINGS_PATH, JSON.stringify(data));
  console.log(`Saved embeddings -> ${EMBEDDINGS_PATH}`);
}

let cachedEmbeddings = null;

export function loadEmbeddings() {
  if (cachedEmbeddings) return cachedEmbeddings;
  if (!fs.existsSync(EMBEDDINGS_PATH)) return null;
  cachedEmbeddings = JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, 'utf-8'));
  return cachedEmbeddings;
}

export function hasEmbeddings() {
  return loadEmbeddings() !== null;
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
