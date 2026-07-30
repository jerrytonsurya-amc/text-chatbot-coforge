import { config } from './config.js';
import { loadEmbeddings } from './embeddings.js';
import { COMPANY } from '../shared/company.js';
import {
  buildDocumentCatalog,
  researchCompanyLibrary,
  buildContext,
  getSearchStats,
} from './documentSearch.js';

export { buildContext };

export async function retrieveRelevantChunks(query, limit = config.maxContextChunks) {
  const research = await researchCompanyLibrary(query);
  const chunks = research.chunks;
  chunks._context = research.context;
  chunks._meta = {
    ...getSearchStats(research.scoredDocs, research.documents, chunks, research.totalDocuments),
    selectionMethod: research.selectionMethod,
    targetCompany: COMPANY,
    fullResearch: true,
    charCount: research.charCount,
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
    company: COMPANY,
    embeddings: embeddings
      ? {
          model: embeddings.model,
          dimension: embeddings.dimension,
          chunkCount: embeddings.chunkCount,
        }
      : null,
  };
}
