export async function sendChatMessage(message, history = []) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.details || err.error || 'Failed to get response');
  }

  return res.json();
}

export async function checkHealth() {
  const res = await fetch('/api/health');
  return res.json();
}
