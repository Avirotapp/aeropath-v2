export default function AeroIcon({
  name,
  size = 20,
  strokeWidth = 1.8,
  className = "",
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
    >
      {iconPaths[name] ?? iconPaths.dashboard}
    </svg>
  );
}

const iconPaths = {
  dashboard: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12 18.2 8.8M5.3 15.7a7.8 7.8 0 0 1 13.4 0" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  bookings: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M7.5 2.8v3.5M16.5 2.8v3.5M3 9h18M8 15.5l3-1.4 4.7 1.2-2.4 1.1-2.4-.5-1.3 1.3" />
    </>
  ),
  timetable: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M7.5 2.8v3.5M16.5 2.8v3.5M3 9h18" />
      <circle cx="12" cy="14.5" r="3.3" />
      <path d="M12 12.7v2.1l1.4.8" />
    </>
  ),
  sessions: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="m10.2 8.5 5.2 3.5-5.2 3.5zM12 3.2V1.8M20.8 12h1.4" />
    </>
  ),
  history: (
    <>
      <path d="M5 4.5h10.8A3.2 3.2 0 0 1 19 7.7v11.8H8.2A3.2 3.2 0 0 1 5 16.3z" />
      <path d="M8.2 19.5A3.2 3.2 0 0 1 5 16.3c0-1.8 1.4-3.2 3.2-3.2H19M9 8h6M9 10.5h4" />
    </>
  ),
  preflight: (
    <>
      <path d="M8.2 4H6.5A2.5 2.5 0 0 0 4 6.5v13h16v-13A2.5 2.5 0 0 0 17.5 4h-1.7" />
      <rect x="8" y="2.5" width="8" height="4" rx="1.5" />
      <path d="m8.2 13 2.2 2.2 5.4-5.4" />
    </>
  ),
  ground: (
    <>
      <path d="M3.5 5.5A3.5 3.5 0 0 1 7 2h5v17H7a3.5 3.5 0 0 0-3.5 3zM20.5 5.5A3.5 3.5 0 0 0 17 2h-5v17h5a3.5 3.5 0 0 1 3.5 3z" />
      <path d="M7 7h2M15 7h2" />
    </>
  ),
  files: (
    <>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
      <path d="M8.5 14h7M10 12.2l-1.5 1.8 1.5 1.8M14 12.2l1.5 1.8-1.5 1.8" />
    </>
  ),
  safety: (
    <>
      <path d="M9 21h6M10 21l.8-11h2.4L14 21M8.5 10h7L12 3z" />
      <path d="M5.2 7.3a9 9 0 0 1 13.6 0M7.2 9.5a6 6 0 0 1 9.6 0" />
    </>
  ),
  accounts: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 8.5a2.7 2.7 0 1 1 0 5.4M17.5 15.5a4.3 4.3 0 0 1 3 3.5" />
    </>
  ),
  fleet: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2.2" />
      <path d="M8 21h8M12 17v4M7 10.8l4-1.8 6.5 1.5-3.2 1.5-3.3-.7-1.8 1.8" />
    </>
  ),
  audit: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.2 15.2 5 5M7.8 11.5l2-2 2 1.5 2-2" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9z" />
      <path d="M9.7 20a2.7 2.7 0 0 0 4.6 0" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="9" r="3" />
      <path d="M6.4 18.2a6.2 6.2 0 0 1 11.2 0" />
    </>
  ),
  menu: (
    <path d="M4 7h16M4 12h16M4 17h16" />
  ),
  logout: (
    <>
      <path d="M10 4H5.5A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20H10M14.5 8l4 4-4 4M8 12h10.5" />
    </>
  ),
  chevron: <path d="m8.5 10 3.5 3.5 3.5-3.5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
};
