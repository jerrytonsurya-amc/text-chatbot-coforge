import { GoogleGenerativeAI } from '@google/generative-ai';
import { retrieveRelevantChunks, buildContext } from './rag.js';
import {
  getActiveModel,
  withRetry,
  getCachedAnswer,
  setCachedAnswer,
  isRateLimitError,
  formatRateLimitError,
} from './retry.js';
import { config } from './config.js';
import { ensureNumericTables } from './formatMarkdown.js';
import { getTabMismatchMessage } from '../shared/companyGuard.js';

const COFORGE_PROMPT = `You are a knowledgeable assistant for Coforge Limited. Answer using ONLY the provided context from Coforge Annual Reports, Investor Presentations, and Earnings Transcripts.

Rules:
1. Be clear, structured, and easy to understand.
2. If the answer is not in the context, say so clearly.
3. Cite source document names when stating facts or figures.
4. Always mention the period (FY, quarter, or date) for financial figures.
5. Use the CURRENT DATE AND TIME provided in each request to interpret "latest", "recent", "current", "last quarter/FY", and similar phrases. Coforge's financial year is April–March (e.g. FY26 = Apr 2025–Mar 2026). Prefer the most recent period available in the documents that is on or before the current date.
6. Use ONLY Coforge documents in the context. Never use or mention Cholamandalam/CIFC data. If the user asks about another company, tell them to switch tabs.`;

const CIFC_PROMPT = `You are a knowledgeable assistant for Cholamandalam Investment and Finance Company (CIFC), also known as Chola. Answer using ONLY the provided context from CIFC Annual Reports, Investor Presentations, and Earnings Transcripts.

Rules:
1. Be clear, structured, and easy to understand.
2. If the answer is not in the context, say so clearly.
3. Cite source document names when stating facts or figures.
4. Always mention the period (FY, quarter, or date) for financial figures.
5. Use the CURRENT DATE AND TIME provided in each request to interpret "latest", "recent", "current", "last quarter/FY", and similar phrases. CIFC's financial year is April–March (e.g. FY26 = Apr 2025–Mar 2026). Prefer the most recent period available in the documents that is on or before the current date.
6. Use ONLY CIFC/Cholamandalam documents in the context. Never use or mention Coforge data. If the user asks about another company, tell them to switch tabs.`;

const SHARED_PROMPT = `
Multi-source synthesis (CRITICAL):
- The CONTEXT contains excerpts from multiple documents — Annual Reports, Investor Presentations, and Earnings Transcripts.
- These excerpts were selected after searching the full document library for this question.
- Read ALL document sections in the context before answering. Do NOT answer from a single file when other sources also contain relevant information.
- Merge and consolidate facts from every applicable source into one cohesive, unified answer.
- When the same metric appears in multiple sources, combine them into one narrative or table; note the period and cite each source.
- If sources show different figures or periods, prefer the most recent data and briefly note any material differences.
- Draw on earnings transcripts for management commentary, presentations for strategic highlights, and annual reports for audited figures.
- Do not say information is unavailable if another document in the context contains it.

Numeric data formatting (CRITICAL — never use bullet lists for numbers):
- NEVER present numeric data as bullet points or plain text lists.
- ALWAYS use markdown tables for any numeric values, trends, time series, or comparisons.
- For trends (e.g. revenue FY20–FY26), use a table with columns: Period | Value | Currency/Unit | YoY Change (if available).
- Use a short paragraph before each table to explain context.
- After the table, add 1–2 sentences summarizing the trend.
- Multiple datasets = multiple tables (one per metric/currency), not bullet lists.

Follow-up (REQUIRED for substantive answers):
- End with one short, casual question tied to what you just answered — as a natural next step, not a labeled section.
- NEVER write headings or labels like "Follow-up question", "Follow up:", or similar.
- Weave the question into the last sentence or add it as a final line on its own.
- Ask exactly one question; keep it conversational.

Greetings (hi, hello, hey, good morning, etc.):
- Reply warmly and briefly. Do not pull from documents or cite sources.
- Invite them to explore company data, e.g. ask what they'd like to research today.
- Skip tables and document citations for pure greetings.`;

function getSystemPrompt(company = 'Coforge') {
  const base = company === 'CIFC' ? CIFC_PROMPT : COFORGE_PROMPT;
  return `${base}${SHARED_PROMPT}`;
}

function normalizeCompany(company) {
  return company === 'CIFC' ? 'CIFC' : 'Coforge';
}

