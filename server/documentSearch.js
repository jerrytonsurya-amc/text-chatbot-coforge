import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';
import { withRetry, isRateLimitError } from './retry.js';
import { detectQuestionCompany } from '../shared/companyGuard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, '..', 'data', 'knowledge-index.json');

const QUERY_EXPANSIONS = {
  revenue: ['revenue', 'income', 'topline', 'sales', 'turnover', 'operations'],
  margin: ['margin', 'ebitda', 'operating', 'profitability', 'profit'],
  acquisition: ['acquisition', 'acquire', 'encora', 'merger', 'deal'],
  dividend: ['dividend', 'payout', 'shareholder', 'interim', 'final'],
  equity: ['equity', 'eps', 'share', 'stock', 'roe', 'capital', 'esop'],
  sector: ['vertical', 'bfs', 'bfsi', 'banking', 'insurance', 'travel', 'sector', 'industry', 'tth'],
  growth: ['growth', 'yoy', 'increase', 'cagr', 'expansion'],
  earnings: ['earnings', 'transcript', 'call', 'quarter', 'q1', 'q2', 'q3', 'q4', 'fy'],
  client: ['client', 'customer', 'deal', 'wins', 'pipeline'],
  guidance: ['guidance', 'outlook', 'forecast', 'target'],
};

let cachedIndex = null;
let cachedCatalog = null;
let genAI = null;

function loadIndex() {
  if (cachedIndex) return cachedIndex;
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error('Knowledge index not found. Run: npm run ingest');
  }
  cachedIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  return cachedIndex;
}

function getClient() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function expandQueryTokens(queryTokens) {
  const expanded = new Set(queryTokens);

  for (const token of queryTokens) {
    for (const synonyms of Object.values(QUERY_EXPANSIONS)) {
      if (synonyms.some((s) => s.includes(token) || token.includes(s))) {
        synonyms.forEach((s) => expanded.add(s));
      }
    }
  }

  return [...expanded];
}

function detectTargetCompany(query) {
  const detected = detectQuestionCompany(query);
  if (detected === 'both') return null;
  return detected;
}

function scoreChunk(chunk, queryTokens, targetCompany = null) {
  const chunkTokens = new Set(tokenize(chunk.text));
  const sourceTokens = tokenize(chunk.source);
  let score = 0;

  for (const token of queryTokens) {
    if (chunkTokens.has(token)) score += 2;
    if (sourceTokens.some((s) => s.includes(token) || token.includes(s))) score += 4;
    if (chunk.category.toLowerCase().includes(token)) score += 1;
  }

  const queryStr = queryTokens.join(' ');
  if (chunk.text.toLowerCase().includes(queryStr)) score += 8;

  const company = chunk.company || (chunk.category.startsWith('CIFC') ? 'CIFC' : 'Coforge');
  if (targetCompany === company) score += 12;
  if (targetCompany && targetCompany !== company) score = Math.max(0, score - 8);

  return score;
}

export function buildDocumentCatalog() {
  if (cachedCatalog) return cachedCatalog;

  const index = loadIndex();
  const docs = new Map();

  for (const chunk of index.chunks) {
    const key = `${chunk.source}::${chunk.category}`;
    if (!docs.has(key)) {
      docs.set(key, {
        id: docs.size + 1,
        source: chunk.source,
        category: chunk.category,
        chunks: [],
      });
    }
    docs.get(key).chunks.push(chunk);
  }

  cachedCatalog = [...docs.values()];
  return cachedCatalog;
}

export function scoreAllDocuments(query, forcedCompany = null) {
  const catalog = buildDocumentCatalog();
  const queryTokens = expandQueryTokens(tokenize(query));
  const targetCompany = forcedCompany || detectTargetCompany(query);

  const filteredCatalog = filterDocsByCompany(catalog, targetCompany);

  return filteredCatalog
    .map((doc) => {
      const scoredChunks = doc.chunks
        .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens, targetCompany) }))
        .sort((a, b) => b.score - a.score);

      const matching = scoredChunks.filter((item) => item.score > 0);
      const maxScore = matching[0]?.score || 0;
      const totalScore = matching.reduce((sum, item) => sum + item.score, 0);
      const topPreview = matching[0]?.chunk.text || scoredChunks[0]?.chunk.text || '';

      return {
        ...doc,
        scoredChunks,
        matchCount: matching.length,
        maxScore,
        totalScore,
        combinedScore: maxScore * 4 + totalScore + matching.length * 2,
        preview: topPreview.slice(0, 280).replace(/\s+/g, ' ').trim(),
      };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore);
}

