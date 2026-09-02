const icons = {
  plane: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 15 9l-4-1-3 3 3 2-5 5-3-1-2 2 4 4 2-2-1-3 5-5 2 3 3-3-1-4 7-7Z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 19H7a5 5 0 1 1 1.3-9.8A6 6 0 0 1 20 11a4 4 0 0 1-2.5 8Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 15v4h14v-4"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M8 16h2a2 2 0 0 0 0-4H8v6M14 18v-6h3"/></svg>',
  print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>',
  table: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/></svg>',
  history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>',
  backup: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 15h8M8 18h5"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  sync: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-5V2M4 17h5v5M18.5 5.5a8 8 0 0 0-13 2M5.5 18.5a8 8 0 0 0 13-2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  route: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M7.5 16.5c2.5-2.5 1-5 3.5-7.5s4-1 5.5-2.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M15 7l5 5-5 5"/></svg>',
  aircraft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16 13 13V4a2 2 0 0 0-4 0v9l-6 3v2l6-1v3l-2 1v1l4-1 4 1v-1l-2-1v-3l8 1z"/></svg>',
  pilot: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0M8 8h8"/></svg>',
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h14l2 2v16H4z"/><path d="M8 3v6h8V3M8 15h8"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-1 5 5-1L19 9l-4-4zM13 7l4 4"/></svg>',
  warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20zM12 9v5M12 18h.01"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg>'
};

export function iconMarkup(name) {
  return icons[name] || '';
}

export function renderIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    const name = node.getAttribute('data-icon');
    node.innerHTML = iconMarkup(name);
  });
}
