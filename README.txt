AeroPath V2 — M025 Training Resources / Aircraft + UI Redesign R6

1. Install dependencies: npm install
2. Copy .env.example to .env.local and add the Supabase values.
3. Run M025, followed by M025B, after all migrations through M024B3.
4. Verify: npm run typecheck && npm test && npm run build
5. Start locally: npm run dev

UI R6 includes the Aeroviation-branded shell, blurred notification centre,
mobile navigation, and redesigned Flight Deck, Bookings, Timetable, Sessions,
Training History, Pre-flight, Accounts and Fleet surfaces. No additional database migration is required.
Version 2.25.9 also adds matching aviation emblems across the main pages, including
the departure-board Timetable symbol and special ATC-headset and VR-goggles icons.
Version 2.25.10 removes the module-card diamonds, adds the requested aviation
illustrations and introduces the Bristell-at-sunset sign-in scene.
Version 2.25.11 follows the supplied visual references for the full-screen sign-in,
Aeroviation wing branding, mobile drawer, dashboard and bottom navigation.
Version 2.25.15 adds a separate wide desktop aircraft scene, precisely recolours
the official wing logo for dark backgrounds and redraws the complete module icon family
to follow the supplied reference sheet, including its distinctive fine details. The
AeroPath wordmark remains on one line in compact and full-size brand lockups. The Admin
Operations Centre now gives live workload prominence while quiet zero-count cards recede.

See README.md and docs/BUILD_STATUS.md for the complete scope and regression checklist.
