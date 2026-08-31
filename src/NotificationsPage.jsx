import {
  useEffect,
  useMemo,
  useState,
} from "react";

import ActionConfirmModal from "./ActionConfirmModal";
import ActionErrorModal from "./ActionErrorModal";
import ModuleEmblem from "./ModuleEmblem";
import {
  dismissNotification,
  getUnreadCount,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from "./lib/notifications";


export default function NotificationsPage({
  role,
  onBack,
  onSignOut,
}) {
  const [notifications, setNotifications] =
    useState([]);

  const [unreadCount, setUnreadCount] =
    useState(0);

  const [filter, setFilter] =
    useState("ALL");

  const [loading, setLoading] =
    useState(true);

  const [busyId, setBusyId] =
    useState(null);

  const [bulkBusy, setBulkBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [dismissConfirm, setDismissConfirm] =
    useState(null);


  async function loadNotifications() {
    try {
      setLoading(true);
      setError("");

      const [
        notificationData,
        count,
      ] = await Promise.all([
        listMyNotifications(),
        getUnreadCount(),
      ]);

      setNotifications(
        notificationData
      );

      setUnreadCount(
        count
      );
    } catch (err) {
      console.error(
        "Failed to load notifications:",
        err
      );

      setError(
        err?.message ||
          "Unable to load notifications."
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    loadNotifications();
  }, []);


  const visibleNotifications =
    useMemo(() => {
      if (filter === "UNREAD") {
        return notifications.filter(
          (item) =>
            !item.is_read
        );
      }

      if (filter === "READ") {
        return notifications.filter(
          (item) =>
            item.is_read
        );
      }

      return notifications;
    }, [
      notifications,
      filter,
    ]);


  async function handleToggleRead(item) {
    try {
      setBusyId(
        item.notification_id
      );

      setError("");
      setSuccess("");

      if (item.is_read) {
        await markNotificationUnread(
          item.notification_id
        );

        setSuccess(
          "Notification marked unread."
        );
      } else {
        await markNotificationRead(
          item.notification_id
        );

        setSuccess(
          "Notification marked read."
        );
      }

      await loadNotifications();
    } catch (err) {
      console.error(
        "Failed to update notification:",
        err
      );

      setError(
        err?.message ||
          "Unable to update notification."
      );
    } finally {
      setBusyId(null);
    }
  }


  async function handleMarkAllRead() {
    try {
      setBulkBusy(true);
      setError("");
      setSuccess("");

      const affected =
        await markAllNotificationsRead();

      setSuccess(
        affected === 1
          ? "1 notification marked read."
          : `${affected} notifications marked read.`
      );

      await loadNotifications();
    } catch (err) {
      console.error(
        "Failed to mark all notifications read:",
        err
      );

      setError(
        err?.message ||
          "Unable to mark all notifications read."
      );
    } finally {
      setBulkBusy(false);
    }
  }


  function handleDismiss(item) {
    setDismissConfirm(item);
  }


  async function executeDismiss() {
    const item = dismissConfirm;

    if (!item) {
      return;
    }

    try {
      setBusyId(
        item.notification_id
      );

      setError("");
      setSuccess("");

      await dismissNotification(
        item.notification_id
      );

      setSuccess(
        "Notification dismissed."
      );

      setDismissConfirm(null);
      await loadNotifications();
    } catch (err) {
      console.error(
        "Failed to dismiss notification:",
        err
      );

      setError(
        err?.message ||
          "Unable to dismiss notification."
      );
    } finally {
      setBusyId(null);
    }
  }


  return (
    <main className="app">
      <header className="topbar">
        <Brand compact />

        <div className="topbar-right">
          <span className="role">
            {formatRole(role)}
          </span>

          <button
            className="secondary"
            type="button"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </header>


      <section className="bookings-page">
        <button
          className="secondary back-button"
          type="button"
          onClick={onBack}
        >
          ← Back to dashboard
        </button>


        <div className="eyebrow">
          AEROPATH OPERATIONS
        </div>


        <div className="student-booking-header aero-page-heading">
          <div>
            <h1>
              Notifications
            </h1>

            <p className="muted">
              Review operational updates,
              booking messages, safety
              assignments and other AeroPath
              notifications.
            </p>
          </div>

          <div className="aero-heading-aside">
            <ModuleEmblem name="notifications" />
            <button
              className="secondary"
              type="button"
              disabled={loading || bulkBusy}
              onClick={loadNotifications}
            >
              Refresh
            </button>
          </div>
        </div>


        {success && (
          <div className="signup-success booking-message">
            {success}
          </div>
        )}


        <div className="admin-stats">
          <button
            type="button"
            className={
              filter === "ALL"
                ? "stat-card active"
                : "stat-card"
            }
            onClick={() =>
              setFilter("ALL")
            }
          >
            <strong>
              {notifications.length}
            </strong>

            <span>
              All
            </span>
          </button>


          <button
            type="button"
            className={
              filter === "UNREAD"
                ? "stat-card active"
                : "stat-card"
            }
            onClick={() =>
              setFilter("UNREAD")
            }
          >
            <strong>
              {unreadCount}
            </strong>

            <span>
              Unread
            </span>
          </button>


          <button
            type="button"
            className={
              filter === "READ"
                ? "stat-card active"
                : "stat-card"
            }
            onClick={() =>
              setFilter("READ")
            }
          >
            <strong>
              {
                notifications.length -
                unreadCount
              }
            </strong>

            <span>
              Read
            </span>
          </button>
        </div>


        <div
          style={{
            display: "flex",
            justifyContent:
              "flex-end",
            margin:
              "18px 0",
          }}
        >
          <button
            className="secondary"
            type="button"
            disabled={
              bulkBusy ||
              unreadCount === 0
            }
            onClick={
              handleMarkAllRead
            }
          >
            {bulkBusy
              ? "Updating..."
              : "Mark all as read"}
          </button>
        </div>


        {loading ? (
          <div className="admin-empty">
            Loading notifications...
          </div>
        ) : visibleNotifications.length ===
          0 ? (
          <div className="admin-empty">
            {filter === "UNREAD"
              ? "You have no unread notifications."
              : filter === "READ"
              ? "You have no read notifications."
              : "You have no notifications."}
          </div>
        ) : (
          <div className="student-booking-list">
            {visibleNotifications.map(
              (item) => {
                const busy =
                  busyId ===
                  item.notification_id;

                return (
                  <article
                    key={
                      item.notification_id
                    }
                    className="student-booking-card"
                    style={{
                      opacity:
                        item.is_read
                          ? 0.78
                          : 1,
                    }}
                  >
                    <div className="student-booking-header">
                      <div>
                        <div className="eyebrow">
                          {formatLabel(
                            item.notification_type
                          )}
                        </div>

                        <h3>
                          {item.title}
                        </h3>

                        <p className="muted">
                          {formatDateTime(
                            item.created_at
                          )}
                        </p>
                      </div>

                      <span
                        className={`booking-status ${
                          item.is_read
                            ? "approved"
                            : "requested"
                        }`}
                      >
                        {item.is_read
                          ? "Read"
                          : "Unread"}
                      </span>
                    </div>


                    <div className="booking-note">
                      <p>
                        {item.message}
                      </p>
                    </div>


                    {(item.booking_id ||
                      item.session_id) && (
                      <div className="booking-details-grid instructor-booking-details">
                        {item.booking_id && (
                          <Detail
                            label="Booking reference"
                            value={
                              item.booking_id
                            }
                          />
                        )}

                        {item.session_id && (
                          <Detail
                            label="Session reference"
                            value={
                              item.session_id
                            }
                          />
                        )}
                      </div>
                    )}


                    <div
                      style={{
                        display:
                          "flex",
                        flexWrap:
                          "wrap",
                        gap: "10px",
                        marginTop:
                          "14px",
                      }}
                    >
                      <button
                        className="secondary"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          handleToggleRead(
                            item
                          )
                        }
                      >
                        {busy
                          ? "Updating..."
                          : item.is_read
                          ? "Mark unread"
                          : "Mark read"}
                      </button>

                      <button
                        className="danger-button"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          handleDismiss(
                            item
                          )
                        }
                      >
                        Dismiss
                      </button>
                    </div>
                  </article>
                );
              }
            )}
          </div>
        )}
      </section>

      <ActionConfirmModal
        open={Boolean(dismissConfirm)}
        eyebrow="NOTIFICATION"
        title="Dismiss notification?"
        message={dismissConfirm?.title || "This notification will be dismissed from your active list."}
        confirmLabel="Dismiss Notification"
        danger
        onConfirm={executeDismiss}
        onClose={() => setDismissConfirm(null)}
      />

      <ActionErrorModal
        open={Boolean(error)}
        title="Notification action blocked"
        message={error}
        onClose={() =>
          setError("")
        }
      />
    </main>
  );
}


function Detail({
  label,
  value,
}) {
  return (
    <div>
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}


function Brand({
  compact = false,
}) {
  return (
    <div
      className={
        compact
          ? "brand compact"
          : "brand"
      }
    >
      <div className="brand-name">
        AEROPATH
      </div>

      <div className="brand-by">
        by AEROVIATION
      </div>
    </div>
  );
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


function formatLabel(value) {
  if (!value) {
    return "Notification";
  }

  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}


function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-SG",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone:
        "Asia/Singapore",
    }
  ).format(
    new Date(value)
  );
}
