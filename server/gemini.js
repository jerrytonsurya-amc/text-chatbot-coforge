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

const SYSTEM_PROMPT = `You are a knowledgeable assistant for Coforge Limited. Answer using ONLY the provided context from Annual Reports, Investor Presentations, Earnings Transcripts, and Financial Model data.

Rules:
1. Be clear and concise.
2. If the answer is not in the context, say so.
3. Cite source document names for facts and figures.
4. Mention the period (FY/quarter) for financial figures.
5. Use brief markdown formatting.`;

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
  const cacheKey = question.toLowerCase().trim();
  const cached = getCachedAnswer(cacheKey);
  if (cached) return cached;

  const modelName = getActiveModel();
  const chunks = await retrieveRelevantChunks(question, 6);
  const context = buildContext(chunks);

  const historyText = history
    .slice(-4)
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
