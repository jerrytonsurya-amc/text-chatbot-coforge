export const CIFC_HINTS = [
  'cifc',
  'chola',
  'cholamandalam',
  'cholamandalam investment',
  'cholamandalam investment and finance',
];

export const COFORGE_HINTS = ['coforge', 'encora'];

export function detectQuestionCompany(query) {
  const lower = query.toLowerCase().replace(/\s+/g, ' ');

  const wantsCifc = CIFC_HINTS.some((hint) => lower.includes(hint));
  const wantsCoforge = COFORGE_HINTS.some((hint) => lower.includes(hint));

  if (wantsCifc && wantsCoforge) return 'both';
  if (wantsCifc) return 'CIFC';
  if (wantsCoforge) return 'Coforge';
  return null;
}

export function getTabMismatchMessage(activeCompany, question) {
  const detected = detectQuestionCompany(question);
  const tab = activeCompany === 'CIFC' ? 'CIFC' : 'Coforge';

  if (!detected || detected === tab) return null;

  if (detected === 'both') {
    return (
      'I answer one company at a time and do not cross-match Coforge and Cholamandalam data.\n\n' +
      'Use the **Coforge** tab for Coforge questions and the **Cholamandalam** tab for CIFC questions.'
    );
  }

  if (tab === 'Coforge' && detected === 'CIFC') {
    return (
      'This looks like a **Cholamandalam (CIFC)** question, but you are on the **Coforge** tab.\n\n' +
      'Please switch to the **Cholamandalam** tab at the top and ask again. ' +
      'This chat only uses Coforge documents.'
    );
  }

  if (tab === 'CIFC' && detected === 'Coforge') {
    return (
      'This looks like a **Coforge** question, but you are on the **Cholamandalam** tab.\n\n' +
      'Please switch to the **Coforge** tab at the top and ask again. ' +
      'This chat only uses Cholamandalam (CIFC) documents.'
    );
  }

  return null;
}
