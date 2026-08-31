# AeroPath V2 — Migration 025 + UI Redesign R6

AeroPath is a role-aware flight-school operations platform built with React, Vite and Supabase. This snapshot includes the Migration 024 Ground School/Test foundation and Migration 025 training-resource expansion.

UI Redesign R6 extends the Aeroviation-branded operational system through Fleet & Simulators. Aircraft and simulator availability, usage and editing are easier to scan while all booking, active-session and historical protections remain unchanged.

Brand refinement 2.25.8 replaces the detailed sidebar wing with a compact AeroPath mark and makes the Aeroviation loading logo fully readable on the dark loading screen.

Visual identity 2.25.9 adds a consistent glass-panel aviation emblem family across the main workspaces. Timetable uses a departure-board-inspired symbol, while fleet resources automatically show distinct ATC-headset and VR-goggles emblems when their names or types identify those systems.

Visual identity 2.25.10 replaces the generic module-card diamonds with lightweight aviation illustrations, refines the requested operational symbols, introduces a cleaner sidebar mark and adds a cinematic Bristell-at-sunset sign-in background.

Visual identity 2.25.11 follows the supplied AeroPath interface references: an immersive parked-Bristell sunset sign-in with a floating glass form, Aeroviation wing lockups, blue active navigation, a compact mobile Flight Deck, quick actions and Home/Timetable/Sessions/More navigation.

Visual identity 2.25.16 keeps the supplied Aeroviation reference direction while making the full app calmer and easier to scan: page headings, cards, forms, controls, tables and status labels now share one compact operational finish. The official dark-background Aeroviation lockup and the complete pale-blue outline icon family remain consistent, the AeroPath wordmark stays on one line at every size, and active work is clearer without turning every screen into a brightly coloured dashboard.

## Migration 025 scope

- combined **Fleet & Simulators** catalogue
- explicit `SIMULATOR` and `AIRCRAFT` resource classification
- aircraft name/type, registration, optional callsign, status and description
- simulator and aircraft bookings through one controlled transaction path
- database-enforced resource and instructor conflict protection
- simulator and flight sessions through the existing atomic session workflow
- automatic `SIMULATOR` / `FLIGHT` classification on immutable records and corrections
- Overview, Simulator and Flight tabs in Training History
- `SIM` / `FLT` identification across booking, timetable and session workflows
- retained compatibility with existing simulator data and history

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Run `npm install`.
4. Run `npm run typecheck`.
5. Run `npm test`.
6. Run `npm run dev`.

## Database update

The target database must already contain AeroPath migrations through M024B3. Then run:

`supabase/migrations/AeroPath_V2_Migration_025_TrainingResources.sql`

Followed by:

`supabase/migrations/AeroPath_V2_Migration_025B_InterfaceCorrections.sql`

Use the Supabase SQL Editor as the database-owner role. The migration is additive and keeps the deployed `simulators` table and `simulator_id` foreign keys as stable compatibility identifiers; new application contracts expose them as generic training resources.

## Locked rules

- The database is authoritative for state and permission decisions.
- Approved bookings cannot overlap on the same training resource.
- Approved bookings cannot overlap for the same assigned instructor.
- Conflict protection cannot be bypassed by Admin/Safety Manager overrides.
- A resource cannot be deactivated with a future approved booking or live session.
- A resource type cannot change after booking history exists.
- Session completion and training-record creation remain atomic.
- Training mode is derived from the booked resource, never trusted from the browser.
- Deployment connection check
- Consequential actions are audited and immutable history is retained.
- No application workflow uses `window.alert`, `window.confirm` or `window.prompt`.
- Operational errors use the blurred AeroPath error modal rather than inline browser-style banners.
- Signing out or changing account/role resets navigation and scroll position safely.
