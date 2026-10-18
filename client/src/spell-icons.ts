const paths: Record<string, string> = {
  dart: '<path d="M7 26 24 9l-3 10 6-2L12 31l3-10Z"/><path d="m5 16 5-3m-3 10 5-2"/>',
  lance:
    '<path d="M5 30 25 6l-3 12 8-3L10 32l8-15Z"/><circle cx="24" cy="9" r="3"/>',
  ignite:
    '<path d="m18 3 2 9 8-5-4 9 10 3-10 3 5 9-10-5-4 9-2-10-9 4 5-9-8-3 9-3Z"/>',
  sun: '<circle cx="18" cy="18" r="9"/><path d="M18 2v5m0 22v5M2 18h5m22 0h5M6 6l4 4m16 16 4 4M6 30l4-4M26 10l4-4"/>',
  meteor:
    '<path d="m8 6 8-3 11 4 5 10-5 12-11 5-12-6-2-9Z"/><path d="m22 9-9 10 7-1-5 8 12-12-7 1Z"/>',
  firestorm:
    '<path d="M19 3c2 7-4 8-2 13 1-3 4-4 5-7 5 4 8 9 6 15-1 5-5 8-11 8S6 28 6 21c0-5 3-9 8-13-1 5 0 7 2 9 1-5 4-8 3-14Z"/><path d="M18 23c2 2 1 6-2 7-3-1-4-4-2-7l2-3Z"/>',
  blink: '<path d="M8 5v25m5-25v25m4-20 13 8-13 8 4-8Z"/>',
  interrupt:
    '<path d="M5 28 12 21l-3-4 7-3 2-8 4 7 8 1-7 5 2 8-7-4Z"/><path d="m3 33 10-9m7-17 4-4"/>',
  barrier:
    '<path d="M18 3 31 9v10c0 7-8 12-13 15C13 31 5 26 5 19V9Z"/><path d="m18 10 7 8-7 9-7-9Z"/>',
  spark:
    '<circle cx="18" cy="18" r="5"/><path d="M18 2v8m0 16v8M2 18h8m16 0h8M6.7 6.7l5.7 5.7m11.2 11.2 5.7 5.7m0-22.6-5.7 5.7m-11.2 11.2-5.7 5.7"/>',
};
export function spellIcon(icon: string, abilityId?: string) {
  const path = abilityId === "crownfall"
    ? paths.meteor
    : abilityId === "firestorm"
      ? paths.firestorm
      : paths[icon];
  return path
    ? `<svg viewBox="0 0 36 36" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${path}</svg>`
    : icon;
}
