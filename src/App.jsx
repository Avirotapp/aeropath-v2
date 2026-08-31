import {
  useEffect,
  useState,
} from "react";
import AeroBrandLockup from "./AeroBrandLockup";

import { useAuth } from "./context/AuthContext";

import {
  signIn,
  signUp,
} from "./lib/auth";

import {
  adminApproveUser,
  adminListUsers,
  adminRejectUser,
} from "./lib/admin";

import StudentBookingsPage from "./StudentBookingsPage";
import InstructorBookingsPage from "./InstructorBookingsPage";
import TimetablePage from "./TimetablePage";
import SessionsPage from "./SessionsPage";
import PreflightPage from "./PreflightPage";
import TrainingRecordsPage from "./TrainingRecordsPage";
import FilesPage from "./FilesPage";
import SafetyControlTowerPage from "./SafetyControlTowerPage";
import NotificationsPage from "./NotificationsPage";
import AuditTrailPage from "./AuditTrailPage";
import AdminAccountsManagerPage from "./AdminAccountsManagerPage";
import MyProfilePage from "./MyProfilePage";
import FleetResourcesPage from "./FleetResourcesPage";
import FlightDeckPage from "./FlightDeckPage";
import AdminOperationsCentrePage from "./AdminOperationsCentrePage";
import GroundSchoolPage from "./GroundSchoolPage";
import AppShell from "./AppShell";



