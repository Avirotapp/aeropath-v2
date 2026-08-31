const emblems = {
  deck: <><rect x="9" y="10" width="38" height="36" rx="5" /><path d="M15 19h12M15 27h8M15 35h14M35 18h6v6h-6zM35 30h6v6h-6z" /></>,
  accounts: <>
    <circle cx="28" cy="16" r="6.5" />
    <path d="M24 23.5v2.2l4 2.8 4-2.8v-2.2M28 29c-10.2 0-16.5 5.2-16.5 13.7 0 2.3 1.3 3.3 3.7 3.3h25.6c2.4 0 3.7-1 3.7-3.3C44.5 34.2 38.2 29 28 29Z" />
    <path d="M18 41.5h20M20.5 36.5h2M33.5 36.5h2" />
  </>,
  bookings: <>
    <rect x="13" y="13" width="30" height="35" rx="4" />
    <path d="M20 13V9.5M36 13V9.5M20 11h-2.5A3.5 3.5 0 0 0 14 14.5M36 11h2.5a3.5 3.5 0 0 1 3.5 3.5M20 16h16" />
    <path d="M20 25h2M26 25h10M20 32h2M26 32h10M20 39h2M26 39h10" />
  </>,
  departures: <>
    <circle cx="28" cy="25" r="17.5" />
    <path d="M28 11v2M38 15l-1.4 1.4M42 25h-2M38 35l-1.4-1.4M18 15l1.4 1.4M14 25h2M18 35l1.4-1.4M28 25l7.5-6M28 25l-4.5-3" />
    <path d="M16.5 40.5 10 47h10M39.5 40.5 46 47H36M24.5 47c2.2 1.2 4.8 1.2 7 0" />
  </>,
  sessions: <>
    <circle cx="28" cy="29" r="18" />
    <path d="M24 9h8M26 6h4v3M14.5 15.5 11.5 13M41.5 15.5l3-2.5M28 11v2M43 29h3M13 29h-3" />
    <path d="m24 20.5 12.5 8.5L24 37.5Z" fill="currentColor" stroke="none" />
  </>,
  history: <>
    <path d="M10 13h29v31H10zM16 19v19M21 20h12M21 26h12M21 32h9M21 38h6" />
    <path d="m29 42 2.4-7.2L42 24.2l4.2 4.2L35.6 39ZM41.8 24.5l2.1-2.1 4.2 4.2-2.1 2.1M31.4 34.8l4.2 4.2" />
  </>,
  preflight: <>
    <rect x="12" y="13" width="29" height="34" rx="4" />
    <path d="M20 13V9.5h13V13M20 11h-3M33 11h3M18 22h2M24 22h10M18 29h2M24 29h8M18 36h2M24 36h6" />
    <circle cx="39" cy="39" r="8" />
    <path d="m35.5 39 2.4 2.5 4.8-5.2" />
  </>,
  files: <>
    <path d="M8 19h15l4 4h21v22H8zM8 19v-5h15l4 4h16v5" />
    <path d="M17 34h22M23 34h3l2-3 2 3h3M28 31v6" />
  </>,
  fleet: <><path d="M7 31h42M12 27l14-4 6-11 4 1-2 10 12 4v4l-14-1-9 10-3-1 6-9-14 1zM12 45h32" /></>,
  aircraft: <><path d="M6 31h44M11 27l15-4 6-12 4 1-2 11 12 4v4l-14-1-9 11-3-1 6-10-15 1z" /></>,
  simulator: <>
    <rect x="7" y="13" width="42" height="29" rx="4" />
    <path d="M12 18h32M28 42v5M20 47h16M15 35c5-7 9-9 14-6s7-1 12-7M18 30l4 1-1 4M34 24l4-1 1 4" />
    <circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" />
    <circle cx="44" cy="17" r=".8" fill="currentColor" stroke="none" />
  </>,
  headset: <><path d="M11 31v-5a17 17 0 0 1 34 0v5" /><rect x="8" y="28" width="8" height="14" rx="3" /><rect x="40" y="28" width="8" height="14" rx="3" /><path d="M44 42c0 5-4 7-10 7M30 49h4M19 22c5-5 13-5 18 0" /></>,
  vr: <><path d="M9 24c0-5 4-8 9-8h20c5 0 9 3 9 8l-2 13c-1 4-4 6-8 6-5 0-6-7-9-7s-4 7-9 7c-4 0-7-2-8-6z" /><circle cx="20" cy="29" r="5" /><circle cx="36" cy="29" r="5" /><path d="M9 27 5 24M47 27l4-3" /></>,
  safety: <>
    <path d="M28 7v5M25 10h6M22 15h12l3 5v9H19v-9zM22 20h12M23 24h3M30 24h3M24 29l-2 18M32 29l2 18M19 47h18" />
    <path d="M19 21H9v8l4 7h6M37 21h10v8l-4 7h-6M9 29h10M37 29h10" />
  </>,
  notifications: <>
    <path d="M18 38v-12c0-6.3 4-11 10-11s10 4.7 10 11v12l5 5H13zM25 47c1.8 2.5 4.2 2.5 6 0M25.5 15v-2a2.5 2.5 0 0 1 5 0v2" />
  </>,
  audit: <>
    <circle cx="24" cy="22" r="14" />
    <path d="m34 32 12 12M20 27c.5-3 1.8-4.5 4-4.5s3.5 1.5 4 4.5M24 16.5a3 3 0 1 0 0 6M21 13h6" />
    <path d="M9 37c0 4-1.5 6-4 7M14 39c0 3-1 5-3 6M36 39c0 3 1 5 3 6M41 37c0 4 1.5 6 4 7" />
    <circle cx="7" cy="36" r="1" fill="currentColor" stroke="none" />
    <circle cx="43" cy="36" r="1" fill="currentColor" stroke="none" />
  </>,
  ground: <><path d="m7 22 21-11 21 11-21 11zM15 27v10c8 6 18 6 26 0V27M48 23v15" /><circle cx="48" cy="41" r="2" /></>,
  operations: <><circle cx="28" cy="28" r="19" /><circle cx="28" cy="28" r="11" /><circle cx="28" cy="28" r="3" /><path d="M28 28 40 18M28 9v4M28 43v4M9 28h4M43 28h4" /><path d="M16 16l3 3M37 37l3 3" /></>,
  profile: <><circle cx="28" cy="23" r="8" /><path d="M11 48c1-11 7-17 17-17s16 6 17 17M17 17c3-8 19-8 22 0M17 17h22M20 17c4 4 12 4 16 0M28 10v5" /></>,
};

export default function ModuleEmblem({ name = "deck", compact = false, bare = false }) {
  return (
    <span className={`aero-module-emblem emblem-${name} ${compact ? "compact" : ""} ${bare ? "bare" : ""}`} aria-hidden="true">
      <svg fill="none" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg">
        {emblems[name] ?? emblems.deck}
      </svg>
    </span>
  );
}
