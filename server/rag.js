import { config } from './config.js';
import { loadEmbeddings } from './embeddings.js';
import {
  buildDocumentCatalog,
  researchCompanyLibrary,
  selectRelevantDocuments,
  retrieveChunksFromDocuments,
  buildContext,
  getSearchStats,
} from './documentSearch.js';

export { buildContext };

export async function retrieveRelevantChunks(query, limit = config.maxContextChunks, company = null) {
  if (company) {
    const research = await researchCompanyLibrary(query, company);
    const chunks = research.chunks;
    chunks._context = research.context;
    chunks._meta = {
      ...getSearchStats(research.scoredDocs, research.documents, chunks, research.totalDocuments),
      selectionMethod: research.selectionMethod,
      targetCompany: company,
      fullResearch: true,
      charCount: research.charCount,
    };
    return chunks;
  }

  const { documents, scoredDocs, selectionMethod, targetCompany } =
    await selectRelevantDocuments(query, company);
  const chunks = retrieveChunksFromDocuments(documents, query, limit, targetCompany);
  chunks._meta = {
    ...getSearchStats(scoredDocs, documents, chunks),
    selectionMethod,
    targetCompany,
  };
  return chunks;
}

export function getIndexStats() {
  const catalog = buildDocumentCatalog();
  const embeddings = loadEmbeddings();
  const totalChunks = catalog.reduce(
    (sum, doc) => sum + (doc.chunks?.length || doc.chunkCount || 0),
    0
  );

  return {
    totalChunks,
    totalDocuments: catalog.length,
    categories: [...new Set(catalog.map((d) => d.category))],
    embeddings: embeddings
      ? {
          model: embeddings.model,
          dimension: embeddings.dimension,
          chunkCount: embeddings.chunkCount,
        }
      : null,
  };
}
