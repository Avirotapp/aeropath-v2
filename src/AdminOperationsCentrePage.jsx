import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "./lib/supabase";
import ActionSuccessModal from "./ActionSuccessModal";
import ActionFormModal from "./ActionFormModal";
import ModuleEmblem from "./ModuleEmblem";
import AeroIcon from "./AeroIcon";


async function rpc(
  name,
  args = {}
) {
  const { data, error } =
    await supabase.rpc(
      name,
      args
    );

  if (error) {
    throw error;
  }

  return data;
}


export default function AdminOperationsCentrePage({
  profile,
  roles = [],
  onNavigate,
  onSignOut,
}) {
  const isSafetyManager =
    roles.includes(
      "SAFETY_MANAGER"
    ) &&
    !roles.includes(
      "ADMIN"
    );

  const hasStudent =
    roles.includes(
      "STUDENT"
    );

  const hasInstructor =
    roles.includes(
      "INSTRUCTOR"
    );

  const canSelfBook =
    hasStudent ||
    hasInstructor;

  const [snapshot, setSnapshot] =
    useState(null);

  const [groundSessions, setGroundSessions] =
    useState([]);

  const [groundError, setGroundError] =
    useState("");

  const [students, setStudents] =
    useState([]);

  const [simulators, setSimulators] =
    useState([]);

  const [
    instructors,
    setInstructors,
  ] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const [
    bookModal,
    setBookModal,
  ] = useState(false);

  const [
    successModal,
    setSuccessModal,
  ] = useState(null);


  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [
        centre,
        studentRows,
        simulatorRows,
        instructorRows,
        groundResult,
      ] = await Promise.all([
        rpc(
          "get_admin_operations_centre_v1"
        ),

        rpc(
          "admin_list_booking_students_v2"
        ),

        rpc(
          "list_active_training_resources_v1"
        ),

        rpc(
          "list_approved_instructors"
        ),

        rpc("list_ground_sessions_v1", {
          filter_start: null,
          filter_end: null,
          filter_class_id: null,
        })
          .then((rows) => ({ rows: rows ?? [], error: "" }))
          .catch((groundErr) => ({
            rows: [],
            error:
              groundErr?.message ||
              "Unable to load Ground Sessions.",
          })),
      ]);

      setSnapshot(
        centre ?? {}
      );

      setStudents(
        studentRows ?? []
      );

      setSimulators(
        (simulatorRows ?? []).map(
          (resource) => ({
            ...resource,
            id:
              resource.resource_id,
          })
        )
      );

      setInstructors(
        instructorRows ?? []
      );

      setGroundSessions(
        groundResult.rows
      );

      setGroundError(
        groundResult.error
      );
    } catch (err) {
      console.error(
        "Failed to load Admin Operations Centre:",
        err
      );

      setError(
        err?.message ||
          "Unable to load the Admin Operations Centre."
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    loadData();

    function refreshVisibleOperationsCentre() {
      if (document.visibilityState === "visible") {
        loadData();
      }
    }

    window.addEventListener("focus", refreshVisibleOperationsCentre);
    document.addEventListener("visibilitychange", refreshVisibleOperationsCentre);

    return () => {
      window.removeEventListener("focus", refreshVisibleOperationsCentre);
      document.removeEventListener("visibilitychange", refreshVisibleOperationsCentre);
    };
  }, []);


  const counts =
    snapshot?.counts ?? {};

  const bookingRequests =
    snapshot?.booking_requests ??
    [];

  const preflightReviews =
    snapshot?.preflight_reviews ??
    [];

  const sessionsReady =
    snapshot?.sessions_ready ??
    [];

  const sessionsInProgress =
    snapshot?.sessions_in_progress ??
    [];

  const upcomingToday =
    snapshot?.upcoming_today ??
    [];

  const activeGroundSessions =
    groundSessions.filter(
      (item) =>
        item.session_status ===
        "IN_PROGRESS"
    );

  const upcomingGroundSessions =
    groundSessions
      .filter(
        (item) =>
          item.session_status ===
          "SCHEDULED" &&
          new Date(item.starts_at) >=
            new Date()
      )
      .sort(
        (a, b) =>
          new Date(a.starts_at) -
          new Date(b.starts_at)
      );


  const bookFields =
    useMemo(
      () => [
        {
          name: "studentId",
          label: "Student",
          type: "select",
          required: true,
          defaultValue: "",
          options: [
            {
              value: "",
              label:
                "Choose student",
            },
            ...students.map(
              (student) => ({
                value:
                  student.student_id,
                label:
                  student.display_name ||
                  student.full_name ||
                  student.email,
              })
            ),
          ],
        },

        {
          name: "simulatorId",
          label: "Training resource",
          type: "select",
          required: true,
          defaultValue: "",
          options: [
            {
              value: "",
              label:
                "Choose training resource",
            },
            ...simulators.map(
              (simulator) => ({
                value:
                  simulator.id,
                label:
                  `${simulator.resource_type === "AIRCRAFT" ? "FLT" : "SIM"} · ${simulator.name} (${simulator.identifier})`,
              })
            ),
          ],
        },

        {
          name:
            "instructorId",
          label:
            "Assigned instructor",
          type: "select",
          required: false,
          defaultValue: "",
          options: [
            {
              value: "",
              label:
                "No instructor assigned",
            },
            ...instructors.map(
              (instructor) => ({
                value:
                  instructor.id,
                label:
                  instructor.full_name ||
                  instructor.email,
              })
            ),
          ],
        },

        {
          name: "start",
          label: "Start",
          type:
            "datetime-local",
          required: true,
          defaultValue: "",
        },

        {
          name: "end",
          label: "End",
          type:
            "datetime-local",
          required: true,
          defaultValue: "",
        },

        {
          name: "purpose",
          label:
            "Purpose / remarks",
          type: "textarea",
          required: false,
          defaultValue: "",
        },

        {
          name: "statusMode",
          label:
            "Create booking as",
          type: "select",
          required: true,
          defaultValue:
            "APPROVED",
          options: [
            {
              value:
                "APPROVED",
              label:
                "Approved — place directly on operational schedule",
            },
            {
              value:
                "REQUESTED",
              label:
                "Requested — send to booking review queue",
            },
          ],
        },
      ],
      [
        students,
        simulators,
        instructors,
      ]
    );


  const allModules = [
    {
      group: "Operations",
      items: [
        {
          title:
            "Booking Operations",
          description:
            "Approve, reject, cancel, modify, override, soft-delete and restore bookings.",
          route:
            "BOOKING_OPERATIONS",
        },
        {
          title: "Timetable",
          description:
            "View and filter the complete simulator and aircraft schedule.",
          route:
            "TIMETABLE",
        },
        {
          title: "Sessions",
          description:
            "Start and manage approved simulator or flight sessions, including multiple live Admin-equivalent sessions.",
          route:
            "SESSIONS",
        },
        {
          title:
            "Training History",
          description:
            "View and administer student training records, grades, assessments, comments and correction history.",
          route:
            "TRAINING_RECORDS",
        },
        {
          title:
            "Pre-flight Reviews",
          description:
            "Review submitted student pre-flight preparation. Pre-flight does not gate session start.",
          route:
            "PREFLIGHT_REVIEWS",
        },
        {
          title: "Ground School",
          description:
            "Create and manage ground classes, custom tests, assignments, attendance and grading.",
          route:
            "GROUND_SCHOOL",
        },
        {
          title: "Files",
          description:
            "Access session files and publish authorised operational or briefing documents.",
          route:
            "FILES",
        },
      ],
    },

    {
      group:
        "Administration",
      items: [
        {
          title: "Accounts",
          description:
            "Approve accounts, manage roles, profiles, programmes, hours and account lifecycle.",
          route:
            "ACCOUNTS",
        },
        {
          title: "Fleet & Simulators",
          description:
            "Create and manage aircraft and simulator resources.",
          route:
            "FLEET",
        },
        {
          title:
            "Audit Trail",
          description:
            "Review privileged, operational and safety audit activity.",
          route:
            "AUDIT_TRAIL",
        },
        {
          title:
            "Notifications",
          description:
            "Review AeroPath operational notifications.",
          route:
            "NOTIFICATIONS",
        },
        {
          title:
            "My Profile",
          description:
            "View and update your own permitted profile information.",
          route:
            "MY_PROFILE",
        },
      ],
    },

    {
      group: "Safety",
      items: [
        {
          title:
            "Safety Control Tower (ESMS)",
          description:
            "Submit, assess, investigate and manage safety reports and corrective actions.",
          route:
            "SAFETY_CONTROL",
        },
      ],
    },

    ...(canSelfBook
      ? [
          {
            group:
              "Personal Operations",
            items: [
              {
                title:
                  "My Bookings",
                description:
                  "Request and manage your own simulator or aircraft bookings under your Student/Instructor capability.",
                route:
                  "MY_BOOKINGS",
              },
              ...(hasStudent
                ? [
                    {
                      title:
                        "My Pre-flight",
                      description:
                        "Complete and submit your own booking-specific pre-flight preparation.",
                      route:
                        "PREFLIGHT",
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
  ];

  const moduleIllustrations = {
    BOOKING_OPERATIONS: "bookings",
    TIMETABLE: "departures",
    SESSIONS: "sessions",
    TRAINING_RECORDS: "history",
    PREFLIGHT_REVIEWS: "preflight",
    GROUND_SCHOOL: "ground",
    FILES: "files",
    ACCOUNTS: "accounts",
    FLEET: "fleet",
    AUDIT_TRAIL: "audit",
    NOTIFICATIONS: "notifications",
    MY_PROFILE: "profile",
    SAFETY_CONTROL: "safety",
    MY_BOOKINGS: "bookings",
    PREFLIGHT: "preflight",
  };


  async function createBooking(
    values
  ) {
    const start =
      new Date(
        values.start
      );

    const end =
      new Date(
        values.end
      );

    if (
      Number.isNaN(
        start.getTime()
      ) ||
      Number.isNaN(
        end.getTime()
      )
    ) {
      setError(
        "Enter valid booking times."
      );
      return;
    }

    if (end <= start) {
      setError(
        "Booking end time must be after start time."
      );
      return;
    }

    try {
      setBookModal(false);
      setBusy(true);
      setError("");

      await rpc(
        "admin_create_student_booking_v2",
        {
          target_student_id:
            values.studentId,
          target_simulator_id:
            values.simulatorId,
          target_assigned_instructor_id:
            values.instructorId ||
            null,
          booking_start:
            start.toISOString(),
          booking_end:
            end.toISOString(),
          booking_purpose:
            values.purpose?.trim() ||
            null,
          create_as_approved:
            values.statusMode ===
            "APPROVED",
        }
      );

      await loadData();

      setSuccessModal({
        eyebrow:
          values.statusMode ===
          "APPROVED"
            ? "BOOKING CREATED & APPROVED"
            : "BOOKING REQUEST CREATED",
        title:
          values.statusMode ===
          "APPROVED"
            ? "Student booking placed on the schedule"
            : "Student booking added to the review queue",
        message:
          "The booking was created successfully for the selected student.",
        nextText:
          values.statusMode ===
          "APPROVED"
            ? "The booking is now part of the operational timetable. Pre-flight remains a separate preparation workflow and does not block session start."
            : "The booking now appears under Booking Requests Awaiting Approval.",
      });
    } catch (err) {
      console.error(
        "Admin booking creation failed:",
        err
      );

      setError(
        err?.message ||
          "Unable to create booking."
      );
    } finally {
      setBusy(false);
    }
  }


  return (
    <main className="app operations-centre-page">
      <header className="topbar">
        <Brand />

        <div className="topbar-right">
          <span className="role">
            {isSafetyManager
              ? "Safety Manager"
              : "Admin"}
          </span>

          <button
            className="secondary"
            type="button"
            onClick={loadData}
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
          <div className="eyebrow">OPERATIONS CENTRE</div>
          <h1>
            {isSafetyManager ? "Safety Manager Operations Centre" : "Admin Operations Centre"}
          </h1>
          <p className="muted">Live booking, training, account and safety workload across AeroPath.</p>
        </div>
        <ModuleEmblem bare name="operations" />
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
          Loading Operations Centre...
        </section>
      ) : (
        <>
          <section
            style={{
              maxWidth:
                "1180px",
              margin:
                "0 auto 24px",
              padding:
                "0 20px",
            }}
          >
            <div className="admin-stats">
              <CounterCard
                label="Booking Requests"
                value={
                  counts.booking_requests_waiting_approval ??
                  0
                }
                onClick={() =>
                  onNavigate(
                    "BOOKING_OPERATIONS"
                  )
                }
              />

              <CounterCard
                label="Pre-flight Reviews"
                value={
                  counts.preflights_waiting_review ??
                  0
                }
                onClick={() =>
                  onNavigate(
                    "PREFLIGHT_REVIEWS"
                  )
                }
              />

              <CounterCard
                label="Sessions Ready"
                value={
                  counts.sessions_ready ??
                  0
                }
                onClick={() =>
                  onNavigate(
                    "SESSIONS",
                    {
                      initialFilter:
                        "READY",
                    }
                  )
                }
              />

              <CounterCard
                label="In Progress"
                value={
                  counts.sessions_in_progress ??
                  0
                }
                onClick={() =>
                  onNavigate(
                    "SESSIONS",
                    {
                      initialFilter:
                        "IN_PROGRESS",
                    }
                  )
                }
              />

              <CounterCard
                label="Ground In Progress"
                value={activeGroundSessions.length}
                onClick={() =>
                  onNavigate(
                    "GROUND_SCHOOL",
                    activeGroundSessions[0]
                      ? { groundSessionId: activeGroundSessions[0].ground_session_id }
                      : null
                  )
                }
              />

              <CounterCard
                label="Upcoming Ground"
                value={upcomingGroundSessions.length}
                onClick={() =>
                  onNavigate("GROUND_SCHOOL")
                }
              />

              <CounterCard
                label="Pending Accounts"
                value={
                  counts.pending_accounts ??
                  0
                }
                onClick={() =>
                  onNavigate(
                    "ACCOUNTS"
                  )
                }
              />

              <CounterCard
                label="Open Safety"
                value={
                  counts.open_safety_reports ??
                  0
                }
                onClick={() =>
                  onNavigate(
                    "SAFETY_CONTROL"
                  )
                }
              />

              <CounterCard
                label="Approved Today"
                value={
                  counts.approved_bookings_today ??
                  0
                }
                onClick={() =>
                  onNavigate(
                    "TIMETABLE"
                  )
                }
              />

              <CounterCard
                label="Unread"
                value={
                  counts.unread_notifications ??
                  0
                }
                onClick={() =>
                  onNavigate(
                    "NOTIFICATIONS"
                  )
                }
              />
            </div>
          </section>


          <section
            style={{
              maxWidth:
                "1180px",
              margin:
                "0 auto 24px",
              padding:
                "0 20px",
            }}
          >
            <article className="student-booking-card">
              <div className="eyebrow">
                QUICK ACTIONS
              </div>

              <h2>
                Operations controls
              </h2>

              <div className="operations-quick-actions">
                <button
                  className="operations-quick-action primary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setBookModal(
                      true
                    )
                  }
                >
                  <AeroIcon name="bookings" size={22} />
                  Book for Student
                </button>

                <button
                  className="operations-quick-action"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "BOOKING_OPERATIONS"
                    )
                  }
                >
                  <AeroIcon name="bookings" size={21} />
                  Booking Operations
                </button>

                <button
                  className="operations-quick-action"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "TIMETABLE"
                    )
                  }
                >
                  <AeroIcon name="timetable" size={21} />
                  Timetable
                </button>

                <button
                  className="operations-quick-action"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "SESSIONS"
                    )
                  }
                >
                  <AeroIcon name="sessions" size={21} />
                  Sessions
                </button>

                <button
                  className="operations-quick-action"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "TRAINING_RECORDS"
                    )
                  }
                >
                  <AeroIcon name="history" size={21} />
                  Training History
                </button>

                <button
                  className="operations-quick-action"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "PREFLIGHT_REVIEWS"
                    )
                  }
                >
                  <AeroIcon name="preflight" size={21} />
                  Pre-flight Reviews
                </button>

                <button
                  className="operations-quick-action"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "GROUND_SCHOOL"
                    )
                  }
                >
                  <AeroIcon name="ground" size={21} />
                  Ground School
                </button>

                <button
                  className="operations-quick-action"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "FILES"
                    )
                  }
                >
                  <AeroIcon name="files" size={21} />
                  Files
                </button>

                <button
                  className="operations-quick-action"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "ACCOUNTS"
                    )
                  }
                >
                  <AeroIcon name="accounts" size={21} />
                  Accounts
                </button>

                <button
                  className="operations-quick-action"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "FLEET"
                    )
                  }
                >
                  <AeroIcon name="fleet" size={21} />
                  Fleet &amp; Simulators
                </button>

                <button
                  className="operations-quick-action"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "SAFETY_CONTROL"
                    )
                  }
                >
                  <AeroIcon name="safety" size={21} />
                  Safety Control Tower
                </button>

                <button
                  className="operations-quick-action"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "AUDIT_TRAIL"
                    )
                  }
                >
                  <AeroIcon name="audit" size={21} />
                  Audit Trail
                </button>

                <button
                  className="operations-quick-action"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "NOTIFICATIONS"
                    )
                  }
                >
                  <AeroIcon name="bell" size={21} />
                  Notifications
                </button>

                <button
                  className="operations-quick-action"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      "MY_PROFILE"
                    )
                  }
                >
                  <AeroIcon name="profile" size={21} />
                  My Profile
                </button>
              </div>
            </article>
          </section>


          <div className="operations-queue-grid">
          <QueueSection
            eyebrow="GROUND SCHOOL · LIVE"
            title="Ground Sessions in progress"
            count={activeGroundSessions.length}
            emptyText="No Ground Session is currently in progress."
          >
            {activeGroundSessions.map((item) => (
              <QueueCard
                key={item.ground_session_id}
                title={item.class_title}
                subtitle={item.display_location || "Location TBA"}
                meta={`${formatDateTime(item.starts_at)} → ${formatDateTime(item.ends_at)}${item.conducted_by_name ? ` · by ${item.conducted_by_name}` : ""}`}
                buttonLabel="Open Ground Session"
                onOpen={() =>
                  onNavigate("GROUND_SCHOOL", {
                    groundSessionId: item.ground_session_id,
                  })
                }
              />
            ))}
          </QueueSection>


          <QueueSection
            eyebrow="GROUND SCHOOL · UPCOMING"
            title="Next Ground Sessions"
            count={upcomingGroundSessions.slice(0, 8).length}
            emptyText="No upcoming Ground Session is scheduled."
          >
            {upcomingGroundSessions.slice(0, 8).map((item) => (
              <QueueCard
                key={item.ground_session_id}
                title={item.class_title}
                subtitle={item.display_location || "Location TBA"}
                meta={`${formatDateTime(item.starts_at)} → ${formatDateTime(item.ends_at)}${item.scheduled_instructor_name ? ` · ${item.scheduled_instructor_name}` : ""}`}
                buttonLabel="Open Ground Session"
                onOpen={() =>
                  onNavigate("GROUND_SCHOOL", {
                    groundSessionId: item.ground_session_id,
                  })
                }
              />
            ))}
          </QueueSection>


          <QueueSection
            eyebrow="BOOKING REQUESTS AWAITING APPROVAL"
            title="Student booking requests"
            count={
              bookingRequests.length
            }
            emptyText="No booking requests are awaiting approval."
          >
            {bookingRequests.map(
              (item) => (
                <QueueCard
                  key={
                    item.booking_id
                  }
                  title={
                    item.student_name
                  }
                  subtitle={
                    item.simulator_name
                  }
                  meta={`${formatDateTime(
                    item.requested_start
                  )} → ${formatDateTime(
                    item.requested_end
                  )}`}
                  buttonLabel="Review Booking"
                  onOpen={() =>
                    onNavigate(
                      "BOOKING_OPERATIONS"
                    )
                  }
                />
              )
            )}
          </QueueSection>


          <QueueSection
            eyebrow="PREFLIGHTS PENDING REVIEW"
            title="Submitted pre-flight preparation"
            count={
              preflightReviews.length
            }
            emptyText="No submitted pre-flight is awaiting review."
          >
            {preflightReviews.map(
              (item) => (
                <QueueCard
                  key={
                    item.submission_id
                  }
                  title={
                    item.student_name
                  }
                  subtitle={
                    item.simulator_name
                  }
                  meta={
                    item.approved_start
                      ? formatDateTime(
                          item.approved_start
                        )
                      : `Submitted ${formatDateTime(
                          item.submitted_at
                        )}`
                  }
                  buttonLabel="Review Pre-flight"
                  onOpen={() =>
                    onNavigate(
                      "PREFLIGHT_REVIEWS"
                    )
                  }
                />
              )
            )}
          </QueueSection>


          <QueueSection
            eyebrow="SESSIONS READY"
            title="Approved bookings available to start"
            count={
              sessionsReady.length
            }
            emptyText="No approved booking is currently waiting for a session."
          >
            {sessionsReady.map(
              (item) => (
                <QueueCard
                  key={
                    item.booking_id
                  }
                  title={
                    item.student_name
                  }
                  subtitle={
                    item.simulator_name
                  }
                  meta={`${formatDateTime(
                    item.approved_start
                  )} → ${formatDateTime(
                    item.approved_end
                  )}`}
                  note="Pre-flight does not gate session start."
                  buttonLabel="Open Ready Sessions"
                  onOpen={() =>
                    onNavigate(
                      "SESSIONS",
                      {
                        initialFilter:
                          "READY",
                      }
                    )
                  }
                />
              )
            )}
          </QueueSection>


          <QueueSection
            eyebrow="LIVE OPERATIONS"
            title="Sessions in progress"
            count={
              sessionsInProgress.length
            }
            emptyText="No training session is currently in progress."
          >
            {sessionsInProgress.map(
              (item) => (
                <QueueCard
                  key={
                    item.session_id
                  }
                  title={
                    item.student_name
                  }
                  subtitle={
                    item.simulator_name
                  }
                  meta={`Started ${formatDateTime(
                    item.started_at
                  )}${
                    item.started_by_name
                      ? ` · by ${item.started_by_name}`
                      : ""
                  }`}
                  buttonLabel="Manage Session"
                  onOpen={() =>
                    onNavigate(
                      "SESSIONS",
                      {
                        initialFilter:
                          "IN_PROGRESS",
                      }
                    )
                  }
                />
              )
            )}
          </QueueSection>


          <QueueSection
            eyebrow="TODAY"
            title="Approved operational schedule"
            count={
              upcomingToday.length
            }
            emptyText="No approved training bookings remain on today's schedule."
          >
            {upcomingToday.map(
              (item) => (
                <QueueCard
                  key={
                    item.booking_id
                  }
                  title={
                    item.student_name
                  }
                  subtitle={
                    item.simulator_name
                  }
                  meta={`${formatDateTime(
                    item.approved_start
                  )} → ${formatDateTime(
                    item.approved_end
                  )}${
                    item.instructor_name
                      ? ` · ${item.instructor_name}`
                      : ""
                  }`}
                  buttonLabel="Open Timetable"
                  onOpen={() =>
                    onNavigate(
                      "TIMETABLE"
                    )
                  }
                />
              )
            )}
          </QueueSection>
          </div>


          <section
            style={{
              maxWidth:
                "1180px",
              margin:
                "0 auto 36px",
              padding:
                "0 20px",
            }}
          >
            <p
              className="muted"
              style={{
                fontSize:
                  "12px",
              }}
            >
              Operations snapshot generated{" "}
              {formatDateTime(
                snapshot?.generated_at
              )}
              .
            </p>
          </section>
        </>
      )}


      <ActionFormModal
        open={bookModal}
        eyebrow="BOOK FOR STUDENT"
        title="Create student training booking"
        message="Admin-equivalent users may create a simulator or aircraft booking directly as APPROVED or place it into the REQUESTED review queue. Resource and instructor conflict protection remains active."
        fields={bookFields}
        confirmLabel="Create booking"
        onConfirm={
          createBooking
        }
        onClose={() =>
          setBookModal(false)
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
        primaryLabel="Continue"
        secondaryLabel="Close"
        onPrimary={() =>
          setSuccessModal(null)
        }
        onClose={() =>
          setSuccessModal(null)
        }
      />
    </main>
  );
}


