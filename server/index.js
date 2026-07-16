import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { generateAnswer } from './gemini.js';
import { getIndexStats } from './rag.js';

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  try {
    const stats = getIndexStats();
    res.json({ status: 'ok', ...stats });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const { answer, sources } = await generateAnswer(message.trim(), history);

    res.json({ answer, sources });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({
      error: 'Failed to generate response',
      details: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
