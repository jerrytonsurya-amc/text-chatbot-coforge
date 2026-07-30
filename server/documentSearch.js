import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { withRetry, isRateLimitError } from './retry.js';
import { COMPANY } from '../shared/company.js';
import { generateText } from './claude.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, '..', 'data', 'knowledge-index.json');
const CATALOG_DIR = path.join(__dirname, '..', 'data', 'catalogs');

function getCatalogPath() {
  return path.join(CATALOG_DIR, 'cifc.json');
}

function getSplitCatalogDir() {
  return path.join(CATALOG_DIR, 'cifc');
}

function hasSplitCatalog() {
  return fs.existsSync(path.join(getSplitCatalogDir(), 'index.json'));
}

function getChunkCompany(chunk) {
  return chunk.company || (chunk.category.startsWith('CIFC') ? 'CIFC' : 'Coforge');
}

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
  vehicle: ['vehicle', 'vehicles', 'auto', 'commercial', 'passenger', 'cv', 'pv'],
  aum: ['aum', 'assets under management', 'book size', 'loan book', 'portfolio'],
  segment: ['segment', 'vertical', 'business mix', 'product mix'],
};

let cachedIndex = null;
let cachedCatalog = null;
const searchIndexCache = new Map();
const documentFileCache = new Map();

function loadIndex() {
  if (cachedIndex) return cachedIndex;
  if (globalThis.__knowledgeIndex) {
    cachedIndex = globalThis.__knowledgeIndex;
    return cachedIndex;
  }
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error('Knowledge index not found. Run: npm run ingest');
  }
  cachedIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  cachedIndex.chunks = cachedIndex.chunks.filter((chunk) => getChunkCompany(chunk) === COMPANY);
  cachedIndex.totalChunks = cachedIndex.chunks.length;
  globalThis.__knowledgeIndex = cachedIndex;
  return cachedIndex;
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

function detectTargetCompany() {
  return COMPANY;
}

function getChunkTermSet(chunk) {
  if (chunk._termSet) return chunk._termSet;
  if (chunk.terms?.length) {
    chunk._termSet = new Set(chunk.terms);
    return chunk._termSet;
  }
  chunk._termSet = new Set(tokenize(chunk.text));
  return chunk._termSet;
}

function scoreChunk(chunk, queryTokens, targetCompany = null) {
  const chunkTokens = getChunkTermSet(chunk);
  const sourceTokens = tokenize(chunk.source || '');
  let score = 0;

  for (const token of queryTokens) {
    if (chunkTokens.has(token)) score += 2;
    if (sourceTokens.some((s) => s.includes(token) || token.includes(s))) score += 4;
    if (chunk.category?.toLowerCase().includes(token)) score += 1;
  }

  const queryStr = queryTokens.join(' ');
  if (chunk.text?.toLowerCase().includes(queryStr)) score += 8;

  const company = chunk.company || (chunk.category?.startsWith('CIFC') ? 'CIFC' : 'Coforge');
  if (targetCompany === company) score += 12;
  if (targetCompany && targetCompany !== company) score = Math.max(0, score - 8);

  return score;
}

