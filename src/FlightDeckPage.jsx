import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "./lib/supabase";
import AeroIcon from "./AeroIcon";
import ModuleEmblem from "./ModuleEmblem";


async function loadFlightDeck() {
  const { data, error } = await supabase.rpc("get_flight_deck_v1");
  if (error) throw error;
  return data ?? {};
}

async function loadGroundDeck() {
  try {
    await supabase.rpc("dispatch_ground_session_reminders_v1");
  } catch {
    // Reminder dispatch must never block Flight Deck loading.
  }
  const { data, error } = await supabase.rpc("list_ground_sessions_v1", {
    filter_start: null,
    filter_end: null,
    filter_class_id: null,
  });
  if (error) throw error;
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return (data ?? [])
    .filter((item) => ["SCHEDULED", "IN_PROGRESS"].includes(item.session_status))
    .filter((item) => item.session_status === "IN_PROGRESS" || (new Date(item.starts_at) >= now && new Date(item.starts_at) <= horizon))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}


export default function FlightDeckPage({
  profile,
  roles = [],
  onNavigate,
  onSignOut,
}) {
  const [deck, setDeck] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [groundSessions, setGroundSessions] =
    useState([]);

  const [groundError, setGroundError] =
    useState("");

  const [expanded, setExpanded] =
    useState({
      actions: true,
      waiting: true,
      upcoming: true,
      ground: true,
      progress: true,
    });


  async function refreshDeck() {
    try {
      setLoading(true);
      setError("");

      const [data, groundResult] = await Promise.all([
        loadFlightDeck(),
        loadGroundDeck()
          .then((rows) => ({ rows, error: "" }))
          .catch((groundErr) => ({
            rows: [],
            error:
              groundErr?.message ||
              "Unable to load Ground Sessions on the Flight Deck.",
          })),
      ]);

      setDeck(data);
      setGroundSessions(groundResult.rows);
      setGroundError(groundResult.error);
    } catch (err) {
      console.error(
        "Failed to load Flight Deck:",
        err
      );

      setError(
        err?.message ||
          "Unable to load Flight Deck."
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    refreshDeck();

    function refreshVisibleFlightDeck() {
      if (document.visibilityState === "visible") {
        refreshDeck();
      }
    }

    window.addEventListener("focus", refreshVisibleFlightDeck);
    document.addEventListener("visibilitychange", refreshVisibleFlightDeck);

    return () => {
      window.removeEventListener("focus", refreshVisibleFlightDeck);
      document.removeEventListener("visibilitychange", refreshVisibleFlightDeck);
    };
  }, []);


  const actionQueue =
    deck?.action_queue ?? [];

  const waitingOn =
    deck?.waiting_on ?? [];

  const upcoming =
    deck?.upcoming ?? [];

  const trainingProgress =
    deck?.training_progress ?? [];

  const counters =
    deck?.counters ?? {};

  const nextAction =
    deck?.next_action ?? null;

  const activeGroundSessions =
    groundSessions.filter(
      (item) =>
        item.session_status ===
        "IN_PROGRESS"
    );

  const upcomingGroundSessions =
    groundSessions.filter(
      (item) =>
        item.session_status ===
        "SCHEDULED"
    );

  const roleLabel =
    useMemo(
      () => formatRoles(roles),
      [roles]
    );


  function goToRoute(route, item = null) {
    if (!route) {
      return;
    }

    const actionId =
      item?.action_id || "";

    let context = null;

    if (
      route === "SESSIONS" &&
      actionId.startsWith(
        "SESSION_COMPLETE:"
      )
    ) {
      context = {
        initialFilter:
          "IN_PROGRESS",
      };
    } else if (
      route === "SESSIONS" &&
      actionId.startsWith(
        "SESSION_START:"
      )
    ) {
      context = {
        initialFilter: "READY",
      };
    } else if (
      route === "GROUND_SCHOOL" &&
      item?.ground_session_id
    ) {
      context = {
        groundSessionId: item.ground_session_id,
      };
    }

    onNavigate(
      route,
      context
    );
  }


  function toggle(section) {
    setExpanded(
      (current) => ({
        ...current,
        [section]:
          !current[section],
      })
    );
  }


  return (
    <main className="app flight-deck-page">
      <header className="topbar">
        <Brand />

        <div className="topbar-right">
          <span className="role">
            {roleLabel}
          </span>

          <button
            className="secondary"
            type="button"
            onClick={refreshDeck}
            disabled={loading}
          >
            Refresh
          </button>

          <button
            className="secondary"
            type="button"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </header>


      <section className="hero aero-page-hero">
        <div>
          <div className="aero-mobile-deck-brand">
            <strong>Aero<span>Path</span></strong>
            <small>by Aeroviation</small>
          </div>
          <div className="eyebrow">FLIGHT DECK</div>

          <h1>
            {greeting()},{" "}
            {profile?.display_name || profile?.full_name || "AeroPath user"}
          </h1>

          <p className="muted">
            Your operational picture, next action and upcoming training in one place.
          </p>

          {roles.length > 1 && (
            <p className="aero-capability-line">Active capabilities: {roleLabel}</p>
          )}
        </div>

        <div className="aero-heading-aside">
          <ModuleEmblem name="deck" />
          <button
            className="secondary aero-refresh-button"
            type="button"
            onClick={refreshDeck}
            disabled={loading}
          >
            <AeroIcon name="dashboard" size={18} />
            {loading ? "Refreshing" : "Refresh picture"}
          </button>
        </div>
      </section>


      {error && (
        <section
          className="login-error booking-message"
          style={{
            maxWidth: "1180px",
            margin: "0 auto 18px",
          }}
        >
          {error}
        </section>
      )}

      {groundError && (
        <section
          className="login-error booking-message"
          style={{
            maxWidth: "1180px",
            margin: "0 auto 18px",
          }}
        >
          Ground School: {groundError}
        </section>
      )}


      {loading ? (
        <section
          className="admin-empty"
          style={{
            maxWidth: "1180px",
            margin: "24px auto",
          }}
        >
          Loading Flight Deck...
        </section>
      ) : (
        <>
          {activeGroundSessions.length > 0 && (
            <section
              style={{
                maxWidth: "1180px",
                margin: "0 auto 24px",
                padding: "0 20px",
              }}
            >
              <div className="student-booking-card ground-live-banner">
                <div className="student-booking-header">
                  <div>
                    <div className="eyebrow">GROUND SCHOOL · LIVE NOW</div>
                    <h2 style={{ marginBottom: "8px" }}>Ground Session in progress</h2>
                    <p className="muted" style={{ marginTop: 0 }}>
                      {activeGroundSessions.length === 1
                        ? "A Ground Session you can access is currently in progress."
                        : `${activeGroundSessions.length} Ground Sessions you can access are currently in progress.`}
                    </p>
                  </div>
                  <span className="booking-status requested">IN PROGRESS</span>
                </div>
                <div className="student-booking-list" style={{ marginTop: "16px" }}>
                  {activeGroundSessions.map((item) => (
                    <GroundUpcomingCard
                      key={`live-${item.ground_session_id}`}
                      item={item}
                      active
                      onOpen={() => goToRoute("GROUND_SCHOOL", item)}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          <section
            style={{
              maxWidth: "1180px",
              margin: "0 auto 24px",
              padding: "0 20px",
            }}
          >
            <div
              className="student-booking-card"
              style={{
                border:
                  nextAction?.priority_band ===
                  "CRITICAL"
                    ? "1px solid #ef4444"
                    : nextAction
                        ?.priority_band ===
                      "HIGH"
                      ? "1px solid #f59e0b"
                      : undefined,
              }}
            >
              <div className="eyebrow">
                NEXT ACTION
              </div>

              {nextAction ? (
                <>
                  <div className="student-booking-header">
                    <div>
                      <h2
                        style={{
                          marginBottom:
                            "8px",
                        }}
                      >
                        {
                          nextAction.title
                        }
                      </h2>

                      <p
                        className="muted"
                        style={{
                          marginTop: 0,
                        }}
                      >
                        {
                          nextAction.description
                        }
                      </p>
                    </div>

                    <span
                      className="role"
                      style={{
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      {formatPriorityBand(
                        nextAction.priority_band
                      )}
                    </span>
                  </div>

                  <div className="booking-details-grid">
                    <Detail
                      label="Domain"
                      value={formatLabel(
                        nextAction.domain
                      )}
                    />

                    <Detail
                      label="Due / operational time"
                      value={formatDateTime(
                        nextAction.due_at
                      )}
                    />

                    <Detail
                      label="Priority"
                      value={
                        nextAction.priority ??
                        "—"
                      }
                    />
                  </div>

                  {nextAction.blocking_reason && (
                    <div
                      className="booking-note"
                      style={{
                        marginTop: "16px",
                      }}
                    >
                      <strong>
                        Why this matters
                      </strong>

                      <p>
                        {
                          nextAction.blocking_reason
                        }
                      </p>
                    </div>
                  )}

                  <button
                    className="primary"
                    type="button"
                    style={{
                      marginTop: "16px",
                    }}
                    onClick={() =>
                      goToRoute(
                        nextAction.route,
                        nextAction
                      )
                    }
                  >
                    Continue to{" "}
                    {routeLabel(
                      nextAction.route
                    )}{" "}
                    →
                  </button>
                </>
              ) : (
                <>
                  <h2>
                    No immediate action
                    required
                  </h2>

                  <p className="muted">
                    AeroPath has no current
                    action requiring your
                    attention.
                  </p>
                </>
              )}
            </div>
          </section>


          <section
            style={{
              maxWidth: "1180px",
              margin: "0 auto 24px",
              padding: "0 20px",
            }}
          >
            <div className="admin-stats">
              <CounterCard
                label="Action Required"
                value={
                  counters.actions ?? 0
                }
              />

              <CounterCard
                label="High Priority"
                value={
                  counters.urgent_actions ??
                  0
                }
              />

              <CounterCard
                label="Waiting On"
                value={
                  counters.waiting ?? 0
                }
              />

              <CounterCard
                label="Upcoming"
                value={
                  counters.upcoming ?? 0
                }
              />

              <CounterCard
                label="Unread"
                value={
                  counters.unread_notifications ??
                  0
                }
                onClick={() =>
                  goToRoute(
                    "NOTIFICATIONS"
                  )
                }
              />
            </div>

            <div className="aero-mobile-quick-actions">
              <h2>Quick Actions</h2>
              <div>
                <button type="button" onClick={() => goToRoute(roles.includes("STUDENT") || roles.includes("INSTRUCTOR") ? "MY_BOOKINGS" : "BOOKING_OPERATIONS")}>
                  <AeroIcon name="bookings" size={22} />
                  <span>Book</span>
                </button>
                <button type="button" onClick={() => goToRoute("SESSIONS")}>
                  <AeroIcon name="sessions" size={22} />
                  <span>Start</span>
                </button>
                <button type="button" onClick={() => goToRoute("FILES")}>
                  <AeroIcon name="files" size={22} />
                  <span>Upload</span>
                </button>
              </div>
            </div>
          </section>


          <DeckSection
            eyebrow="ACTION QUEUE"
            title="What needs your attention"
            count={actionQueue.length}
            expanded={expanded.actions}
            onToggle={() =>
              toggle("actions")
            }
          >
            {actionQueue.length === 0 ? (
              <EmptyState
                text="No actions require your attention."
              />
            ) : (
              <div className="student-booking-list">
                {actionQueue.map(
                  (item, index) => (
                    <ActionCard
                      key={
                        item.action_id
                      }
                      item={item}
                      index={index}
                      onOpen={() =>
                        goToRoute(
                          item.route,
                          item
                        )
                      }
                    />
                  )
                )}
              </div>
            )}
          </DeckSection>


          <DeckSection
            eyebrow="WAITING ON"
            title="Submitted and awaiting someone else"
            count={waitingOn.length}
            expanded={expanded.waiting}
            onToggle={() =>
              toggle("waiting")
            }
          >
            {waitingOn.length === 0 ? (
              <EmptyState
                text="Nothing is currently waiting on another AeroPath user."
              />
            ) : (
              <div className="student-booking-list">
                {waitingOn.map(
                  (item) => (
                    <WaitingCard
                      key={item.item_id}
                      item={item}
                      onOpen={() =>
                        goToRoute(
                          item.route
                        )
                      }
                    />
                  )
                )}
              </div>
            )}
          </DeckSection>


          <DeckSection
            eyebrow="UPCOMING"
            title="Next operational bookings"
            count={upcoming.length}
            expanded={expanded.upcoming}
            onToggle={() =>
              toggle("upcoming")
            }
          >
            {upcoming.length === 0 ? (
              <EmptyState
                text="No upcoming approved training bookings."
              />
            ) : (
              <div className="student-booking-list">
                {upcoming.map(
                  (item) => (
                    <UpcomingCard
                      key={
                        item.booking_id
                      }
                      item={item}
                      onOpen={() =>
                        goToRoute(
                          item.route
                        )
                      }
                    />
                  )
                )}
              </div>
            )}
          </DeckSection>


          <DeckSection
            eyebrow="GROUND SCHOOL"
            title={activeGroundSessions.length > 0 ? "Active Ground Session" : "Upcoming Ground Sessions"}
            count={activeGroundSessions.length > 0 ? activeGroundSessions.length : upcomingGroundSessions.length}
            expanded={expanded.ground}
            onToggle={() => toggle("ground")}
          >
            {activeGroundSessions.length > 0 ? (
              <div className="student-booking-list">
                {activeGroundSessions.map((item) => (
                  <GroundUpcomingCard
                    key={item.ground_session_id}
                    item={item}
                    active
                    onOpen={() => goToRoute("GROUND_SCHOOL", item)}
                  />
                ))}
              </div>
            ) : upcomingGroundSessions.length === 0 ? (
              <EmptyState text="No Ground Sessions are scheduled in the next 7 days." />
            ) : (
              <div className="student-booking-list">
                {upcomingGroundSessions.slice(0, 6).map((item) => (
                  <GroundUpcomingCard
                    key={item.ground_session_id}
                    item={item}
                    onOpen={() => goToRoute("GROUND_SCHOOL", item)}
                  />
                ))}
              </div>
            )}
          </DeckSection>


          {trainingProgress.length >
            0 && (
            <DeckSection
              eyebrow="TRAINING PROGRESS"
              title="Programme progress"
              count={
                trainingProgress.filter(
                  (item) =>
                    item.assignment_active
                ).length
              }
              expanded={
                expanded.progress
              }
              onToggle={() =>
                toggle("progress")
              }
            >
              <div className="student-booking-list">
                {trainingProgress
                  .filter(
                    (item) =>
                      item.assignment_active
                  )
                  .map(
                    (item) => (
                      <ProgressCard
                        key={
                          item.assignment_id
                        }
                        item={item}
                        onOpen={() =>
                          goToRoute(
                            "TRAINING_RECORDS"
                          )
                        }
                      />
                    )
                  )}
              </div>
            </DeckSection>
          )}


          <section
            style={{
              maxWidth: "1180px",
              margin: "0 auto 36px",
              padding: "0 20px",
            }}
          >
            <p
              className="muted"
              style={{
                fontSize: "12px",
              }}
            >
              Flight Deck generated{" "}
              {formatDateTime(
                deck?.generated_at
              )}
              .
            </p>
          </section>
        </>
      )}
    </main>
  );
}


function DeckSection({
  eyebrow,
  title,
  count,
  expanded,
  onToggle,
  children,
}) {
  return (
    <section
      style={{
        maxWidth: "1180px",
        margin: "0 auto 24px",
        padding: "0 20px",
      }}
    >
      <article className="student-booking-card">
        <button
          type="button"
          onClick={onToggle}
          style={{
            width: "100%",
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "16px",
            border: 0,
            padding: 0,
            background:
              "transparent",
            color: "inherit",
            textAlign: "left",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          <div>
            <div className="eyebrow">
              {eyebrow}
            </div>

            <h2
              style={{
                marginBottom: 0,
              }}
            >
              {title}
            </h2>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span className="booking-count">
              {count}
            </span>

            <span>
              {expanded
                ? "▲"
                : "▼"}
            </span>
          </div>
        </button>

        {expanded && (
          <div
            style={{
              marginTop: "18px",
            }}
          >
            {children}
          </div>
        )}
      </article>
    </section>
  );
}


function ActionCard({
  item,
  index,
  onOpen,
}) {
  return (
    <article
      className="booking-note"
      style={{
        border:
          item.priority_band ===
          "CRITICAL"
            ? "1px solid #ef4444"
            : item.priority_band ===
              "HIGH"
              ? "1px solid #f59e0b"
              : undefined,
      }}
    >
      <div className="student-booking-header">
        <div>
          <div className="eyebrow">
            {index === 0
              ? "NEXT"
              : formatLabel(
                  item.domain
                )}
          </div>

          <strong>
            {item.title}
          </strong>

          <p>
            {item.description}
          </p>
        </div>

        <span className="role">
          {formatPriorityBand(
            item.priority_band
          )}
        </span>
      </div>

      {item.due_at && (
        <p className="muted">
          {formatDateTime(
            item.due_at
          )}
        </p>
      )}

      {item.blocking_reason && (
        <p className="muted">
          {
            item.blocking_reason
          }
        </p>
      )}

      <button
        className="secondary"
        type="button"
        onClick={onOpen}
      >
        Open{" "}
        {routeLabel(
          item.route
        )}{" "}
        →
      </button>
    </article>
  );
}


function WaitingCard({
  item,
  onOpen,
}) {
  return (
    <article className="booking-note">
      <div className="student-booking-header">
        <div>
          <strong>
            {item.title}
          </strong>

          <p>
            {item.description}
          </p>
        </div>

        <span className="role">
          WAITING
        </span>
      </div>

      {item.due_at && (
        <p className="muted">
          Operational time:{" "}
          {formatDateTime(
            item.due_at
          )}
        </p>
      )}

      <button
        className="secondary"
        type="button"
        onClick={onOpen}
      >
        View status →
      </button>
    </article>
  );
}


function UpcomingCard({
  item,
  onOpen,
}) {
  return (
    <article className="booking-note">
      <div className="student-booking-header">
        <div>
          <strong>
            {item.simulator_name}
          </strong>

          <p>
            {formatDateTime(
              item.approved_start
            )}{" "}
            →{" "}
            {formatDateTime(
              item.approved_end
            )}
          </p>
        </div>

        <span className="role">
          {formatLabel(
            item.relevance
          )}
        </span>
      </div>

      <div className="booking-details-grid">
        <Detail
          label="Student"
          value={
            item.student_name ||
            "—"
          }
        />

        <Detail
          label="Instructor"
          value={
            item.instructor_name ||
            "Not assigned"
          }
        />

        <Detail
          label="Pre-flight"
          value={
            item.preflight_review_status
              ? formatLabel(
                  item.preflight_review_status
                )
              : item.preflight_status
                ? formatLabel(
                    item.preflight_status
                  )
                : "Not submitted"
          }
        />
      </div>

      <button
        className="secondary"
        type="button"
        onClick={onOpen}
      >
        Open{" "}
        {routeLabel(
          item.route
        )}{" "}
        →
      </button>
    </article>
  );
}



function GroundUpcomingCard({ item, onOpen, active = false }) {
  return (
    <article className="student-booking-card ground-flightdeck-card">
      <div className="student-booking-header">
        <div>
          <h3>{item.class_title}</h3>
          <p>{item.programme_name || item.class_subject || "Ground School"}</p>
        </div>
        <span className={`booking-status ${active ? "requested" : "approved"}`}>
          {active ? "In Progress" : formatLabel(item.session_status)}
        </span>
      </div>
      <div className="booking-details-grid instructor-booking-details">
        <Detail label="When" value={formatDateTime(item.starts_at)} />
        <Detail label="Location" value={item.display_location || "Location TBA"} />
        <Detail label="Instructor" value={item.scheduled_instructor_name || "TBA"} />
      </div>
      <div className="booking-actions">
        <button className="primary" type="button" onClick={onOpen}>
          {active ? "Open Active Class" : "Open Ground School"}
        </button>
      </div>
    </article>
  );
}


function ProgressCard({
  item,
  onOpen,
}) {
  const percent =
    Math.min(
      100,
      Math.max(
        0,
        Number(
          item.progress_percent ??
            0
        )
      )
    );

  return (
    <article className="booking-note">
      <div className="student-booking-header">
        <div>
          <strong>
            {
              item.programme_name
            }
          </strong>

          <p>
            {item.completed_hours} /{" "}
            {item.assigned_hours} h
          </p>
        </div>

        <span className="role">
          {percent.toFixed(
            percent % 1 === 0
              ? 0
              : 1
          )}
          %
        </span>
      </div>

      <div
        style={{
          height: "8px",
          borderRadius: "999px",
          background:
            "rgba(255,255,255,.08)",
          overflow: "hidden",
          margin: "12px 0",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background:
              "currentColor",
            opacity: 0.65,
          }}
        />
      </div>

      <p className="muted">
        {item.remaining_hours} h
        remaining
      </p>

      <button
        className="secondary"
        type="button"
        onClick={onOpen}
      >
        View training records →
      </button>
    </article>
  );
}


function CounterCard({
  label,
  value,
  onClick,
}) {
  const Tag =
    onClick ? "button" : "div";

  return (
    <Tag
      className="stat-card"
      type={
        onClick
          ? "button"
          : undefined
      }
      onClick={onClick}
      style={
        onClick
          ? {
              cursor: "pointer",
            }
          : undefined
      }
    >
      <strong>
        {value}
      </strong>

      <span>
        {label}
      </span>
    </Tag>
  );
}


function EmptyState({
  text,
}) {
  return (
    <div className="admin-empty">
      {text}
    </div>
  );
}


function Detail({
  label,
  value,
}) {
  return (
    <div>
      <span className="muted">
        {label}
      </span>

      <strong
        style={{
          display: "block",
        }}
      >
        {value ?? "—"}
      </strong>
    </div>
  );
}


function Brand() {
  return (
    <div className="brand compact">
      <div className="brand-name">
        AEROPATH
      </div>

      <div className="brand-by">
        by AEROVIATION
      </div>
    </div>
  );
}


function greeting() {
  const hour =
    Number(
      new Intl.DateTimeFormat(
        "en-SG",
        {
          timeZone:
            "Asia/Singapore",
          hour: "2-digit",
          hourCycle: "h23",
        }
      ).format(
        new Date()
      )
    );

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 18) {
    return "Good afternoon";
  }

  return "Good evening";
}


function formatRoles(roles) {
  const order = [
    "ADMIN",
    "SAFETY_MANAGER",
    "INSTRUCTOR",
    "STUDENT",
  ];

  const normalized =
    [
      ...new Set(
        (roles ?? [])
          .map((role) =>
            typeof role ===
            "string"
              ? role
              : role?.role
          )
          .filter(Boolean)
      ),
    ];

  return order
    .filter((role) =>
      normalized.includes(
        role
      )
    )
    .map(formatLabel)
    .join(" · ");
}


function formatPriorityBand(
  value
) {
  switch (value) {
    case "CRITICAL":
      return "Critical";
    case "HIGH":
      return "High";
    case "NORMAL":
      return "Normal";
    case "LOW":
      return "Low";
    default:
      return "Action";
  }
}


function routeLabel(route) {
  switch (route) {
    case "MY_BOOKINGS":
      return "My Bookings";

    case "BOOKING_OPERATIONS":
      return "Booking Operations";

    case "PREFLIGHT":
      return "Pre-flight";

    case "PREFLIGHT_REVIEWS":
      return "Pre-flight Reviews";

    case "SESSIONS":
      return "Sessions";

    case "TRAINING_RECORDS":
      return "Training Records";

    case "ACCOUNTS":
      return "Accounts";

    case "SIMULATORS":
      return "Fleet & Simulators";

    case "SAFETY_CONTROL":
      return "Safety Control Tower";

    case "NOTIFICATIONS":
      return "Notifications";

    case "TIMETABLE":
      return "Timetable";

    case "GROUND_SCHOOL":
      return "Ground School";

    default:
      return formatLabel(
        route
      );
  }
}


function formatLabel(value) {
  return String(
    value ?? ""
  )
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
