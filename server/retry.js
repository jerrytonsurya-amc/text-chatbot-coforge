const answerCache = new Map();
const CACHE_MAX = 100;
const CACHE_TTL_MS = 30 * 60 * 1000;

let resolvedModel = null;

export function getCachedAnswer(key) {
  const entry = answerCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL_MS) {
    answerCache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedAnswer(key, value) {
  if (answerCache.size >= CACHE_MAX) {
    const oldest = answerCache.keys().next().value;
    answerCache.delete(oldest);
  }
  answerCache.set(key, { value, time: Date.now() });
}

export function getActiveModel() {
  if (resolvedModel) return resolvedModel;
  resolvedModel = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  return resolvedModel;
}

function parseRetryDelayMs(message) {
  const match = message?.match(/retry in ([\d.]+)s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 500;
  const delayMatch = message?.match(/"retryDelay":\s*"(\d+)s"/);
  if (delayMatch) return parseInt(delayMatch[1], 10) * 1000 + 500;
  return null;
}

export function isRateLimitError(err) {
  const msg = err?.message || '';
  return err?.status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('Too Many Requests');
}

export async function withRetry(fn, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err) || attempt === maxAttempts) throw err;
      const delay = parseRetryDelayMs(err.message) || 5000 * attempt;
      console.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

export function formatRateLimitError() {
  return 'The AI service is temporarily rate-limited. Please wait about a minute and try again.';
}