function loadSearchIndex() {
  const cacheKey = 'index:CIFC';

  if (searchIndexCache.has(cacheKey)) {
    return searchIndexCache.get(cacheKey);
  }

  if (globalThis.__searchIndex_CIFC) {
    searchIndexCache.set(cacheKey, globalThis.__searchIndex_CIFC);
    return globalThis.__searchIndex_CIFC;
  }

  const indexPath = path.join(getSplitCatalogDir(), 'index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  searchIndexCache.set(cacheKey, index);
  globalThis.__searchIndex_CIFC = index;
  return index;
}

function loadDocumentFile(fileName) {
  const cacheKey = `CIFC/${fileName}`;

  if (documentFileCache.has(cacheKey)) {
    return documentFileCache.get(cacheKey);
  }

  const globalKey = `__doc_${cacheKey}`;
  if (globalThis[globalKey]) {
    documentFileCache.set(cacheKey, globalThis[globalKey]);
    return globalThis[globalKey];
  }

  const docPath = path.join(getSplitCatalogDir(), 'docs', fileName);
  const doc = JSON.parse(fs.readFileSync(docPath, 'utf-8'));
  documentFileCache.set(cacheKey, doc);
  globalThis[globalKey] = doc;
  return doc;
}

function hydrateChunk(chunk, doc) {
  return {
    ...chunk,
    source: doc.source,
    category: doc.category,
    company: doc.company,
  };
}

function scoreDocMeta(docMeta, queryTokens, targetCompany = null) {
  const docTerms = docMeta._termSet || new Set(docMeta.terms || []);
  docMeta._termSet = docTerms;
  const sourceTokens = tokenize(docMeta.source);
  let maxScore = 0;
  let totalScore = 0;
  let matchCount = 0;

  for (const token of queryTokens) {
    if (docTerms.has(token)) {
      maxScore += 2;
      totalScore += 2;
      matchCount += 1;
    }
    if (sourceTokens.some((s) => s.includes(token) || token.includes(s))) {
      maxScore += 4;
      totalScore += 4;
    }
    if (docMeta.category.toLowerCase().includes(token)) {
      maxScore += 1;
      totalScore += 1;
    }
  }

  const company = docMeta.company || (docMeta.category.startsWith('CIFC') ? 'CIFC' : 'Coforge');
  if (targetCompany === company) {
    maxScore += 12;
    totalScore += 12;
  }

  return {
    ...docMeta,
    chunks: [],
    matchCount: matchCount || (maxScore > 0 ? 1 : 0),
    maxScore,
    totalScore,
    combinedScore: maxScore * 4 + totalScore + (matchCount || (maxScore > 0 ? 1 : 0)) * 2,
    preview: docMeta.preview || '',
  };
}

function loadAndScoreDocument(docMeta, queryTokens) {
  const loaded = loadDocumentFile(docMeta.file);
  const scoredChunks = loaded.chunks
    .map((chunk) => ({
      chunk: hydrateChunk(chunk, loaded),
      score: scoreChunk(hydrateChunk(chunk, loaded), queryTokens, COMPANY),
    }))
    .sort((a, b) => b.score - a.score);

  const matching = scoredChunks.filter((item) => item.score > 0);
  const maxScore = matching[0]?.score || scoredChunks[0]?.score || docMeta.maxScore || 0;
  const totalScore =
    matching.reduce((sum, item) => sum + item.score, 0) || docMeta.totalScore || 0;
  const topPreview = matching[0]?.chunk.text || scoredChunks[0]?.chunk.text || docMeta.preview || '';

  return {
    id: docMeta.id,
    source: loaded.source,
    category: loaded.category,
    company: loaded.company,
    file: docMeta.file,
    chunks: loaded.chunks.map((chunk) => hydrateChunk(chunk, loaded)),
    scoredChunks,
    matchCount: matching.length || docMeta.matchCount || 0,
    maxScore,
    totalScore,
    combinedScore: maxScore * 4 + totalScore + matching.length * 2,
    preview: topPreview.slice(0, 280).replace(/\s+/g, ' ').trim(),
  };
}

function scoreFromSplitCatalog(query) {
  const index = loadSearchIndex();
  const queryTokens = expandQueryTokens(tokenize(query));
  const ranked = index.documents
    .map((doc) => scoreDocMeta(doc, queryTokens, COMPANY))
    .sort((a, b) => b.combinedScore - a.combinedScore);

  return ranked.map((docMeta) => loadAndScoreDocument(docMeta, queryTokens));
}

function getSplitCatalogDocumentCount() {
  if (!hasSplitCatalog()) return null;
  return loadSearchIndex().documents.length;
}

export function buildDocumentCatalog() {
  if (hasSplitCatalog()) {
    const index = loadSearchIndex();
    return index.documents.map((doc) => ({
      id: doc.id,
      source: doc.source,
      category: doc.category,
      company: doc.company,
      chunks: [],
      chunkCount: doc.chunkCount,
    }));
  }

  if (cachedCatalog) return cachedCatalog;
  if (globalThis.__documentCatalog) {
    cachedCatalog = globalThis.__documentCatalog;
    return cachedCatalog;
  }

  const index = loadIndex();
  const docs = new Map();

  for (const chunk of index.chunks) {
    if (getChunkCompany(chunk) !== COMPANY) continue;
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

  cachedCatalog = [...docs.values()];
  globalThis.__documentCatalog = cachedCatalog;
  return cachedCatalog;
}

function loadCompanyCatalog(company) {
  const normalized = company === 'CIFC' ? 'CIFC' : 'Coforge';
  const cacheKey = `__catalog_${normalized}`;

  if (globalThis[cacheKey]) {
    return globalThis[cacheKey];
  }

  const catalogPath = getCatalogPath();
  if (fs.existsSync(catalogPath)) {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    globalThis[cacheKey] = catalog;
    return catalog;
  }

  const index = loadIndex();
  const docs = new Map();

  for (const chunk of index.chunks) {
    if (getChunkCompany(chunk) !== normalized) continue;
    const key = `${chunk.source}::${chunk.category}`;
    if (!docs.has(key)) {
      docs.set(key, {
        id: docs.size + 1,
        source: chunk.source,
        category: chunk.category,
        company: normalized,
        chunks: [],
      });
    }
    docs.get(key).chunks.push(chunk);
  }

  const catalog = [...docs.values()];
  globalThis[cacheKey] = catalog;
  return catalog;
}

export function scoreAllDocuments(query) {
  if (hasSplitCatalog()) {
    return scoreFromSplitCatalog(query);
  }

  const catalog = buildDocumentCatalog();
  const queryTokens = expandQueryTokens(tokenize(query));

  return catalog
    .map((doc) => {
      const scoredChunks = doc.chunks
        .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens, COMPANY) }))
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

function sampleSpreadChunks(rescored, maxCount) {
  if (rescored.length === 0) return [];
  if (rescored.length <= maxCount) return rescored;

  const len = rescored.length;
  const pickIndices = [
    0,
    Math.floor(len / 4),
    Math.floor(len / 2),
    Math.floor((3 * len) / 4),
    len - 1,
  ]
    .filter((value, index, arr) => value >= 0 && value < len && arr.indexOf(value) === index)
    .slice(0, maxCount);

  return pickIndices.map((index) => rescored[index]).filter(Boolean);
}

function pickTopChunksForDoc(doc, query, company, maxCount) {
  const queryTokens = expandQueryTokens(tokenize(query));
  const rescored = doc.scoredChunks?.length
    ? doc.scoredChunks
    : doc.chunks
        .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens, company) }))
        .sort((a, b) => b.score - a.score);

  let selected = rescored.filter((item) => item.score > 0).slice(0, maxCount);
  if (selected.length === 0) {
    selected = sampleSpreadChunks(rescored, maxCount);
  }

  return selected.map((item) => item.chunk);
}