export default function App() {
  const {
    loading,
    isAuthenticated,
    profile,
    roles,
    primaryRole,
    accountStatus,
    isApproved,
    isPending,
    isRejected,
    isSuspended,
    logout,
  } = useAuth();

  const [page, setPage] =
    useState("DASHBOARD");

  const [
    pageContext,
    setPageContext,
  ] = useState(null);


  useEffect(() => {
    setPage("DASHBOARD");
    setPageContext(null);
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [profile?.id, primaryRole]);


  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [page]);


  if (loading) {
    return <LoadingScreen />;
  }


  if (!isAuthenticated) {
    return <AuthenticationScreen />;
  }


  if (isPending) {
    return (
      <AccountStateScreen
        title="Account awaiting approval"
        message="Your AeroPath account has been created successfully. An AeroPath administrator must approve your account and assign your operational role before you can enter the platform."
        status="PENDING"
        onSignOut={logout}
      />
    );
  }


  if (isRejected) {
    return (
      <AccountStateScreen
        title="Account not approved"
        message={
          profile?.rejection_reason ||
          "Your AeroPath account request was not approved."
        }
        status="REJECTED"
        onSignOut={logout}
      />
    );
  }


  if (isSuspended) {
    return (
      <AccountStateScreen
        title="Account suspended"
        message="This AeroPath account is currently suspended. Please contact an administrator."
        status="SUSPENDED"
        onSignOut={logout}
      />
    );
  }


  if (!isApproved) {
    return (
      <AccountStateScreen
        title="Account unavailable"
        message={`AeroPath cannot continue with account state: ${
          accountStatus ?? "UNKNOWN"
        }`}
        status={
          accountStatus ?? "UNKNOWN"
        }
        onSignOut={logout}
      />
    );
  }


  if (!primaryRole) {
    return (
      <AccountStateScreen
        title="Role not assigned"
        message="Your account has been approved, but no AeroPath role has been assigned. Please contact an administrator."
        status="ROLE REQUIRED"
        onSignOut={logout}
      />
    );
  }


  const assignedRoles =
    normalizeRoles(roles);

  const hasStudent =
    assignedRoles.includes(
      "STUDENT"
    );

  const hasInstructor =
    assignedRoles.includes(
      "INSTRUCTOR"
    );

  const hasAdmin =
    assignedRoles.includes(
      "ADMIN"
    );

  const hasSafetyManager =
    assignedRoles.includes(
      "SAFETY_MANAGER"
    );

  const isAdminEquivalent =
    hasAdmin ||
    hasSafetyManager;

  const canSelfBook =
    hasStudent ||
    hasInstructor;

  const canOperateTraining =
    hasStudent ||
    hasInstructor ||
    isAdminEquivalent;

  const operationalRole =
    hasAdmin
      ? "ADMIN"
      : hasSafetyManager
        ? "SAFETY_MANAGER"
        : hasInstructor
          ? "INSTRUCTOR"
          : hasStudent
            ? "STUDENT"
            : primaryRole;


  function navigate(
    route,
    context = null
  ) {
    setPageContext(context);
    setPage(route);
  }


  function withShell(content) {
    return (
      <AppShell
        activePage={page}
        profile={profile}
        roles={assignedRoles}
        onNavigate={navigate}
        onSignOut={logout}
      >
        {content}
      </AppShell>
    );
  }


  if (
    isAdminEquivalent &&
    page === "ACCOUNTS"
  ) {
    return withShell(
      <AdminAccountsManagerPage
        onBack={() =>
          setPage("DASHBOARD")
        }
        onSignOut={logout}
      />
    );
  }


  if (
    isAdminEquivalent &&
    (page === "FLEET" ||
      page === "SIMULATORS")
  ) {
    return withShell(
      <FleetResourcesPage
        onBack={() =>
          setPage("DASHBOARD")
        }
        onSignOut={logout}
      />
    );
  }


  if (
    canSelfBook &&
    page === "MY_BOOKINGS"
  ) {
    return withShell(
      <StudentBookingsPage
        role={operationalRole}
        onBack={() =>
          setPage("DASHBOARD")
        }
        onSignOut={logout}
      />
    );
  }


  if (
    (hasInstructor ||
      isAdminEquivalent) &&
    page ===
      "BOOKING_OPERATIONS"
  ) {
    return withShell(
      <InstructorBookingsPage
        role={operationalRole}
        onBack={() =>
          setPage("DASHBOARD")
        }
        onSignOut={logout}
      />
    );
  }


  if (
    canOperateTraining &&
    page === "TIMETABLE"
  ) {
    return withShell(
      <TimetablePage
        role={operationalRole}
        onBack={() =>
          setPage("DASHBOARD")
        }
        onSignOut={logout}
      />
    );
  }


  if (
    canOperateTraining &&
    page === "SESSIONS"
  ) {
    return withShell(
      <SessionsPage
        role={operationalRole}
        initialFilter={
          pageContext?.initialFilter
        }
        onBack={() => {
          setPageContext(null);
          setPage("DASHBOARD");
        }}
        onSignOut={logout}
      />
    );
  }


  if (
    canOperateTraining &&
    page ===
      "TRAINING_RECORDS"
  ) {
    return withShell(
      <TrainingRecordsPage
        role={operationalRole}
        onBack={() =>
          setPage("DASHBOARD")
        }
        onSignOut={logout}
      />
    );
  }


  if (
    hasStudent &&
    page === "PREFLIGHT"
  ) {
    return withShell(
      <PreflightPage
        role="STUDENT"
        onBack={() =>
          setPage("DASHBOARD")
        }
        onSignOut={logout}
      />
    );
  }


  if (
    (hasInstructor ||
      isAdminEquivalent) &&
    page ===
      "PREFLIGHT_REVIEWS"
  ) {
    return withShell(
      <PreflightPage
        role={
          hasAdmin
            ? "ADMIN"
            : hasSafetyManager
              ? "SAFETY_MANAGER"
              : "INSTRUCTOR"
        }
        onBack={() =>
          setPage("DASHBOARD")
        }
        onSignOut={logout}
      />
    );
  }


  if (
    assignedRoles.length > 0 &&
    page === "GROUND_SCHOOL"
  ) {
    return withShell(
      <GroundSchoolPage
        role={operationalRole}
        initialContext={pageContext}
        onBack={() => {
          setPageContext(null);
          setPage("DASHBOARD");
        }}
        onSignOut={logout}
      />
    );
  }


  if (
    canOperateTraining &&
    page === "FILES"
  ) {
    return withShell(
      <FilesPage
        role={operationalRole}
        onBack={() =>
          setPage("DASHBOARD")
        }
        onSignOut={logout}
      />
    );
  }


  if (
    assignedRoles.length > 0 &&
    page ===
      "SAFETY_CONTROL"
  ) {
    return withShell(
      <SafetyControlTowerPage
        role={
          hasAdmin
            ? "ADMIN"
            : hasSafetyManager
              ? "SAFETY_MANAGER"
              : hasInstructor
                ? "INSTRUCTOR"
                : "STUDENT"
        }
        onBack={() =>
          setPage("DASHBOARD")
        }
        onSignOut={logout}
      />
    );
  }


  if (
    (hasAdmin ||
      hasSafetyManager) &&
    page === "AUDIT_TRAIL"
  ) {
    return withShell(
      <AuditTrailPage
        role={
          hasAdmin
            ? "ADMIN"
            : "SAFETY_MANAGER"
        }
        onBack={() =>
          setPage("DASHBOARD")
        }
        onSignOut={logout}
      />
    );
  }


  if (
    assignedRoles.length > 0 &&
    page === "MY_PROFILE"
  ) {
    return withShell(
      <MyProfilePage
        onBack={() =>
          setPage("DASHBOARD")
        }
        onSignOut={logout}
      />
    );
  }


  if (
    assignedRoles.length > 0 &&
    page === "NOTIFICATIONS"
  ) {
    return withShell(
      <NotificationsPage
        role={primaryRole}
        onBack={() =>
          setPage("DASHBOARD")
        }
        onSignOut={logout}
      />
    );
  }


  if (isAdminEquivalent) {
    return withShell(
      <AdminOperationsCentrePage
        profile={profile}
        roles={assignedRoles}
        onSignOut={logout}
        onNavigate={(
          route,
          context = null
        ) => {
          setPageContext(context);
          setPage(route);
        }}
      />
    );
  }


  return withShell(
    <FlightDeckPage
      profile={profile}
      role={primaryRole}
      roles={assignedRoles}
      onSignOut={logout}
      onNavigate={navigate}
    />
  );

}


