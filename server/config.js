export const config = {
  chatModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
  embedBatchSize: 50,
  embedBatchDelayMs: 2000,
  maxContextChunks: 6,
  maxHistoryMessages: 4,
  skipQueryEmbed: process.env.SKIP_QUERY_EMBED === '1',
};