function parseDocumentSelection(text, maxId) {
  const match = text.match(/\[[\d,\s]+\]/);
  if (!match) return null;

  try {
    const ids = JSON.parse(match[0]);
    if (!Array.isArray(ids)) return null;
    return [...new Set(ids.map((n) => parseInt(n, 10)).filter((n) => n >= 1 && n <= maxId))];
  } catch {
    return null;
  }
}

function getDocCompany(doc) {
  return doc.chunks[0]?.company || (doc.category.startsWith('CIFC') ? 'CIFC' : 'Coforge');
}

function filterDocsByCompany(scoredDocs, targetCompany) {
  if (!targetCompany) return scoredDocs;
  return scoredDocs.filter((doc) => getDocCompany(doc) === targetCompany);
}

function fallbackDocumentSelection(scoredDocs, limit, targetCompany = null) {
  const pool = filterDocsByCompany(scoredDocs, targetCompany);
  const selected = [];
  const usedKeys = new Set();
  const categoriesSeen = new Set();

  const categories =
    targetCompany === 'CIFC'
      ? ['CIFC Annual Reports', 'CIFC Investor Presentations', 'CIFC Earnings Transcripts']
      : targetCompany === 'Coforge'
        ? ['Annual Reports', 'Investor Presentations', 'Earnings Transcripts']
        : [
            'Annual Reports',
            'Investor Presentations',
            'Earnings Transcripts',
            'CIFC Annual Reports',
            'CIFC Investor Presentations',
            'CIFC Earnings Transcripts',
          ];

  const addDoc = (doc) => {
    const key = `${doc.source}::${doc.category}`;
    if (usedKeys.has(key) || selected.length >= limit) return;
    usedKeys.add(key);
    categoriesSeen.add(doc.category);
    selected.push(doc);
  };

  for (const doc of pool) {
    if (doc.combinedScore <= 0) continue;
    addDoc(doc);
  }

  for (const category of categories) {
    if (selected.length >= limit) break;
    if (categoriesSeen.has(category)) continue;
    const bestInCategory = pool.find((doc) => doc.category === category);
    if (bestInCategory) addDoc(bestInCategory);
  }

  if (selected.length === 0) {
    return pool.slice(0, limit);
  }

  for (const doc of pool) {
    if (selected.length >= limit) break;
    addDoc(doc);
  }

  return selected;
}

async function selectDocumentsWithAI(query, scoredDocs, limit, targetCompany = null) {
  const pool = filterDocsByCompany(scoredDocs, targetCompany);
  const shortlist = pool.slice(0, Math.min(pool.length, 30));
  const catalogText = shortlist
    .map(
      (doc) =>
        `${doc.id}. [${doc.category}] ${doc.source}\n   Snippet: ${doc.preview || 'No preview available.'}`
    )
    .join('\n\n');

  const companyNote = targetCompany
    ? `Only select documents for ${targetCompany === 'CIFC' ? 'Cholamandalam (CIFC)' : 'Coforge'}.`
    : 'Select documents for the company referenced in the question (Coforge or CIFC/Cholamandalam).';

  const prompt = `You are a research assistant for Coforge Limited and Cholamandalam Investment and Finance Company (CIFC).

QUESTION: ${query}
${companyNote}

Below is the document library (${shortlist.length} files). Select every document that may contain facts needed to answer the question well.

Document types:
- Annual Reports: audited financials, share capital, dividends, vertical mix
- Investor Presentations: strategy, growth, sector highlights
- Earnings Transcripts: quarterly results, management commentary, guidance

DOCUMENT LIBRARY:
${catalogText}

Instructions:
- Include ALL documents with relevant information, not just one file.
- Prefer the most recent FY/quarter documents when the question asks for "latest" or "current".
- Return ONLY a JSON array of document numbers, e.g. [1, 4, 7, 12]
- Select up to ${limit} documents.`;

  const model = getClient().getGenerativeModel({ model: config.chatModel });
  const result = await withRetry(async () => {
    const response = await model.generateContent(prompt);
    return response.response.text();
  });

  const ids = parseDocumentSelection(result, shortlist.length);
  if (!ids || ids.length === 0) {
    return fallbackDocumentSelection(scoredDocs, limit, targetCompany);
  }

  const idSet = new Set(ids);
  const selected = shortlist.filter((doc) => idSet.has(doc.id));

  if (selected.length === 0) {
    return fallbackDocumentSelection(scoredDocs, limit, targetCompany);
  }

  return selected.slice(0, limit);
}

