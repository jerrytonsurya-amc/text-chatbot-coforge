import { generateAnswer } from '../server/gemini.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const { answer, sources } = await generateAnswer(message.trim(), history);
    return res.status(200).json({ answer, sources });
  } catch (err) {
    console.error('Chat error:', err);
    return res.status(500).json({
      error: 'Failed to generate response',
      details: err.message,
    });
  }
}