function pickChunksFromDocuments(documents, query, company, maxPerSource) {
  const chunks = [];
  for (const doc of documents) {
    chunks.push(...pickTopChunksForDoc(doc, query, company, maxPerSource));
  }
  return chunks;
}

function totalChunkChars(chunks) {
  return chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
}

function enforceChunkBudget(chunks, documents, budget) {
  const byDocKey = (chunk) => `${chunk.source}::${chunk.category}`;
  const grouped = new Map();

  for (const chunk of chunks) {
    const key = byDocKey(chunk);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(chunk);
  }

  const selected = [];
  const selectedIds = new Set();

  for (const doc of documents) {
    const key = `${doc.source}::${doc.category}`;
    const docChunks = grouped.get(key);
    if (!docChunks?.length) continue;
    selected.push(docChunks[0]);
    selectedIds.add(docChunks[0].id);
  }

  let charCount = totalChunkChars(selected);

  for (const chunk of chunks) {
    if (selectedIds.has(chunk.id)) continue;
    if (charCount + chunk.text.length > budget) continue;
    selected.push(chunk);
    selectedIds.add(chunk.id);
    charCount += chunk.text.length;
  }

  return selected;
}

function limitDocumentsForRuntime(documents, company) {
  if (process.env.VERCEL !== '1' || documents.length <= config.vercelMaxDocuments) {
    return documents;
  }

  const categories =
    company === 'CIFC'
      ? ['CIFC Annual Reports', 'CIFC Investor Presentations', 'CIFC Earnings Transcripts']
      : ['Annual Reports', 'Investor Presentations', 'Earnings Transcripts'];

  const picked = [];
  const used = new Set();

  for (const category of categories) {
    const doc = documents.find((item) => item.category === category);
    if (!doc) continue;
    const key = `${doc.source}::${doc.category}`;
    picked.push(doc);
    used.add(key);
  }

  for (const doc of documents) {
    if (picked.length >= config.vercelMaxDocuments) break;
    const key = `${doc.source}::${doc.category}`;
    if (used.has(key)) continue;
    picked.push(doc);
    used.add(key);
  }

  return picked;
}

