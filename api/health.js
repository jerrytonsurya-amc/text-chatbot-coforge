import { getIndexStats } from '../server/rag.js';

export default function handler(req, res) {
  try {
    const stats = getIndexStats();
    return res.status(200).json({
      status: 'ok',
      runtime: process.env.VERCEL === '1' ? 'vercel' : 'local',
      ...stats,
    });
  } catch (err) {
    return res.status(503).json({ status: 'error', message: err.message });
  }
}
