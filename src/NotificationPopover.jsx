import { useEffect, useState } from "react";
import AeroIcon from "./AeroIcon";
import {
  getUnreadCount,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./lib/notifications";

export default function NotificationPopover({
  open,
  onClose,
  onUnreadChange,
  onViewAll,
}) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [items, count] = await Promise.all([
        listMyNotifications(),
        getUnreadCount(),
      ]);
      setNotifications(items);
      setUnreadCount(count);
      onUnreadChange?.(count);
    } catch (err) {
      console.error("Failed to load notification popout:", err);
      setError(err?.message || "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  async function markRead(item) {
    if (item.is_read) return;
    try {
      setBusy(true);
      await markNotificationRead(item.notification_id);
      await load();
    } catch (err) {
      console.error("Failed to mark notification read:", err);
      setError(err?.message || "Unable to update the notification.");
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    try {
      setBusy(true);
      setError("");
      await markAllNotificationsRead();
      await load();
    } catch (err) {
      console.error("Failed to mark notifications read:", err);
      setError(err?.message || "Unable to update notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="aero-notification-layer">
      <button
        aria-label="Close notifications"
        className="aero-notification-backdrop"
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="notification-popout-title"
        aria-modal="true"
        className="aero-notification-panel"
        role="dialog"
      >
        <header className="aero-notification-header">
          <div>
            <span className="eyebrow">OPERATIONS CENTRE</span>
            <h2 id="notification-popout-title">Notifications</h2>
          </div>
          <button
            aria-label="Close notifications"
            className="aero-popout-close"
            onClick={onClose}
            type="button"
          >
            <AeroIcon name="close" size={18} />
          </button>
        </header>

        <div className="aero-notification-summary">
          <span>{unreadCount ? `${unreadCount} unread` : "All caught up"}</span>
          {unreadCount > 0 && (
            <button disabled={busy} onClick={markAllRead} type="button">
              {busy ? "Updating…" : "Mark all read"}
            </button>
          )}
        </div>

        <div className="aero-notification-feed">
          {error && <div className="aero-popout-error">{error}</div>}
          {loading ? (
            <div className="aero-popout-empty">Loading operational updates…</div>
          ) : notifications.length === 0 ? (
            <div className="aero-popout-empty">
              <AeroIcon name="bell" size={24} />
              <strong>No notifications</strong>
              <span>New operational updates will appear here.</span>
            </div>
          ) : (
            notifications.slice(0, 6).map((item) => (
              <button
                className={`aero-notification-item ${item.is_read ? "read" : "unread"}`}
                disabled={busy}
                key={item.notification_id}
                onClick={() => markRead(item)}
                type="button"
              >
                <span className="aero-notification-marker" />
                <span className="aero-notification-copy">
                  <span className="aero-notification-meta">
                    {formatLabel(item.notification_type)} · {formatDateTime(item.created_at)}
                  </span>
                  <strong>{item.title}</strong>
                  <span>{item.message}</span>
                </span>
              </button>
            ))
          )}
        </div>

        <footer className="aero-notification-footer">
          <button
            onClick={() => {
              onClose();
              onViewAll();
            }}
            type="button"
          >
            View all notifications
            <span aria-hidden="true">→</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

function formatLabel(value) {
  return String(value ?? "Update").replaceAll("_", " ").toUpperCase();
}

function formatDateTime(value) {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
