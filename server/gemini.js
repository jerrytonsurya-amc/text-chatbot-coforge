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

const SYSTEM_PROMPT = `You are a knowledgeable assistant for Coforge Limited. Answer using ONLY the provided context from Annual Reports, Investor Presentations, Earnings Transcripts, and Financial Model data.

Rules:
1. Be clear, structured, and easy to understand.
2. If the answer is not in the context, say so clearly.
3. Cite source document names when stating facts or figures.
4. Always mention the period (FY, quarter, or date) for financial figures.

Numeric data formatting (IMPORTANT):
- Whenever your answer includes numbers (revenue, growth %, margins, headcount, ratios, dates with figures, comparisons, etc.), present them in a markdown table.
- Use a short explanatory paragraph before the table to set context.
- After the table, add 1–2 sentences interpreting the key takeaway.
- Example table format:
| Metric | Value | Period | Source |
|--------|-------|--------|--------|
| Revenue | $X | Q4 FY26 | Annual Report 2025 |
- If there is only one number, still use a small table with Metric / Value / Period columns.
- If there are no numbers in the answer, use bullet points or short paragraphs instead.

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
  const cacheKey = `v2:${question.toLowerCase().trim()}`;
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
    const answer = await withRetry(() => generateWithModel(modelName, prompt));
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
