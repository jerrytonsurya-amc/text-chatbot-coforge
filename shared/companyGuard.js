export const COFORGE_HINTS = ['coforge', 'encora'];

export function detectCoforgeQuestion(query) {
  const lower = query.toLowerCase().replace(/\s+/g, ' ');
  return COFORGE_HINTS.some((hint) => lower.includes(hint));
}

export function getOutOfScopeMessage() {
  return (
    'This assistant is for **Cholamandalam (CIFC)** only — annual reports, investor presentations, and earnings transcripts.\n\n' +
    'Coforge documents are not available here. Please ask about CIFC / Chola.'
  );
}
