// Small shared outline icons; labels remain visible alongside every navigation icon.
const paths = {
  overview:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="18" width="7" height="3" rx="1"/>',
  board:
    '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="14" rx="1.5"/>',
  table:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/>',
  listings:
    '<path d="M4 5h10l6 6-9 9-9-9V7a2 2 0 0 1 2-2Z"/><circle cx="7" cy="9" r="1"/>',
  sales: '<path d="M4 7h16l-1 13H5L4 7ZM8 7V5a4 4 0 0 1 8 0v2M9 12l2 2 4-4"/>',
  reservations:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-14 5 3 3 6-5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  company:
    '<path d="M4 21V5l8-3v19M4 9h8m-8 6h8m0-8 8 2v12M2 21h20M7 6v1m0 4v1m0 5v1m9-6v2m0 3v2"/>',
  photos:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m3 17 5-4 4 3 4-6 5 7"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.table}</svg>`;
}
