const isVercel = process.env.VERCEL === '1';

export const config = {
  chatModel: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
  embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
  embedBatchSize: 50,
  embedBatchDelayMs: 2000,
  maxContextChunks: 20,
  maxDocumentsToUse: 10,
  maxChunksPerSource: 4,
  maxChunksPerSourceFull: isVercel ? 1 : 2,
  maxDirectContextChars: isVercel ? 45000 : 70000,
  fullResearchBatchSize: 6,
  useAiDocumentSelection: process.env.SKIP_AI_DOC_SELECT !== '1',
  maxHistoryMessages: 4,
  skipQueryEmbed: process.env.SKIP_QUERY_EMBED === '1',
};