let genAI = null;

function getClient() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

async function generateWithModel(modelName, prompt) {
  const model = getClient().getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

const GREETING_PATTERN = /^(hi|hello|hey|howdy|good\s+(morning|afternoon|evening)|greetings)[!.?\s]*$/i;

function isGreeting(text) {
  return GREETING_PATTERN.test(text.trim());
}

function greetingReply(company = 'Coforge') {
  if (company === 'CIFC') {
    return (
      "Hello! I'm your Chola (CIFC) knowledge assistant — I can help with annual reports, " +
      'investor presentations, and earnings call transcripts.\n\n' +
      'What would you like to research today?'
    );
  }

  return (
    "Hello! I'm your Coforge knowledge assistant — I can help with annual reports, " +
    'investor presentations, and earnings call transcripts.\n\n' +
    'What would you like to research today?'
  );
}

function polishAnswer(text) {
  let answer = ensureNumericTables(text);
  answer = answer.replace(/\n*\*{0,2}Follow[- ]?up questions?\*{0,2}\s*:?\s*\n*/gi, '\n\n');
  answer = answer.replace(/\n*Follow[- ]?up questions?\s*:?\s*\n*/gi, '\n\n');
  return answer.trim();
}

function resolveCurrentDateTime(currentDateTime) {
  if (currentDateTime && typeof currentDateTime === 'object') {
    if (typeof currentDateTime.local === 'string' && currentDateTime.local.trim()) {
      return currentDateTime.local.trim();
    }
    if (typeof currentDateTime.iso === 'string' && currentDateTime.iso.trim()) {
      return currentDateTime.iso.trim();
    }
  }
  if (typeof currentDateTime === 'string' && currentDateTime.trim()) {
    return currentDateTime.trim();
  }
  return new Date().toLocaleString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

export async function generateAnswer(question, history = [], currentDateTime = null, company = 'Coforge') {
  const trimmed = question.trim();
  const activeCompany = normalizeCompany(company);
  const nowLabel = resolveCurrentDateTime(currentDateTime);
  const cacheKey = `v10:${activeCompany}:${nowLabel.slice(0, 10)}:${trimmed.toLowerCase()}`;
  const cached = getCachedAnswer(cacheKey);
  if (cached) return cached;

  const modelName = getActiveModel();

  if (isGreeting(trimmed) && history.length === 0) {
    const result = { answer: greetingReply(activeCompany), sources: [], model: modelName };
    setCachedAnswer(cacheKey, result);
    return result;
  }

  const tabMismatch = getTabMismatchMessage(activeCompany, trimmed);
  if (tabMismatch) {
    const result = { answer: tabMismatch, sources: [], model: modelName, guardrail: 'company_tab' };
    setCachedAnswer(cacheKey, result);
    return result;
  }

  const chunks = await retrieveRelevantChunks(question, config.maxContextChunks, activeCompany);
  const context = buildContext(chunks);
  const searchMeta = chunks._meta || {};
  const searchedNote = searchMeta.totalDocuments
    ? `Documents searched: ${searchMeta.totalDocuments}. Documents used: ${searchMeta.documentsSelected || 'multiple'}. Company scope: ${activeCompany} only.`
    : '';

  const historyText = history
    .slice(-config.maxHistoryMessages)
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');

  const prompt = `${getSystemPrompt(activeCompany)}

CURRENT DATE AND TIME: ${nowLabel}
${searchedNote ? `\nRESEARCH NOTE: ${searchedNote}\n` : ''}
CONTEXT:
${context}
${historyText ? `\nPRIOR MESSAGES:\n${historyText}\n` : ''}
QUESTION: ${question}

Answer:`;

  try {
    let answer = await withRetry(() => generateWithModel(modelName, prompt));
    answer = polishAnswer(answer);
    const sources = searchMeta.selectedSources?.length
      ? searchMeta.selectedSources
      : [...new Set(chunks.map((c) => `${c.source} (${c.category})`))];
    const result = {
      answer,
      sources,
      model: modelName,
      research: searchMeta.totalDocuments
        ? {
            documentsSearched: searchMeta.totalDocuments,
            documentsUsed: searchMeta.documentsSelected,
            selectionMethod: searchMeta.selectionMethod,
          }
        : undefined,
    };
    setCachedAnswer(cacheKey, result);
    return result;
  } catch (err) {
    if (isRateLimitError(err)) {
      throw new Error(formatRateLimitError());
    }
    throw err;
  }
}
