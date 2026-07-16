const TIER = parseInt(process.env.GEMINI_TIER || '1', 10);

export const config = {
  tier: TIER,
  chatModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
  // Tier 1: ~150-300 RPM for flash models
  embedBatchSize: TIER >= 1 ? 100 : 20,
  embedBatchDelayMs: TIER >= 1 ? 1000 : 5000,
  maxContextChunks: 6,
  maxHistoryMessages: 4,
  skipQueryEmbed: process.env.SKIP_QUERY_EMBED === '1',
};
