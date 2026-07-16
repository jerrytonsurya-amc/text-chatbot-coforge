import { GoogleGenerativeAI } from '@google/generative-ai';
import { retrieveRelevantChunks, buildContext } from './rag.js';

const SYSTEM_PROMPT = `You are a knowledgeable assistant for Coforge Limited. You answer questions using ONLY the provided context from:
- Annual Reports (AR)
- Investor Presentations (PPT)
- Earnings Call Transcripts
- Financial Model (Excel)

Rules:
1. Answer clearly and concisely based on the context provided.
2. If the answer is not in the context, say you don't have that information in the available Coforge documents.
3. Cite the source document name when referencing specific facts or figures.
4. For financial figures, be precise and mention the period (FY, quarter) when available.
5. Use markdown formatting for readability (bullet points, bold for key figures).
6. Do not make up information not present in the context.`;

const MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash',
];

async function generateWithModel(genAI, modelName, prompt) {
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function generateAnswer(question, history = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const chunks = retrieveRelevantChunks(question, 10);
  const context = buildContext(chunks);

  const historyText = history
    .slice(-6)
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');

  const prompt = `${SYSTEM_PROMPT}

CONTEXT FROM COFORGE DOCUMENTS:
${context}

${historyText ? `PREVIOUS CONVERSATION:\n${historyText}\n\n` : ''}USER QUESTION: ${question}

Provide a clear, helpful answer based on the context above.`;

  let lastError;
  for (const modelName of MODEL_FALLBACKS) {
    try {
      const answer = await generateWithModel(genAI, modelName, prompt);
      const sources = [...new Set(chunks.map((c) => `${c.source} (${c.category})`))];
      return { answer, sources, model: modelName };
    } catch (err) {
      lastError = err;
      const isModelUnavailable =
        err.message?.includes('404') ||
        err.message?.includes('not found') ||
        err.message?.includes('no longer available');
      if (!isModelUnavailable) throw err;
      console.warn(`Model ${modelName} unavailable, trying fallback...`);
    }
  }

  throw lastError || new Error('No Gemini model available');
}
