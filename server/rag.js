import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { embedText, loadEmbeddings, cosineSimilarity } from './embeddings.js';
import { isRateLimitError } from './retry.js';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, '..', 'data', 'knowledge-index.json');

let cachedIndex = null;

function loadIndex() {
  if (cachedIndex) return cachedIndex;
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error('Knowledge index not found. Run: npm run ingest');
  }
  cachedIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  return cachedIndex;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scoreChunk(chunk, queryTokens) {
  const chunkTokens = new Set(tokenize(chunk.text));
  const sourceTokens = tokenize(chunk.source);
  let score = 0;

  for (const token of queryTokens) {
    if (chunkTokens.has(token)) score += 2;
    if (sourceTokens.some((s) => s.includes(token) || token.includes(s))) score += 3;
    if (chunk.category.toLowerCase().includes(token)) score += 1;
  }

  const queryStr = queryTokens.join(' ');
  if (chunk.text.toLowerCase().includes(queryStr)) score += 5;

  return score;
}

function keywordRetrieve(query, limit) {
  const index = loadIndex();
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) {
    return index.chunks.slice(0, limit);
  }

  const scored = index.chunks
    .map((chunk, idx) => ({ chunk, idx, score: scoreChunk(chunk, queryTokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return index.chunks.slice(0, limit);
  }

  return scored.slice(0, limit).map((item) => item.chunk);
}

async function embeddingRetrieve(query, limit) {
  const index = loadIndex();
  const embeddings = loadEmbeddings();

  if (!embeddings || embeddings.vectors.length !== index.chunks.length) {
    return keywordRetrieve(query, limit);
  }

  try {
    const queryVector = await embedText(query, 'RETRIEVAL_QUERY');
    const scored = index.chunks
      .map((chunk, idx) => ({
        chunk,
        score: cosineSimilarity(queryVector, embeddings.vectors[idx]),
      }))
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((item) => item.chunk);
  } catch (err) {
    if (isRateLimitError(err)) {
      console.warn('Query embedding rate-limited, falling back to keyword search');
      return keywordRetrieve(query, limit);
    }
    throw err;
  }
}

export async function retrieveRelevantChunks(query, limit = config.maxContextChunks) {
  const embeddings = loadEmbeddings();
  if (embeddings && !config.skipQueryEmbed) {
    return embeddingRetrieve(query, limit);
  }
  return keywordRetrieve(query, limit);
}

export function buildContext(chunks) {
  return chunks
    .map(
      (chunk, i) =>
        `[Source ${i + 1}: ${chunk.source} | ${chunk.category}]\n${chunk.text}`
    )
    .join('\n\n---\n\n');
}

export function getIndexStats() {
  const index = loadIndex();
  const embeddings = loadEmbeddings();
  return {
    totalChunks: index.totalChunks,
    categories: index.categories,
    createdAt: index.createdAt,
    embeddings: embeddings
      ? { model: embeddings.model, dimension: embeddings.dimension, chunkCount: embeddings.chunkCount }
      : null,
  };
}
