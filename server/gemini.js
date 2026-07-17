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

const SYSTEM_PROMPT = `You are a knowledgeable assistant for Coforge Limited. Answer using ONLY the provided context from Annual Reports, Investor Presentations, and Earnings Transcripts.

Rules:
1. Be clear, structured, and easy to understand.
2. If the answer is not in the context, say so clearly.
3. Cite source document names when stating facts or figures.
4. Always mention the period (FY, quarter, or date) for financial figures.

Numeric data formatting (CRITICAL — never use bullet lists for numbers):
- NEVER present numeric data as bullet points or plain text lists.
- ALWAYS use markdown tables for any numeric values, trends, time series, or comparisons.
- For trends (e.g. revenue FY20–FY26), use a table with columns: Period | Value | Currency/Unit | YoY Change (if available).
- Example for revenue trend:
| Period | Revenue (INR mn) | Source |
|--------|------------------|--------|
| FY20 | 36,886 | Annual Report 2025 |
| FY21 | 39,857 | Annual Report 2025 |
| FY22 | 42,315 | Annual Report 2025 |
- Use a short paragraph before each table to explain context.
- After the table, add 1–2 sentences summarizing the trend.
- Multiple datasets = multiple tables (one per metric/currency), not bullet lists.

Follow-up question (REQUIRED for every answer):
- End every response with a section titled **Follow-up question**
- Ask one specific, relevant question that helps the user explore the topic deeper (e.g. compare quarters, drill into a segment, ask about drivers, margins, or outlook).
- Make the follow-up natural and tied to what you just answered — not generic.
- Do not ask multiple follow-up questions; exactly one.`;

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

export async function generateAnswer(question, history = []) {
  const cacheKey = `v5:${question.toLowerCase().trim()}`;
  const cached = getCachedAnswer(cacheKey);
  if (cached) return cached;

  const modelName = getActiveModel();
  const chunks = await retrieveRelevantChunks(question, config.maxContextChunks);
  const context = buildContext(chunks);

  const historyText = history
    .slice(-config.maxHistoryMessages)
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');

  const prompt = `${SYSTEM_PROMPT}

CONTEXT:
${context}
${historyText ? `\nPRIOR MESSAGES:\n${historyText}\n` : ''}
QUESTION: ${question}

Answer:`;

  try {
    let answer = await withRetry(() => generateWithModel(modelName, prompt));
    answer = ensureNumericTables(answer);
    const sources = [...new Set(chunks.map((c) => `${c.source} (${c.category})`))];
    const result = { answer, sources, model: modelName };
    setCachedAnswer(cacheKey, result);
    return result;
  } catch (err) {
    if (isRateLimitError(err)) {
      throw new Error(formatRateLimitError());
    }
    throw err;
  }
}