export async function selectRelevantDocuments(query, forcedCompany = null) {
  const targetCompany = forcedCompany || detectTargetCompany(query);
  const scoredDocs = scoreAllDocuments(query, targetCompany);
  const limit = config.maxDocumentsToUse;

  if (config.useAiDocumentSelection) {
    try {
      const aiSelected = await selectDocumentsWithAI(query, scoredDocs, limit, targetCompany);
      if (aiSelected.length > 0) {
        return { documents: aiSelected, scoredDocs, selectionMethod: 'ai', targetCompany };
      }
    } catch (err) {
      if (!isRateLimitError(err)) {
        console.warn('AI document selection failed, using keyword fallback:', err.message);
      } else {
        throw err;
      }
    }
  }

  return {
    documents: fallbackDocumentSelection(scoredDocs, limit, targetCompany),
    scoredDocs,
    selectionMethod: 'keyword',
    targetCompany,
  };
}

export function retrieveChunksFromDocuments(
  documents,
  query,
  limit = config.maxContextChunks,
  targetCompany = null
) {
  const queryTokens = expandQueryTokens(tokenize(query));
  const company = targetCompany || detectTargetCompany(query);
  const maxPerSource = config.maxChunksPerSource;

  const perDoc = documents.map((doc) => {
    const rescored = doc.chunks
      .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens, company) }))
      .sort((a, b) => b.score - a.score);

    let selected = rescored.filter((item) => item.score > 0);

    if (selected.length === 0) {
      const len = rescored.length;
      const pickIndices = [
        0,
        Math.floor(len / 4),
        Math.floor(len / 2),
        Math.floor((3 * len) / 4),
        len - 1,
      ].filter((value, index, arr) => value >= 0 && value < len && arr.indexOf(value) === index);

      selected = pickIndices.map((index) => rescored[index]).filter(Boolean);
    }

    return selected.slice(0, maxPerSource);
  });

  const chunks = [];
  for (let round = 0; round < maxPerSource && chunks.length < limit; round += 1) {
    for (const items of perDoc) {
      if (chunks.length >= limit) break;
      if (round < items.length) {
        chunks.push(items[round].chunk);
      }
    }
  }

  return chunks.slice(0, limit);
}

export function buildContext(chunks) {
  const grouped = new Map();

  for (const chunk of chunks) {
    const key = `${chunk.source} | ${chunk.category}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(chunk);
  }

  const sections = [];
  let docNum = 1;

  for (const [docLabel, docChunks] of grouped) {
    const excerpts = docChunks
      .map((chunk, i) => {
        const prefix = docChunks.length > 1 ? `[Excerpt ${i + 1}]\n` : '';
        return `${prefix}${chunk.text}`;
      })
      .join('\n\n');

    sections.push(`=== Document ${docNum}: ${docLabel} ===\n${excerpts}`);
    docNum += 1;
  }

  return sections.join('\n\n---\n\n');
}

export function getSearchStats(scoredDocs, selectedDocs, chunks) {
  return {
    totalDocuments: scoredDocs.length,
    documentsSelected: selectedDocs.length,
    chunksUsed: chunks.length,
    selectedSources: selectedDocs.map((doc) => `${doc.source} (${doc.category})`),
  };
}