export async function researchCompanyLibrary(query) {
  const totalDocuments = getSplitCatalogDocumentCount();
  const scoredDocs = scoreAllDocuments(query);
  const documents = scoredDocs;
  const budget = config.maxDirectContextChars;

  let maxPerSource = config.maxChunksPerSourceFull;
  let chunks = pickChunksFromDocuments(documents, query, COMPANY, maxPerSource);

  while (totalChunkChars(chunks) > budget && maxPerSource > 1) {
    maxPerSource -= 1;
    chunks = pickChunksFromDocuments(documents, query, COMPANY, maxPerSource);
  }

  if (totalChunkChars(chunks) > budget) {
    chunks = enforceChunkBudget(chunks, documents, budget);
  }

  return {
    context: buildContext(chunks),
    chunks,
    documents,
    scoredDocs,
    selectionMethod: 'full_library',
    charCount: totalChunkChars(chunks),
    totalDocuments: totalDocuments ?? documents.length,
  };
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
  return doc.company || doc.chunks[0]?.company || (doc.category.startsWith('CIFC') ? 'CIFC' : 'Coforge');
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

  const result = await withRetry(() => generateText(prompt, { maxTokens: 512 }));

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
  const targetCompany = forcedCompany || COMPANY;
  const scoredDocs = scoreAllDocuments(query);

  if (forcedCompany) {
    const documents = filterDocsByCompany(scoredDocs, forcedCompany);
    return {
      documents,
      scoredDocs,
      selectionMethod: 'full_library',
      targetCompany: forcedCompany,
      fullResearch: true,
    };
  }

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
  targetCompany = null,
  { fullResearch = false } = {}
) {
  if (fullResearch) {
    return pickChunksFromDocuments(documents, query, targetCompany, config.maxChunksPerSourceFull);
  }

  const queryTokens = expandQueryTokens(tokenize(query));
  const company = targetCompany || detectTargetCompany(query);
  const maxPerSource = config.maxChunksPerSource;

  const perDoc = documents.map((doc) => {
    const rescored = doc.chunks
      .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens, company) }))
      .sort((a, b) => b.score - a.score);

    let selected = rescored.filter((item) => item.score > 0);

    if (selected.length === 0) {
      selected = sampleSpreadChunks(rescored, maxPerSource);
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

export function getSearchStats(scoredDocs, selectedDocs, chunks, totalDocuments = null) {
  return {
    totalDocuments: totalDocuments ?? scoredDocs.length,
    documentsSelected: selectedDocs.length,
    chunksUsed: chunks.length,
    selectedSources: selectedDocs.map((doc) => `${doc.source} (${doc.category})`),
  };
}
