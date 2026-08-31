import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

describe('AeroPath M025 repository contracts', () => {
  it('contains the resource-aware database invariants', () => {
    const migration = readFileSync(
      join(
        projectRoot,
        'supabase/migrations/AeroPath_V2_Migration_025_TrainingResources.sql'
      ),
      'utf8'
    );

    expect(migration).toContain("resource_type in ('SIMULATOR', 'AIRCRAFT')");
    expect(migration).toContain("training_mode in ('SIMULATOR', 'FLIGHT')");
    expect(migration).toContain('Training resource conflict:');
    expect(migration).toContain('trg_set_training_record_mode_v1');
    expect(migration).toContain('alter table public.training_records\n  disable trigger user;');
    expect(migration).toContain('alter table public.training_records\n  enable trigger user;');
    expect(migration).toContain('begin;');
    expect(migration).toContain('commit;');
  });

  it('uses AeroPath modals instead of browser-native dialogs', () => {
    const sourceDirectory = join(projectRoot, 'src');
    const sourceFiles = walk(sourceDirectory).filter((path) =>
      ['.js', '.jsx', '.ts', '.tsx'].includes(extname(path))
    );

    for (const sourceFile of sourceFiles) {
      const source = readFileSync(sourceFile, 'utf8');
      expect(source).not.toMatch(/window\.(alert|confirm|prompt)\s*\(/);
    }
  });

  it('routes administration to the combined fleet workspace', () => {
    const app = readFileSync(join(projectRoot, 'src/App.jsx'), 'utf8');
    expect(app).toContain('FleetResourcesPage');
    expect(app).toContain('Fleet & Simulators');
    expect(app).toContain('window.scrollTo');
    expect(app).toContain('role={operationalRole}');
  });

  it('restores Instructor self-service and blurred operational errors', () => {
    const correctionMigration = readFileSync(
      join(
        projectRoot,
        'supabase/migrations/AeroPath_V2_Migration_025B_InterfaceCorrections.sql'
      ),
      'utf8'
    );
    const errorModal = readFileSync(
      join(projectRoot, 'src/ActionErrorModal.jsx'),
      'utf8'
    );

    expect(correctionMigration).toContain('public.is_student()');
    expect(correctionMigration).toContain('public.is_instructor()');
    expect(correctionMigration).toContain('student_list_training_bookings_v1');
    expect(errorModal).toContain('backdropFilter: "blur(8px)"');
    expect(errorModal).toContain('role="alertdialog"');
  });

  it('keeps profile and notifications in the utility bar, not the sidebar', () => {
    const shell = readFileSync(join(projectRoot, 'src/AppShell.jsx'), 'utf8');
    const sidebar = shell.slice(
      shell.indexOf('<aside'),
      shell.indexOf('</aside>')
    );

    expect(shell).toContain('className="aero-utility-actions"');
    expect(shell).toContain('aria-label="Open notifications"');
    expect(shell).toContain('aria-label="Open account menu"');
    expect(sidebar).not.toContain('Notifications');
    expect(sidebar).not.toContain('My profile');
    expect(shell).toContain('aero-mobile-nav');
  });

  it('provides the blurred notification centre through the shared RPC contract', () => {
    const shell = readFileSync(join(projectRoot, 'src/AppShell.jsx'), 'utf8');
    const popout = readFileSync(join(projectRoot, 'src/NotificationPopover.jsx'), 'utf8');
    const notificationApi = readFileSync(
      join(projectRoot, 'src/lib/notifications.js'),
      'utf8'
    );

    expect(shell).toContain('setNotificationOpen((current) => !current)');
    expect(shell).toContain('<NotificationPopover');
    expect(popout).toContain('role="dialog"');
    expect(popout).toContain('aero-notification-backdrop');
    expect(notificationApi).toContain('my_unread_notification_count');
    expect(notificationApi).toContain('list_my_notifications');
  });

  it('uses the R2 operational timetable presentation without changing its RPC', () => {
    const timetable = readFileSync(join(projectRoot, 'src/TimetablePage.jsx'), 'utf8');
    const styles = readFileSync(join(projectRoot, 'src/styles.css'), 'utf8');

    expect(timetable).toContain('timetable-redesign-page');
    expect(timetable).toContain('timetable-command-bar');
    expect(timetable).toContain('timetable-summary-strip');
    expect(timetable).toContain('list_timetable_bookings_v2');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) auto minmax(0, 160px)');
    expect(styles).toContain('.timetable-command-bar .timetable-date-input');
    expect(styles).toContain('box-sizing: border-box');
  });

  it('extends the operational design through sessions without changing lifecycle RPCs', () => {
    const sessions = readFileSync(join(projectRoot, 'src/SessionsPage.jsx'), 'utf8');

    expect(sessions).toContain('sessions-redesign-page');
    expect(sessions).toContain('session-status-tabs');
    expect(sessions).toContain('session-review-panel');
    expect(sessions).toContain('operational_start_session');
    expect(sessions).toContain('complete_session_with_training_record_v2');
  });

  it('extends the operational design through immutable training history', () => {
    const records = readFileSync(join(projectRoot, 'src/TrainingRecordsPage.jsx'), 'utf8');

    expect(records).toContain('training-history-redesign-page');
    expect(records).toContain('training-history-summary');
    expect(records).toContain('training-record-card');
    expect(records).toContain('operational_correct_training_record_v2');
    expect(records).toContain('list_training_record_versions_v2');
  });

  it('preserves the locked versioned pre-flight review workflow in the R4 design', () => {
    const preflight = readFileSync(join(projectRoot, 'src/PreflightPage.jsx'), 'utf8');

    expect(preflight).toContain('preflight-redesign-page');
    expect(preflight).toContain('preflight-form-panel');
    expect(preflight).toContain('preflight-readonly-panel');
    expect(preflight).toContain('student_submit_preflight');
    expect(preflight).toContain('operational_accept_preflight');
    expect(preflight).toContain('operational_request_preflight_changes');
    expect(preflight).toContain('This version is read-only until an instructor requests changes.');
    expect(preflight).toContain('<ActionErrorModal');
  });

  it('preserves protected account and programme management in the R5 design', () => {
    const accounts = readFileSync(
      join(projectRoot, 'src/AdminAccountsManagerPage.jsx'),
      'utf8'
    );

    expect(accounts).toContain('accounts-redesign-page');
    expect(accounts).toContain('account-status-tabs');
    expect(accounts).toContain('programme-progress-track');
    expect(accounts).toContain('admin_approve_user');
    expect(accounts).toContain('admin_assign_student_programme_v2');
    expect(accounts).toContain('admin_can_permanently_delete_user_v2');
    expect(accounts).toContain('admin_permanently_delete_unused_user_v2');
    expect(accounts).toContain('<ActionErrorModal');
  });

  it('preserves protected fleet management in the R6 design', () => {
    const fleet = readFileSync(join(projectRoot, 'src/FleetResourcesPage.jsx'), 'utf8');

    expect(fleet).toContain('fleet-redesign-page');
    expect(fleet).toContain('fleet-summary-strip');
    expect(fleet).toContain('fleet-resource-card');
    expect(fleet).toContain('adminCreateTrainingResource');
    expect(fleet).toContain('adminUpdateTrainingResource');
    expect(fleet).toContain('AeroPath blocks deactivation when a future approved booking or in-progress session exists.');
    expect(fleet).toContain('<ActionErrorModal');
  });

  it('packages the real Aeroviation wordmark for the branded login', () => {
    const app = readFileSync(join(projectRoot, 'src/App.jsx'), 'utf8');
    const brand = readFileSync(join(projectRoot, 'src/AeroBrandLockup.jsx'), 'utf8');
    const logo = readFileSync(
      join(projectRoot, 'public/aeroviation-logo-dark.png')
    );

    expect(app).toContain('<AeroBrandLockup tagline />');
    expect(brand).toContain('src="/aeroviation-logo-dark.png"');
    expect(app).toContain('aero-auth-visual');
    expect(logo.length).toBeGreaterThan(30_000);
  });

  it('keeps loading and sidebar branding legible at their display sizes', () => {
    const app = readFileSync(join(projectRoot, 'src/App.jsx'), 'utf8');
    const shell = readFileSync(join(projectRoot, 'src/AppShell.jsx'), 'utf8');
    const styles = readFileSync(join(projectRoot, 'src/styles.css'), 'utf8');

    expect(app).toContain('aero-loading-card');
    expect(app).toContain('aero-loading-indicator');
    expect(shell).toContain('<AeroBrandLockup compact />');
    expect(shell).toContain('className="aero-mobile-wing"');
    expect(styles).toContain('.aero-wing-wordmark');
    expect(styles).toContain('.aero-sidebar-brand .aero-wing-image');
    expect(styles).toContain('white-space: nowrap');
    expect(styles).toContain('width: max-content');
  });

  it('uses the supplied thin-line module icon family with distinct timetable, ATC and VR symbols', () => {
    const emblems = readFileSync(join(projectRoot, 'src/ModuleEmblem.jsx'), 'utf8');
    const timetable = readFileSync(join(projectRoot, 'src/TimetablePage.jsx'), 'utf8');
    const fleet = readFileSync(join(projectRoot, 'src/FleetResourcesPage.jsx'), 'utf8');

    expect(emblems).toContain('departures:');
    expect(emblems).toContain('M16.5 40.5 10 47h10');
    expect(emblems).toContain('fill="currentColor" stroke="none"');
    expect(emblems).toContain('headset:');
    expect(emblems).toContain('vr:');
    expect(emblems).toContain('M19 21H9v8l4 7h6');
    expect(timetable).toContain('<ModuleEmblem name="departures"');
    expect(fleet).toContain('function resourceEmblem(resource)');
    expect(fleet).toContain('return "headset"');
    expect(fleet).toContain('return "vr"');
  });

  it('uses clean aviation illustrations and the Bristell sunset sign-in scene', () => {
    const app = readFileSync(join(projectRoot, 'src/App.jsx'), 'utf8');
    const shell = readFileSync(join(projectRoot, 'src/AppShell.jsx'), 'utf8');
    const operations = readFileSync(join(projectRoot, 'src/AdminOperationsCentrePage.jsx'), 'utf8');
    const emblems = readFileSync(join(projectRoot, 'src/ModuleEmblem.jsx'), 'utf8');
    const styles = readFileSync(join(projectRoot, 'src/styles.css'), 'utf8');
    const brand = readFileSync(join(projectRoot, 'src/AeroBrandLockup.jsx'), 'utf8');
    const mobileHero = readFileSync(join(projectRoot, 'public/bristell-sunset-hero-v2.png'));
    const desktopHero = readFileSync(join(projectRoot, 'public/bristell-sunset-desktop.png'));

    expect(app).not.toContain('className="aero-horizon"');
    expect(styles).toContain('url("/bristell-sunset-hero-v2.png")');
    expect(styles).toContain('url("/bristell-sunset-desktop.png")');
    expect(mobileHero.length).toBeGreaterThan(500_000);
    expect(desktopHero.length).toBeGreaterThan(500_000);
    expect(operations).not.toContain('✦');
    expect(operations).toContain('moduleIllustrations');
    expect(operations).toContain('<ModuleEmblem');
    expect(operations).toContain('operations-centre-page');
    expect(operations).toContain('has-work');
    expect(emblems).toContain('bare = false');
    expect(emblems).toContain('emblem-${name}');
    expect(brand).toContain('aero-wing-image');
    expect(app).toContain('<h1>Your training journey</h1>');
    expect(shell).toContain('label="Home"');
    expect(shell).toContain('label="Bookings"');
    expect(shell).toContain('label="Sessions"');
  });

  it('applies the reference-led R9 system across the full application shell', () => {
    const shell = readFileSync(join(projectRoot, 'src/AppShell.jsx'), 'utf8');
    const operations = readFileSync(join(projectRoot, 'src/AdminOperationsCentrePage.jsx'), 'utf8');
    const styles = readFileSync(join(projectRoot, 'src/styles.css'), 'utf8');
    const files = readFileSync(join(projectRoot, 'src/FilesPage.jsx'), 'utf8');
    const safety = readFileSync(join(projectRoot, 'src/SafetyControlTowerPage.jsx'), 'utf8');

    expect(shell).toContain('label="Bookings"');
    expect(operations).toContain('operations-queue-grid');
    expect(operations).toContain('operations-quick-actions');
    expect(styles).toContain('UI REDESIGN R9');
    expect(styles).toContain('.operations-queue-grid');
    expect(styles).toContain('grid-template-columns: repeat(5');
    expect(styles).toContain('backdrop-filter: blur(22px)');
    expect(files).toContain('files-redesign-page');
    expect(safety).toContain('safety-redesign-page');
  });
});

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
