const paths: Record<string, string> = {
  dart: '<path d="M7 26 24 9l-3 10 6-2L12 31l3-10Z"/><path d="m5 16 5-3m-3 10 5-2"/>',
  lance:
    '<path d="M5 30 25 6l-3 12 8-3L10 32l8-15Z"/><circle cx="24" cy="9" r="3"/>',
  ignite:
    '<path d="m18 3 2 9 8-5-4 9 10 3-10 3 5 9-10-5-4 9-2-10-9 4 5-9-8-3 9-3Z"/>',
  sun: '<circle cx="18" cy="18" r="9"/><path d="M18 2v5m0 22v5M2 18h5m22 0h5M6 6l4 4m16 16 4 4M6 30l4-4M26 10l4-4"/>',
  blink: '<path d="M8 5v25m5-25v25m4-20 13 8-13 8 4-8Z"/>',
  interrupt:
    '<path d="m7 7 22 22M11 4l-5 8 7 6-6 9m19-23 5 8-7 6 6 10M6 18h24"/>',
  barrier:
    '<path d="M18 3 31 9v10c0 7-8 12-13 15C13 31 5 26 5 19V9Z"/><path d="m18 10 7 8-7 9-7-9Z"/>',
};
export function spellIcon(id: string) {
  const path = paths[id];
  return path
    ? `<svg viewBox="0 0 36 36" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${path}</svg>`
    : id;
}
