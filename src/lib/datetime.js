export function getClientDateTime() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    local: now.toLocaleString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }),
  };
}