function AuthenticationScreen() {
  const [mode, setMode] =
    useState("SIGN_IN");

  if (mode === "SIGN_UP") {
    return (
      <SignUpScreen
        onShowSignIn={() =>
          setMode("SIGN_IN")
        }
      />
    );
  }

  return (
    <LoginScreen
      onShowSignUp={() =>
        setMode("SIGN_UP")
      }
    />
  );
}


function LoginScreen({
  onShowSignUp,
}) {
  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [loginError, setLoginError] =
    useState("");


  async function handleSubmit(event) {
    event.preventDefault();

    setLoginError("");

    if (
      !email.trim() ||
      !password
    ) {
      setLoginError(
        "Enter your email and password."
      );

      return;
    }


    try {
      setSubmitting(true);

      await signIn(
        email.trim(),
        password
      );
    } catch (error) {
      setLoginError(
        error?.message ||
          "Unable to sign in."
      );
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <main className="login aero-auth">
      <section className="aero-auth-visual" aria-label="AeroPath by Aeroviation">
        <AeroBrandLockup tagline />

        <div className="aero-auth-visual-copy">
          <div className="eyebrow">WELCOME TO THE FLIGHT DECK</div>
          <h1>Your training journey</h1>
          <p>
            One operational picture for bookings, preparation, ground school,
            sessions and training progress.
          </p>
        </div>

      </section>

      <section className="login-card aero-auth-card">
        <div className="aero-auth-mobile-brand"><Brand /></div>

        <div className="eyebrow">SECURE SIGN IN</div>

        <h2>Welcome back</h2>

        <p className="muted">
          Access your AeroPath training workspace.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">
            Email
          </label>

          <input
            id="email"
            type="email"
            value={email}
            autoComplete="email"
            placeholder="you@example.com"
            onChange={(event) =>
              setEmail(
                event.target.value
              )
            }
          />

          <label htmlFor="password">
            Password
          </label>

          <input
            id="password"
            type="password"
            value={password}
            autoComplete="current-password"
            placeholder="Enter your password"
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
          />

          {loginError && (
            <div className="login-error">
              {loginError}
            </div>
          )}

          <button
            className="primary"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? "Signing in..."
              : "Enter AeroPath"}
          </button>
        </form>

        <button
          className="secondary full-width auth-switch"
          onClick={onShowSignUp}
        >
          New to AeroPath? Create account
        </button>
      </section>
    </main>
  );
}


