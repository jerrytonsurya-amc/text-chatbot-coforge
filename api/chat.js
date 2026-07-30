import 'dotenv/config';
import { generateAnswer } from '../server/gemini.js';

export const maxDuration = 300;

export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  const started = Date.now();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history = [], currentDateTime = null } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const { answer, sources } = await generateAnswer(
      message.trim(),
      history,
      currentDateTime
    );

    console.log(`[chat] CIFC answered in ${Date.now() - started}ms`);
    return res.status(200).json({ answer, sources, runtime: process.env.VERCEL === '1' ? 'vercel' : 'local' });
  } catch (err) {
    console.error(`[chat] failed after ${Date.now() - started}ms:`, err);
    return res.status(500).json({
      error: 'Failed to generate response',
      details: err.message,
    });
  }
}
