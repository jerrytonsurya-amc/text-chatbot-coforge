import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function generateText(prompt, options = {}) {
  const response = await getClient().messages.create({
    model: options.model || config.chatModel,
    max_tokens: options.maxTokens || 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
