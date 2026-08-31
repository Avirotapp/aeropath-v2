import { useEffect, useMemo, useState } from "react";
import AeroIcon from "./AeroIcon";
import NotificationPopover from "./NotificationPopover";
import { getUnreadCount } from "./lib/notifications";
import AeroBrandLockup, { AeroWingWordmark } from "./AeroBrandLockup";

export default function AppShell({
  activePage,
  children,
  onNavigate,
  onSignOut,
  profile,
  roles = [],
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const groups = useMemo(() => navigationGroups(roles), [roles]);
  const displayName =
    profile?.display_name || profile?.full_name || "AeroPath user";
  const roleLabel = formatRoles(roles);
  const bookingRoute = roles.includes("STUDENT") || roles.includes("INSTRUCTOR")
    ? "MY_BOOKINGS"
    : "BOOKING_OPERATIONS";
  const currentLabel =
    groups.flatMap((group) => group.items).find((item) => item.route === activePage)
      ?.label || (activePage === "DASHBOARD" ? "Flight Deck" : "AeroPath");

  useEffect(() => {
    setDrawerOpen(false);
    setProfileOpen(false);
    setNotificationOpen(false);
  }, [activePage]);

  useEffect(() => {
    let active = true;
    getUnreadCount()
      .then((count) => active && setUnreadCount(count))
      .catch((error) => console.error("Failed to load unread notification count:", error));
    return () => {
      active = false;
    };
  }, [activePage]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        setProfileOpen(false);
        setNotificationOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  function navigate(route) {
    setDrawerOpen(false);
    setProfileOpen(false);
    setNotificationOpen(false);
    onNavigate(route);
  }

  return (
    <div className="aero-shell">
      <aside className={`aero-sidebar ${drawerOpen ? "open" : ""}`}>
        <button
          aria-label="Close navigation"
          className="aero-drawer-close"
          onClick={() => setDrawerOpen(false)}
          type="button"
        >
          <AeroIcon name="close" size={20} />
        </button>

        <button
          className="aero-sidebar-brand"
          onClick={() => navigate("DASHBOARD")}
          type="button"
        >
          <AeroBrandLockup compact />
        </button>

        <nav aria-label="AeroPath modules" className="aero-sidebar-nav">
          {groups.map((group) => (
            <section className="aero-nav-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map((item) => (
                <button
                  aria-current={activePage === item.route ? "page" : undefined}
                  className={`aero-nav-item ${
                    activePage === item.route ? "active" : ""
                  }`}
                  key={item.route}
                  onClick={() => navigate(item.route)}
                  type="button"
                >
                  <AeroIcon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </section>
          ))}
        </nav>

        <div className="aero-sidebar-footer">
          <span className="aero-system-dot" />
          <span>
            <strong>System operational</strong>
            <small>AeroPath V2</small>
          </span>
        </div>
      </aside>

      {drawerOpen && (
        <button
          aria-label="Close navigation"
          className="aero-drawer-backdrop"
          onClick={() => setDrawerOpen(false)}
          type="button"
        />
      )}

      <div className="aero-shell-stage">
        <header className="aero-utility-bar">
          <div className="aero-utility-context">
            <button
              aria-label="Open navigation"
              className="aero-mobile-menu"
              onClick={() => setDrawerOpen(true)}
              type="button"
            >
              <AeroIcon name="menu" size={22} />
            </button>
            <div>
              <span>OPERATIONS</span>
              <strong>{currentLabel}</strong>
            </div>
          </div>

          <AeroWingWordmark className="aero-mobile-wing" />

          <div className="aero-utility-actions">
            <button
              aria-label="Open notifications"
              className={`aero-icon-button ${
                activePage === "NOTIFICATIONS" ? "active" : ""
              }`}
              onClick={() => {
                setProfileOpen(false);
                setNotificationOpen((current) => !current);
              }}
              title="Notifications"
              type="button"
            >
              <AeroIcon name="bell" size={20} />
              {unreadCount > 0 && (
                <span className="aero-notification-badge">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            <div className="aero-profile-control">
              <button
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                aria-label="Open account menu"
                className={`aero-profile-button ${profileOpen ? "open" : ""}`}
                onClick={() => {
                  setNotificationOpen(false);
                  setProfileOpen((current) => !current);
                }}
                title="My profile"
                type="button"
              >
                <span className="aero-avatar">{initials(displayName)}</span>
                <span className="aero-profile-copy">
                  <strong>{displayName}</strong>
                  <small>{roleLabel}</small>
                </span>
                <AeroIcon name="chevron" size={16} />
              </button>

              {profileOpen && (
                <div className="aero-profile-menu" role="menu">
                  <button onClick={() => navigate("MY_PROFILE")} role="menuitem">
                    <AeroIcon name="profile" size={18} />
                    My profile
                  </button>
                  <button onClick={onSignOut} role="menuitem">
                    <AeroIcon name="logout" size={18} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <NotificationPopover
          onClose={() => setNotificationOpen(false)}
          onUnreadChange={setUnreadCount}
          onViewAll={() => navigate("NOTIFICATIONS")}
          open={notificationOpen}
        />

        <main className="aero-shell-content">{children}</main>

        <nav aria-label="Mobile navigation" className="aero-mobile-nav">
          <MobileNavButton
            active={activePage === "DASHBOARD"}
            icon="dashboard"
            label="Home"
            onClick={() => navigate("DASHBOARD")}
          />
          <MobileNavButton
            active={activePage === bookingRoute}
            icon="bookings"
            label="Bookings"
            onClick={() => navigate(bookingRoute)}
          />
          <MobileNavButton
            active={activePage === "TIMETABLE"}
            icon="timetable"
            label="Timetable"
            onClick={() => navigate("TIMETABLE")}
          />
          <MobileNavButton
            active={activePage === "SESSIONS"}
            icon="sessions"
            label="Sessions"
            onClick={() => navigate("SESSIONS")}
          />
          <MobileNavButton
            active={drawerOpen}
            icon="menu"
            label="More"
            onClick={() => setDrawerOpen(true)}
          />
        </nav>
      </div>
    </div>
  );
}

function MobileNavButton({ active, icon, label, onClick }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick} type="button">
      <AeroIcon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}

function navigationGroups(roles) {
  const roleSet = new Set(roles);
  const student = roleSet.has("STUDENT");
  const instructor = roleSet.has("INSTRUCTOR");
  const admin = roleSet.has("ADMIN");
  const safetyManager = roleSet.has("SAFETY_MANAGER");
  const adminEquivalent = admin || safetyManager;
  const canOperate = student || instructor || adminEquivalent;

  const groups = [
    {
      label: "OVERVIEW",
      items: [
        {
          route: "DASHBOARD",
          label: adminEquivalent ? "Operations Centre" : "Flight Deck",
          icon: "dashboard",
        },
      ],
    },
  ];

  const operations = [];
  if (student || instructor) {
    operations.push({ route: "MY_BOOKINGS", label: "My Bookings", icon: "bookings" });
  }
  if (instructor || adminEquivalent) {
    operations.push({
      route: "BOOKING_OPERATIONS",
      label: "Booking Operations",
      icon: "bookings",
    });
  }
  if (canOperate) {
    operations.push(
      { route: "TIMETABLE", label: "Timetable", icon: "timetable" },
      { route: "SESSIONS", label: "Sessions", icon: "sessions" },
      { route: "TRAINING_RECORDS", label: "Training History", icon: "history" }
    );
  }
  if (student) {
    operations.push({ route: "PREFLIGHT", label: "Pre-flight", icon: "preflight" });
  }
  if (instructor || adminEquivalent) {
    operations.push({
      route: "PREFLIGHT_REVIEWS",
      label: "Pre-flight",
      icon: "preflight",
    });
  }
  if (canOperate) {
    operations.push({ route: "FILES", label: "Files", icon: "files" });
  }
  if (operations.length) groups.push({ label: "OPERATIONS", items: operations });

  groups.push({
    label: "TRAINING",
    items: [{ route: "GROUND_SCHOOL", label: "Ground School", icon: "ground" }],
  });

  if (adminEquivalent) {
    const administration = [
      { route: "ACCOUNTS", label: "Accounts & Users", icon: "accounts" },
      { route: "FLEET", label: "Fleet & Simulators", icon: "fleet" },
    ];
    administration.push({ route: "AUDIT_TRAIL", label: "Audit Trail", icon: "audit" });
    groups.push({ label: "ADMINISTRATION", items: administration });
  }

  groups.push({
    label: "SAFETY",
    items: [{ route: "SAFETY_CONTROL", label: "Safety Control Tower", icon: "safety" }],
  });

  return groups;
}

function initials(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AP";
}

function formatRoles(roles) {
  const role = ["ADMIN", "SAFETY_MANAGER", "INSTRUCTOR", "STUDENT"].find((item) =>
    roles.includes(item)
  );
  return role
    ? role
        .toLowerCase()
        .split("_")
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(" ")
    : "AeroPath user";
}