function QueueSection({
  eyebrow,
  title,
  count,
  emptyText,
  children,
}) {
  const hasItems =
    count > 0;

  return (
    <section className={`operations-queue-section ${hasItems ? "has-items" : "is-empty"}`}>
      <article className="student-booking-card">
        <div className="student-booking-header">
          <div>
            <div className="eyebrow">
              {eyebrow}
            </div>

            <h2>
              {title}
            </h2>
          </div>

          <span className="booking-count">
            {count}
          </span>
        </div>

        {hasItems ? (
          <div className="student-booking-list">
            {children}
          </div>
        ) : (
          <div className="admin-empty">
            {emptyText}
          </div>
        )}
      </article>
    </section>
  );
}


function QueueCard({
  title,
  subtitle,
  meta,
  note,
  buttonLabel,
  onOpen,
}) {
  return (
    <article className="booking-note">
      <div className="student-booking-header">
        <div>
          <strong>
            {title}
          </strong>

          <p>
            {subtitle}
          </p>
        </div>
      </div>

      <p className="muted">
        {meta}
      </p>

      {note && (
        <p
          className="muted"
          style={{
            fontStyle:
              "italic",
          }}
        >
          {note}
        </p>
      )}

      <button
        className="secondary"
        type="button"
        onClick={onOpen}
      >
        {buttonLabel} →
      </button>
    </article>
  );
}


function CounterCard({
  label,
  value,
  onClick,
}) {
  const hasWork = Number(value) > 0;

  return (
    <button
      className={`stat-card ${hasWork ? "has-work" : "quiet"}`}
      type="button"
      onClick={onClick}
      style={{
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <strong>
        {value}
      </strong>

      <span>
        {label}
      </span>
    </button>
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


function formatDateTime(
  value
) {
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
