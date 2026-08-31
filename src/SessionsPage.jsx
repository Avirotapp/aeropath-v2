import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import ActionSuccessModal from "./ActionSuccessModal";
import ActionConfirmModal from "./ActionConfirmModal";
import ActionErrorModal from "./ActionErrorModal";
import { indexResources, resourceBadge, resourceLabel } from "./lib/resources";
import ModuleEmblem from "./ModuleEmblem";

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export default function SessionsPage({
  role,
  initialFilter,
  onBack,
  onSignOut,
}) {
  const [startable, setStartable] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [filter, setFilter] = useState(
    initialFilter ||
      (role === "STUDENT"
        ? "IN_PROGRESS"
        : "READY")
  );
  const [forms, setForms] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [
    successModal,
    setSuccessModal,
  ] = useState(null);

  const [
    confirmAction,
    setConfirmAction,
  ] = useState(null);

  const staff =
    role === "INSTRUCTOR" ||
    role === "ADMIN" ||
    role === "SAFETY_MANAGER";

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [sessionData, programmeData, resourceData, sessionResourceData] = await Promise.all([
        rpc("operational_list_sessions_v2"),
        rpc("list_training_programmes_v2"),
        rpc("list_training_resource_catalog_v1"),
        rpc("list_visible_session_resources_v1"),
      ]);

      const sessionResourceIndex = new Map(
        (sessionResourceData ?? []).map((item) => [item.session_id, item])
      );
      const resourceIndex = indexResources(resourceData);

      setSessions(
        (sessionData ?? []).map((session) => ({
          ...session,
          ...(sessionResourceIndex.get(session.session_id) ?? {}),
        }))
      );
      setProgrammes((programmeData ?? []).filter((p) => p.active));

      if (staff) {
        const startableRows =
          (await rpc("operational_list_startable_bookings")) ?? [];

        setStartable(
          startableRows.map((booking) => ({
            ...booking,
            ...(resourceIndex.get(booking.simulator_id) ?? {}),
          }))
        );
      } else {
        setStartable([]);
      }
    } catch (e) {
      setError(e?.message || "Unable to load sessions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const counts = useMemo(
    () => ({
      READY: startable.length,
      IN_PROGRESS: sessions.filter(
        (s) => s.session_status === "IN_PROGRESS"
      ).length,
      COMPLETED: sessions.filter(
        (s) => s.session_status === "COMPLETED"
      ).length,
      CANCELLED: sessions.filter(
        (s) => s.session_status === "CANCELLED"
      ).length,
    }),
    [startable, sessions]
  );

  function formFor(session) {
    return (
      forms[session.session_id] ?? {
        activity: "",
        programmeId: "",
        durationMinutes:
          calculateMinutes(
            session.started_at,
            new Date().toISOString()
          ) || "",
        grade: "",
        assessment: "",
        studentComments: "",
        staffComments: "",
      }
    );
  }

  function updateForm(session, field, value) {
    setForms((current) => ({
      ...current,
      [session.session_id]: {
        ...formFor(session),
        [field]: value,
      },
    }));
  }

  function start(booking) {
    setConfirmAction({
      kind: "START",
      booking,
      eyebrow: "START SESSION",
      title: `Start ${booking.resource_type === "AIRCRAFT" ? "flight" : "simulator"} session?`,
      message:
        `You are starting this session now for ${booking.student_name} on ${resourceLabel(booking)}.`,
      confirmLabel: "Start session",
    });
  }


  async function executeStart(booking) {
    try {
      setConfirmAction(null);
      setBusyId(booking.booking_id);
      setError("");
      setSuccess("");

      await rpc("operational_start_session", {
        target_booking_id: booking.booking_id,
      });

      setFilter("IN_PROGRESS");
      await loadData();

      setSuccessModal({
        eyebrow: "SESSION STARTED",
        title: "Session started successfully",
        message:
          `${booking.student_name} · ${resourceLabel(booking)}`,
        nextText:
          "Complete the session and submit the graded training record when training is finished.",
        primaryLabel:
          "View In Progress",
        primaryAction:
          "IN_PROGRESS",
      });
    } catch (e) {
      setError(e?.message || "Unable to start session.");
    } finally {
      setBusyId(null);
    }
  }


  function complete(session) {
    const form = formFor(session);
    const duration = Number(form.durationMinutes);
    const grade = Number(form.grade);

    if (!form.activity.trim()) {
      setError("Training activity is required.");
      return;
    }

    if (!form.programmeId) {
      setError("Programme is required.");
      return;
    }

    if (!Number.isInteger(duration) || duration <= 0) {
      setError(
        "Duration must be a whole number greater than zero."
      );
      return;
    }

    if (
      !Number.isInteger(grade) ||
      grade < 1 ||
      grade > 5
    ) {
      setError("Grade must be an integer from 1 to 5.");
      return;
    }

    if (!form.assessment) {
      setError("Assessment is required.");
      return;
    }

    setError("");

    setConfirmAction({
      kind: "COMPLETE",
      session,
      eyebrow: "COMPLETE SESSION",
      title: "Submit training record and complete session?",
      message:
        "This finalises the operational session and creates the graded training record.",
      confirmLabel:
        "Complete session",
    });
  }


  async function executeComplete(session) {
    const form = formFor(session);
    const duration = Number(form.durationMinutes);
    const grade = Number(form.grade);

    try {
      setConfirmAction(null);
      setBusyId(session.session_id);
      setError("");
      setSuccess("");

      await rpc("complete_session_with_training_record_v2", {
        target_session_id: session.session_id,
        training_activity: form.activity.trim(),
        training_programme_id: form.programmeId,
        training_duration_minutes: duration,
        training_grade: grade,
        training_assessment_value: form.assessment,
        training_student_comments:
          form.studentComments.trim() || null,
        training_staff_comments:
          form.staffComments.trim() || null,
      });

      setFilter("COMPLETED");

      setForms((current) => {
        const next = { ...current };
        delete next[session.session_id];
        return next;
      });

      await loadData();

      setSuccessModal({
        eyebrow: "SESSION COMPLETE",
        title: "Training record submitted",
        message:
          "The session has been completed and the official training record was created.",
        nextText:
          "The Flight Deck has recalculated the user's next operational action.",
        primaryLabel:
          "Return to Flight Deck",
        primaryAction:
          "FLIGHT_DECK",
      });
    } catch (e) {
      setError(e?.message || "Unable to complete session.");
    } finally {
      setBusyId(null);
    }
  }


  function cancel(session) {
    setConfirmAction({
      kind: "CANCEL",
      session,
      eyebrow: "CANCEL SESSION",
      title: "Cancel this in-progress session?",
      message:
        "A cancellation reason is required and the action will remain in the operational history.",
      confirmLabel:
        "Cancel session",
      danger: true,
      inputLabel:
        "Cancellation reason",
      inputPlaceholder:
        "Explain why the session is being cancelled.",
      inputRequired: true,
    });
  }


  async function executeCancel(
    session,
    reason
  ) {
    try {
      setConfirmAction(null);
      setBusyId(session.session_id);
      setError("");
      setSuccess("");

      await rpc("operational_cancel_session", {
        target_session_id: session.session_id,
        reason: reason.trim(),
      });

      setFilter("CANCELLED");
      await loadData();

      setSuccessModal({
        eyebrow: "SESSION CANCELLED",
        title: "Session cancelled",
        message:
          "The session was cancelled and the reason was recorded.",
        nextText:
          "Return to the Flight Deck to see the updated operational queue.",
        primaryLabel:
          "Return to Flight Deck",
        primaryAction:
          "FLIGHT_DECK",
      });
    } catch (e) {
      setError(e?.message || "Unable to cancel session.");
    } finally {
      setBusyId(null);
    }
  }


  const visible = sessions.filter(
    (session) => session.session_status === filter
  );

  return (
    <main className="app sessions-redesign-page">
      <header className="topbar">
        <Brand />

        <div className="topbar-right">
          <span className="role">
            {formatLabel(role)}
          </span>

          <button
            className="secondary"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="bookings-page sessions-page">
        <button
          className="secondary back-button"
          onClick={onBack}
        >
          ← Back to dashboard
        </button>

        <div className="aero-page-heading sessions-page-heading">
          <div>
            <div className="eyebrow">TRAINING OPERATIONS</div>
            <h1>Sessions</h1>
            <p className="muted">
              {staff
                ? "Control the live training cycle from approved booking to immutable training record."
                : "Track your active sessions, completed training and operational status."}
            </p>
          </div>
          <div className="aero-heading-aside">
            <ModuleEmblem name="sessions" />
            <div className="sessions-control-status">
              <span className="aero-system-dot" />
              Training control
            </div>
          </div>
        </div>

        <div className="booking-filter-grid session-status-tabs">
          {staff && (
            <FilterCard
              label="Ready"
              count={counts.READY}
              active={filter === "READY"}
              onClick={() => setFilter("READY")}
            />
          )}

          {[
            "IN_PROGRESS",
            "COMPLETED",
            "CANCELLED",
          ].map((status) => (
            <FilterCard
              key={status}
              label={formatLabel(status)}
              count={counts[status]}
              active={filter === status}
              onClick={() => setFilter(status)}
            />
          ))}
        </div>

        {loading ? (
          <div className="admin-empty">
            Loading sessions...
          </div>
        ) : filter === "READY" ? (
          <ReadySessions
            startable={startable}
            busyId={busyId}
            onStart={start}
          />
        ) : (
          <div className="student-booking-list">
            {visible.length === 0 ? (
              <div className="admin-empty">
                No{" "}
                {formatLabel(filter).toLowerCase()}{" "}
                sessions.
              </div>
            ) : (
              visible.map((session) => {
                const form = formFor(session);

                return (
                  <article
                    className={`student-booking-card session-operations-card status-${session.session_status.toLowerCase()}`}
                    key={session.session_id}
                  >
                    <div className="student-booking-header">
                      <div>
                        <h3>
                          {resourceLabel(session)}
                        </h3>

                        <p>
                          Student:{" "}
                          {session.student_name}
                        </p>
                      </div>

                      <span className="role">
                        {resourceBadge(session)} · {formatLabel(session.session_status)}
                      </span>
                    </div>

                    <div className="booking-details-grid">
                      <Detail
                        label="Started by"
                        value={
                          session.started_by_name ||
                          "—"
                        }
                      />

                      <Detail
                        label="Started"
                        value={formatDateTime(
                          session.started_at
                        )}
                      />

                      <Detail
                        label="Assigned instructor"
                        value={
                          session.assigned_instructor_name ||
                          "—"
                        }
                      />

                      <Detail
                        label="Programme"
                        value={
                          session.training_programme ||
                          "—"
                        }
                      />

                      {session.training_grade != null && (
                        <Detail
                          label="Grade"
                          value={`${session.training_grade}/5`}
                        />
                      )}

                      {session.training_assessment && (
                        <Detail
                          label="Assessment"
                          value={formatLabel(
                            session.training_assessment
                          )}
                        />
                      )}
                    </div>

                    {session.training_student_comments && (
                      <CommentBlock
                        title="Comments for Student"
                        text={
                          session.training_student_comments
                        }
                      />
                    )}

                    {staff &&
                      session.training_staff_comments && (
                        <CommentBlock
                          title="Comments for Instructors/Admins"
                          text={
                            session.training_staff_comments
                          }
                          internal
                        />
                      )}

                    {staff &&
                      session.session_status ===
                        "IN_PROGRESS" &&
                      session.can_complete && (
                        <div className="instructor-approval-panel session-review-panel">
                          <label>
                            Training activity *
                          </label>

                          <input
                            value={form.activity}
                            onChange={(event) =>
                              updateForm(
                                session,
                                "activity",
                                event.target.value
                              )
                            }
                          />

                          <label>
                            Programme *
                          </label>

                          <select
                            value={form.programmeId}
                            onChange={(event) =>
                              updateForm(
                                session,
                                "programmeId",
                                event.target.value
                              )
                            }
                          >
                            <option value="">
                              Choose programme
                            </option>

                            {programmes.map(
                              (programme) => (
                                <option
                                  key={
                                    programme.programme_id
                                  }
                                  value={
                                    programme.programme_id
                                  }
                                >
                                  {programme.name}
                                </option>
                              )
                            )}
                          </select>

                          <label>
                            Duration (minutes) *
                          </label>

                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={
                              form.durationMinutes
                            }
                            onChange={(event) =>
                              updateForm(
                                session,
                                "durationMinutes",
                                event.target.value
                              )
                            }
                          />

                          <label>
                            Grade (1–5) *
                          </label>

                          <select
                            value={form.grade}
                            onChange={(event) =>
                              updateForm(
                                session,
                                "grade",
                                event.target.value
                              )
                            }
                          >
                            <option value="">
                              Choose grade
                            </option>

                            {[1, 2, 3, 4, 5].map(
                              (grade) => (
                                <option
                                  key={grade}
                                  value={grade}
                                >
                                  {grade}
                                </option>
                              )
                            )}
                          </select>

                          <label>
                            Assessment *
                          </label>

                          <select
                            value={form.assessment}
                            onChange={(event) =>
                              updateForm(
                                session,
                                "assessment",
                                event.target.value
                              )
                            }
                          >
                            <option value="">
                              Choose assessment
                            </option>

                            <option value="SATISFACTORY">
                              Satisfactory
                            </option>

                            <option value="SATISFACTORY_WITH_BRIEFING">
                              Satisfactory with
                              Briefing
                            </option>

                            <option value="UNSATISFACTORY">
                              Unsatisfactory
                            </option>
                          </select>

                          <label>
                            Comments for Student
                          </label>

                          <textarea
                            value={
                              form.studentComments
                            }
                            placeholder="Feedback the student may read in their training history."
                            onChange={(event) =>
                              updateForm(
                                session,
                                "studentComments",
                                event.target.value
                              )
                            }
                          />

                          <label>
                            Comments for
                            Instructors/Admins
                          </label>

                          <textarea
                            value={
                              form.staffComments
                            }
                            placeholder="Internal operational/training notes. Not visible to the student."
                            onChange={(event) =>
                              updateForm(
                                session,
                                "staffComments",
                                event.target.value
                              )
                            }
                          />

                          <div className="booking-actions">
                            <button
                              className="primary"
                              disabled={
                                busyId ===
                                session.session_id
                              }
                              onClick={() =>
                                complete(session)
                              }
                            >
                              Submit training record
                              & complete
                            </button>

                            {session.can_cancel && (
                              <button
                                className="secondary"
                                disabled={
                                  busyId ===
                                  session.session_id
                                }
                                onClick={() =>
                                  cancel(session)
                                }
                              >
                                Cancel session
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                  </article>
                );
              })
            )}
          </div>
        )}
      </section>

      <ActionConfirmModal
        open={Boolean(confirmAction)}
        eyebrow={
          confirmAction?.eyebrow
        }
        title={
          confirmAction?.title
        }
        message={
          confirmAction?.message
        }
        confirmLabel={
          confirmAction?.confirmLabel
        }
        danger={
          Boolean(
            confirmAction?.danger
          )
        }
        inputLabel={
          confirmAction?.inputLabel
        }
        inputPlaceholder={
          confirmAction?.inputPlaceholder
        }
        inputRequired={
          Boolean(
            confirmAction?.inputRequired
          )
        }
        onClose={() =>
          setConfirmAction(null)
        }
        onConfirm={(inputValue) => {
          if (
            confirmAction?.kind ===
            "START"
          ) {
            executeStart(
              confirmAction.booking
            );
            return;
          }

          if (
            confirmAction?.kind ===
            "COMPLETE"
          ) {
            executeComplete(
              confirmAction.session
            );
            return;
          }

          if (
            confirmAction?.kind ===
            "CANCEL"
          ) {
            executeCancel(
              confirmAction.session,
              inputValue
            );
          }
        }}
      />

      <ActionErrorModal
        open={Boolean(error)}
        title="Session action blocked"
        message={error}
        onClose={() =>
          setError("")
        }
      />

      <ActionSuccessModal
        open={Boolean(successModal)}
        eyebrow={
          successModal?.eyebrow
        }
        title={
          successModal?.title
        }
        message={
          successModal?.message
        }
        nextText={
          successModal?.nextText
        }
        primaryLabel={
          successModal?.primaryLabel
        }
        onPrimary={() => {
          const action =
            successModal?.primaryAction;

          setSuccessModal(null);

          if (
            action ===
            "IN_PROGRESS"
          ) {
            setFilter(
              "IN_PROGRESS"
            );
            return;
          }

          if (
            action ===
            "FLIGHT_DECK"
          ) {
            onBack();
          }
        }}
        onClose={() =>
          setSuccessModal(null)
        }
      />
    </main>
  );
}

function ReadySessions({
  startable,
  busyId,
  onStart,
}) {
  if (startable.length === 0) {
    return (
      <div className="admin-empty">
        No approved bookings are ready to start.
      </div>
    );
  }

  return (
    <div className="student-booking-list">
      {startable.map((booking) => (
        <article
          className="student-booking-card session-operations-card ready-session-card"
          key={booking.booking_id}
        >
          <div className="student-booking-header">
            <div>
              <h3>{resourceLabel(booking)}</h3>
              <p>
                Student: {booking.student_name}
              </p>
            </div>

            <span className="booking-status approved">
              {resourceBadge(booking)} · APPROVED
            </span>
          </div>

          <div className="booking-details-grid">
            <Detail
              label="Start"
              value={formatDateTime(
                booking.approved_start
              )}
            />

            <Detail
              label="End"
              value={formatDateTime(
                booking.approved_end
              )}
            />

            <Detail
              label="Assigned instructor"
              value={
                booking.assigned_instructor_name ||
                "Not assigned"
              }
            />
          </div>

          <button
            className="primary"
            disabled={
              busyId === booking.booking_id
            }
            onClick={() => onStart(booking)}
          >
            I am starting this session now
          </button>
        </article>
      ))}
    </div>
  );
}

function FilterCard({
  label,
  count,
  active,
  onClick,
}) {
  return (
    <button
      className={
        active ? "stat-card active" : "stat-card"
      }
      onClick={onClick}
    >
      <strong>{count}</strong>
      <span>{label}</span>
    </button>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <span className="muted">{label}</span>
      <strong style={{ display: "block" }}>
        {value}
      </strong>
    </div>
  );
}

function CommentBlock({
  title,
  text,
  internal = false,
}) {
  return (
    <div
      className="instructor-approval-panel"
      style={{ marginTop: 14 }}
    >
      <strong>{title}</strong>

      {internal && (
        <div className="muted">
          Internal — not visible to student
        </div>
      )}

      <p style={{ whiteSpace: "pre-wrap" }}>
        {text}
      </p>
    </div>
  );
}

function Brand() {
  return (
    <div>
      <strong>AeroPath</strong>
      <div
        className="muted"
        style={{ fontSize: 11 }}
      >
        by Aeroviation
      </div>
    </div>
  );
}

function formatLabel(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}

function formatDateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function calculateMinutes(start, end) {
  if (!start || !end) return 0;

  return Math.max(
    1,
    Math.round(
      (new Date(end) - new Date(start)) /
        60000
    )
  );
}
