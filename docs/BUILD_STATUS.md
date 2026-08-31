# AeroPath V2 Build Status

Current milestone: **M025 — Training Resources / Aircraft + UI Redesign R7**

Implemented in this snapshot:

- M024B Ground Sessions, Ground School and Tests & Quizzes
- M025 simulator/aircraft resource catalogue
- M025 generic resource booking and conflict model
- aircraft session support using the atomic operational session workflow
- automatic Simulator/Flight immutable training-history classification
- split Training History tabs
- combined Fleet & Simulators administration workspace
- working TypeScript project configuration
- repository contract tests replacing the placeholder test
- distribution cleanup rules for secrets, dependencies and build output
- immutable-record-safe M025 historical training-mode backfill
- M025B Instructor self-service booking permission restoration
- blurred operational error popouts and account-safe route/scroll reset
- immersive Aeroviation-branded sign-in with a floating glass form
- persistent role-aware desktop sidebar with aviation outline icons
- compact top-right Notifications and Profile controls outside the sidebar
- responsive mobile drawer and bottom navigation
- redesigned Flight Deck and Training Bookings presentation
- reduced operational heading size and page whitespace for faster scanning
- blurred top-right notification centre with unread badge and live read state
- retained full Notifications workspace for filtering, history and dismissal
- redesigned Timetable command bar, schedule summary and denser operational cards
- redesigned Sessions control surface with clearer live-state hierarchy
- redesigned Training History with mode-aware records, totals and programme progress
- redesigned Pre-flight preparation and review workspace
- corrected Timetable date-control overflow at constrained desktop widths
- redesigned Accounts & Users workspace with clearer account states and controls
- redesigned student programme allocation, assigned-hours and progress presentation
- redesigned Fleet & Simulators catalogue, availability summary and resource editor
- reference-matched sidebar branding using the Aeroviation wing lockup
- corrected the loading screen with a readable white Aeroviation logo and indicator
- added a unified aviation emblem family across the main workspaces
- added a departure-board-inspired Timetable emblem and resource-specific ATC headset and VR-goggles symbols
- replaced module-card diamonds with quiet aviation line illustrations
- refined Operations Centre, Sessions, Pre-flight, Safety and Profile symbols to radar, aircraft/play, checked clipboard, control tower and pilot-cap designs
- replaced the abstract sign-in horizon with a Bristell-at-sunset hero scene
- matched the supplied mobile header, drawer, dashboard tiles, quick actions and bottom navigation
- added a portrait-ready parked Bristell sunset scene matching the supplied sign-in reference
- added a separate wide desktop sunset scene with a smaller, fully visible Bristell and preserved the portrait scene for phones
- traced all module symbols from the supplied icon sheet as one thin pale-blue line family, retaining the distinctive clock legs, stopwatch controls, clipboard marks, simulator route, tower wings and audit details
- rebuilt the dark-background Aeroviation lockup from the official logo with copper wings and white lettering
- shortened the login heading to “Your training journey” exactly as requested
- kept the AeroPath wordmark on one horizontal line in sidebar, mobile and sign-in lockups
- refined the live Admin Operations Centre with a denser command view, quieter zero states and highlighted operational workload

Required database action:

1. Confirm migrations through M024B3 are deployed.
2. Run `AeroPath_V2_Migration_025_TrainingResources.sql` as the database owner.
3. Run `AeroPath_V2_Migration_025B_InterfaceCorrections.sql` as the database owner.
4. Execute the M025 regression checklist below.

M025 regression checklist:

- Existing simulator catalogue and history still load.
- Admin/Safety Manager can create an aircraft.
- Duplicate registration or callsign is rejected.
- Student can request Simulator and Aircraft bookings.
- Same-resource overlap is blocked at approval.
- Same-instructor overlap across resource types is blocked.
- Back-to-back bookings remain allowed.
- Aircraft session completion creates a `FLIGHT` record.
- Simulator session completion creates a `SIMULATOR` record.
- Training History tabs filter correctly.
- Deactivation is blocked for future approved/live usage.
- No native alert/confirm/prompt dialog appears.

Current UI rollout sequence: complete responsive visual QA for the R7 shared operational finish. M026 email-notification delivery follows the locked redesign.