function SignUpScreen({
  onShowSignIn,
}) {
  const [fullName, setFullName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [signupError, setSignupError] =
    useState("");

  const [
    signupSuccess,
    setSignupSuccess,
  ] = useState("");


  async function handleSubmit(event) {
    event.preventDefault();

    setSignupError("");
    setSignupSuccess("");


    if (!fullName.trim()) {
      setSignupError(
        "Enter your full name."
      );

      return;
    }


    if (!email.trim()) {
      setSignupError(
        "Enter your email address."
      );

      return;
    }


    if (password.length < 8) {
      setSignupError(
        "Password must contain at least 8 characters."
      );

      return;
    }


    if (
      password !==
      confirmPassword
    ) {
      setSignupError(
        "Passwords do not match."
      );

      return;
    }


    try {
      setSubmitting(true);

      const data = await signUp(
        fullName.trim(),
        email.trim(),
        password
      );

      if (!data.session) {
        setSignupSuccess(
          "Account created successfully. Your account remains pending until an administrator approves it."
        );
      }
    } catch (error) {
      setSignupError(
        error?.message ||
          "Unable to create your account."
      );
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <main className="login">
      <section className="login-card">
        <Brand />

        <div className="eyebrow">
          CREATE ACCOUNT
        </div>

        <h1>
          Join AeroPath
        </h1>

        <form onSubmit={handleSubmit}>
          <label>
            Full name
          </label>

          <input
            value={fullName}
            onChange={(event) =>
              setFullName(
                event.target.value
              )
            }
          />

          <label>
            Email
          </label>

          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(
                event.target.value
              )
            }
          />

          <label>
            Password
          </label>

          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
          />

          <label>
            Confirm password
          </label>

          <input
            type="password"
            value={confirmPassword}
            onChange={(event) =>
              setConfirmPassword(
                event.target.value
              )
            }
          />

          {signupError && (
            <div className="login-error">
              {signupError}
            </div>
          )}

          {signupSuccess && (
            <div className="signup-success">
              {signupSuccess}
            </div>
          )}

          <button
            className="primary"
            disabled={submitting}
          >
            Create account
          </button>
        </form>

        <button
          className="secondary full-width auth-switch"
          onClick={onShowSignIn}
        >
          Back to sign in
        </button>
      </section>
    </main>
  );
}


function normalizeRoles(
  roles
) {
  return [
    ...new Set(
      (roles ?? [])
        .map((item) =>
          typeof item ===
          "string"
            ? item
            : item?.role
        )
        .filter(Boolean)
    ),
  ];
}


function buildModulesForRoles(
  roles
) {
  const roleSet =
    new Set(
      normalizeRoles(roles)
    );

  const hasStudent =
    roleSet.has("STUDENT");

  const hasInstructor =
    roleSet.has(
      "INSTRUCTOR"
    );

  const hasAdmin =
    roleSet.has("ADMIN");

  const hasSafetyManager =
    roleSet.has(
      "SAFETY_MANAGER"
    );

  const isAdminEquivalent =
    hasAdmin ||
    hasSafetyManager;

  const modules = [];


  if (isAdminEquivalent) {
    modules.push(
      [
        "Accounts",
        "Approve accounts, manage roles, suspend access and reactivate users.",
      ],
      [
        "Fleet & Simulators",
        "Manage aircraft and simulator training resources.",
      ]
    );
  }


  if (
    hasStudent ||
    hasInstructor
  ) {
    modules.push([
      "My Bookings",
      "Request and manage your own simulator or aircraft training bookings.",
    ]);
  }


  if (
    hasInstructor ||
    isAdminEquivalent
  ) {
    modules.push([
      "Booking Operations",
      "Review bookings and apply authorised operational changes.",
    ]);
  }


  if (
    hasStudent ||
    hasInstructor ||
    isAdminEquivalent
  ) {
    modules.push(
      [
        "Timetable",
        hasStudent &&
        !hasInstructor &&
        !isAdminEquivalent
          ? "View your simulator and flight schedule."
          : "View the operational training-resource timetable.",
      ],
      [
        "Sessions",
        hasStudent &&
        !hasInstructor &&
        !isAdminEquivalent
          ? "View current and completed training sessions."
          : "Start, review and manage authorised training sessions.",
      ],
      [
        "Training Records",
        hasStudent &&
        !hasInstructor &&
        !isAdminEquivalent
          ? "View your simulator and flight training history."
          : "View and manage simulator and flight training records.",
      ]
    );
  }


  if (hasStudent) {
    modules.push([
      "Pre-flight",
      "Complete and submit your own pre-flight preparation.",
    ]);
  }


  if (
    hasInstructor ||
    isAdminEquivalent
  ) {
    modules.push([
      "Pre-flight Reviews",
      "Review submitted pre-flight preparation.",
    ]);
  }


  modules.push([
    "Ground School",
    isAdminEquivalent
      ? "Create and manage ground classes, custom tests, assignments and grading."
      : hasInstructor
        ? "Manage assigned ground classes, attendance, materials and written-answer reviews."
        : "View ground classes, materials, assigned tests and ground-school history.",
  ]);


  if (
    hasStudent ||
    hasInstructor ||
    isAdminEquivalent
  ) {
    modules.push([
      "Files",
      hasStudent &&
      !hasInstructor &&
      !hasAdmin
        ? "View documents attached to your training."
        : "Access authorised operational and training documents.",
    ]);
  }


  modules.push([
    "Safety Control Tower (ESMS)",
    hasAdmin ||
    hasSafetyManager
      ? "Report safety matters and access authorised ESMS management functions."
      : "Report safety matters and track your own safety reports.",
  ]);


  if (
    isAdminEquivalent
  ) {
    modules.push([
      "Audit Trail",
      "Review privileged, operational and safety audit activity.",
    ]);
  }


  return modules;
}


function formatRoles(
  roles
) {
  const ordered =
    [
      "ADMIN",
      "SAFETY_MANAGER",
      "INSTRUCTOR",
      "STUDENT",
    ].filter((role) =>
      normalizeRoles(
        roles
      ).includes(role)
    );

  if (
    ordered.length === 0
  ) {
    return "No Role";
  }

  return ordered
    .map(formatRole)
    .join(" · ");
}


function AccountStateScreen({
  title,
  message,
  status,
  onSignOut,
}) {
  return (
    <main className="login">
      <section className="login-card">
        <Brand />

        <div className="eyebrow">
          ACCOUNT STATUS
        </div>

        <h1>
          {title}
        </h1>

        <p className="muted">
          {message}
        </p>

        <div className="account-state">
          {status}
        </div>

        <button
          className="secondary full-width"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}


function LoadingScreen() {
  return (
    <main className="login aero-loading-screen">
      <section className="login-card aero-loading-card">
        <Brand />

        <div className="aero-loading-copy">
          <span className="aero-loading-indicator" aria-hidden="true" />
          <span>Preparing your flight deck</span>
        </div>

        <h1>Loading AeroPath…</h1>
      </section>
    </main>
  );
}


function Brand({
  compact = false,
}) {
  return <AeroBrandLockup compact={compact} />;
}


function formatRole(role) {
  switch (role) {
    case "STUDENT":
      return "Student";

    case "INSTRUCTOR":
      return "Instructor";

    case "ADMIN":
      return "Admin";

    case "SAFETY_MANAGER":
      return "Safety Manager";

    default:
      return role ?? "Unknown";
  }
}
