import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import ActionSuccessModal from "./ActionSuccessModal";
import ActionConfirmModal from "./ActionConfirmModal";
import { resourceBadge, resourceLabel } from "./lib/resources";
import ModuleEmblem from "./ModuleEmblem";

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export default function TrainingRecordsPage({
  role,
  onBack,
  onSignOut,
}) {
  const isStudent = role === "STUDENT";
  const staff = !isStudent;

  const [records, setRecords] = useState([]);
  const [modeFilter, setModeFilter] = useState("OVERVIEW");
  const [students, setStudents] = useState([]);
  const [programmes, setProgrammes] =
    useState([]);
  const [
    selectedStudentId,
    setSelectedStudentId,
  ] = useState(isStudent ? null : "ALL");
  const [progress, setProgress] =
    useState([]);
  const [correcting, setCorrecting] =
    useState(null);
  const [correction, setCorrection] =
    useState({});
  const [history, setHistory] =
    useState(null);
  const [versions, setVersions] =
    useState([]);
  const [loading, setLoading] =
    useState(true);
  const [busy, setBusy] =
    useState(false);
  const [error, setError] =
    useState("");
  const [success, setSuccess] =
    useState("");
  const [successModal, setSuccessModal] =
    useState(null);
  const [confirmCorrection, setConfirmCorrection] =
    useState(null);

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [recordData, programmeData, sessionResources] =
        await Promise.all([
          rpc("list_training_records_v2"),
          rpc("list_training_programmes_v2"),
          rpc("list_visible_session_resources_v1"),
        ]);

      const sessionResourceIndex = new Map(
        (sessionResources ?? []).map((item) => [item.session_id, item])
      );

      setRecords(
        (recordData ?? []).map((record) => ({
          ...record,
          ...(sessionResourceIndex.get(record.session_id) ?? {}),
          training_mode:
            sessionResourceIndex.get(record.session_id)?.training_mode ||
            record.training_mode ||
            "SIMULATOR",
        }))
      );
      setProgrammes(
        (programmeData ?? []).filter(
          (programme) => programme.active
        )
      );

      if (!isStudent) {
        setStudents(
          (await rpc(
            "operational_list_student_profiles_v2"
          )) ?? []
        );
      } else {
        setProgress(
          (await rpc(
            "list_student_programme_progress_v2",
            {
              target_student_id: null,
            }
          )) ?? []
        );
      }
    } catch (e) {
      setError(
        e?.message ||
          "Unable to load training records."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (
      !isStudent &&
      selectedStudentId &&
      selectedStudentId !== "ALL"
    ) {
      rpc(
        "list_student_programme_progress_v2",
        {
          target_student_id:
            selectedStudentId,
        }
      )
        .then((data) =>
          setProgress(data ?? [])
        )
        .catch((e) =>
          setError(
            e?.message ||
              "Unable to load programme progress."
          )
        );
    } else if (!isStudent) {
      setProgress([]);
    }
  }, [selectedStudentId]);

  const visible = useMemo(() => {
    let studentRecords;

    if (
      isStudent ||
      selectedStudentId === "ALL"
    ) {
      studentRecords = records;
    } else {
      studentRecords = records.filter(
        (record) =>
          record.student_id ===
          selectedStudentId
      );
    }

    if (modeFilter === "OVERVIEW") {
      return studentRecords;
    }

    return studentRecords.filter(
      (record) =>
        record.training_mode === modeFilter
    );
  }, [
    records,
    selectedStudentId,
    isStudent,
    modeFilter,
  ]);

  function openCorrection(record) {
    setError("");
    setSuccess("");
    setCorrecting(record);

    setCorrection({
      activity: record.activity ?? "",
      programmeId:
        record.programme_id ?? "",
      durationMinutes: String(
        record.duration_minutes ?? ""
      ),
      grade:
        record.grade == null
          ? ""
          : String(record.grade),
      assessment:
        record.assessment ?? "",
      studentComments:
        record.student_comments ?? "",
      staffComments:
        record.staff_comments ?? "",
      reason: "",
    });
  }

  function submitCorrection(event) {
    event.preventDefault();

    const duration = Number(
      correction.durationMinutes
    );

    const grade = Number(
      correction.grade
    );

    if (
      !correction.activity?.trim()
    ) {
      setError(
        "Activity is required."
      );
      return;
    }

    if (
      !correction.programmeId
    ) {
      setError(
        "Programme is required."
      );
      return;
    }

    if (
      !Number.isInteger(
        duration
      ) ||
      duration <= 0
    ) {
      setError(
        "Duration must be a whole number greater than zero."
      );
      return;
    }

    if (
      !Number.isInteger(
        grade
      ) ||
      grade < 1 ||
      grade > 5
    ) {
      setError(
        "Grade must be 1–5."
      );
      return;
    }

    if (
      !correction.assessment
    ) {
      setError(
        "Assessment is required."
      );
      return;
    }

    if (
      !correction.reason?.trim()
    ) {
      setError(
        "Correction reason is required."
      );
      return;
    }

    setError("");

    setConfirmCorrection({
      duration,
      grade,
    });
  }


  async function executeCorrection() {
    if (
      !correcting ||
      !confirmCorrection
    ) {
      return;
    }

    const currentRecord =
      correcting;

    const duration =
      confirmCorrection.duration;

    const grade =
      confirmCorrection.grade;

    setConfirmCorrection(null);

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      const version =
        await rpc(
          "operational_correct_training_record_v2",
          {
            target_training_record_id:
              currentRecord.training_record_id,
            corrected_activity:
              correction.activity.trim(),
            corrected_programme_id:
              correction.programmeId,
            corrected_duration_minutes:
              duration,
            corrected_grade:
              grade,
            corrected_assessment:
              correction.assessment,
            corrected_student_comments:
              correction.studentComments?.trim() ||
              null,
            corrected_staff_comments:
              correction.staffComments?.trim() ||
              null,
            correction_reason:
              correction.reason.trim(),
          }
        );

      setCorrecting(null);

      await loadData();

      setSuccessModal({
        eyebrow:
          "TRAINING RECORD CORRECTED",
        title:
          `Version ${version} is now current`,
        message:
          "A new immutable correction version was created. The original completed record remains preserved in history.",
        nextText:
          "The corrected version is now the authoritative current training record.",
      });

      if (
        history?.training_record_id ===
        currentRecord.training_record_id
      ) {
        await openHistory(
          records.find(
            (record) =>
              record.training_record_id ===
              currentRecord.training_record_id
          ) ?? currentRecord
        );
      }
    } catch (e) {
      setError(
        e?.message
          ? `Correction failed: ${e.message}`
          : "Correction failed: Unable to correct training record."
      );
    } finally {
      setBusy(false);
    }
  }


  async function openHistory(record) {
    try {
      setError("");
      setHistory(record);
      setVersions([]);

      const data = await rpc(
        "list_training_record_versions_v2",
        {
          target_training_record_id:
            record.training_record_id,
        }
      );

      setVersions(data ?? []);
    } catch (e) {
      setError(
        e?.message ||
          "Unable to load version history."
      );
    }
  }

  return (
    <main className="app training-history-redesign-page">
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

      <section className="bookings-page training-history-page">
        <button
          className="secondary back-button"
          onClick={onBack}
        >
          ← Back to dashboard
        </button>

        <div className="student-booking-header aero-page-heading training-history-heading">
          <div>
            <div className="eyebrow">TRAINING HISTORY</div>
            <h1>Training History</h1>

            <p className="muted">
              {isStudent
                ? "View your simulator and flight history, programme progress, grades and feedback."
                : "Review programme-aware simulator and flight history, grades, feedback and internal staff comments."}
            </p>
          </div>

          <div className="aero-heading-aside">
            <ModuleEmblem name="history" />
            <button
              className="secondary training-history-print"
              onClick={() => window.print()}
            >
              Print Training History
            </button>
          </div>
        </div>

        {error && (
          <div className="login-error booking-message">
            {error}
          </div>
        )}

        <div className="training-history-summary" aria-label="Training history summary">
          <div>
            <span>Records</span>
            <strong>{visible.length}</strong>
          </div>
          <div>
            <span>Training time</span>
            <strong>{formatHours(visible.reduce((total, record) => total + Number(record.duration_minutes || 0), 0))}</strong>
          </div>
          <div>
            <span>Simulator</span>
            <strong>{visible.filter((record) => record.training_mode === "SIMULATOR").length}</strong>
          </div>
          <div>
            <span>Flight</span>
            <strong>{visible.filter((record) => record.training_mode === "FLIGHT").length}</strong>
          </div>
        </div>

        <div className="booking-filter-grid training-mode-tabs training-history-tabs">
          {[
            ["OVERVIEW", "Overview"],
            ["SIMULATOR", "Simulator"],
            ["FLIGHT", "Flight"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={modeFilter === value ? "stat-card active" : "stat-card"}
              onClick={() => setModeFilter(value)}
            >
              <strong>
                {value === "OVERVIEW"
                  ? records.length
                  : records.filter((record) => record.training_mode === value).length}
              </strong>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {modeFilter === "OVERVIEW" && (
          <p className="muted training-history-note">
            Knowledge-test attempts remain under Ground School → Tests &amp; Quizzes because they are assessment attempts, not operational training sessions.
          </p>
        )}
{!isStudent && (
          <div className="instructor-approval-panel training-student-filter">
            <label>Student</label>

            <select
              value={selectedStudentId}
              onChange={(event) =>
                setSelectedStudentId(
                  event.target.value
                )
              }
            >
              <option value="ALL">
                All students
              </option>

              {students.map((student) => (
                <option
                  key={student.student_id}
                  value={student.student_id}
                >
                  {student.display_name ||
                    student.full_name ||
                    student.email}
                </option>
              ))}
            </select>
          </div>
        )}

        {(isStudent ||
          selectedStudentId !== "ALL") && (
          <section className="student-booking-card programme-progress-panel">
            <h2>Programme progress</h2>

            {progress.length === 0 ? (
              <p className="muted">
                No programme assignments.
              </p>
            ) : (
              <div className="booking-details-grid">
                {progress
                  .filter(
                    (item) =>
                      item.assignment_active
                  )
                  .map((item) => (
                    <div
                      key={item.assignment_id}
                    >
                      <strong>
                        {item.programme_name}
                      </strong>

                      <p>
                        {item.completed_hours} /{" "}
                        {item.assigned_hours} h
                      </p>

                      <p className="muted">
                        {item.remaining_hours} h
                        remaining ·{" "}
                        {item.progress_percent}%
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}

        {loading ? (
          <div className="admin-empty">
            Loading training records...
          </div>
        ) : (
          <div className="student-booking-list">
            {visible.length === 0 ? (
              <div className="admin-empty">
                No training records.
              </div>
            ) : (
              visible.map((record) => (
                <article
                  className={`student-booking-card training-record-card mode-${String(record.training_mode || "SIMULATOR").toLowerCase()}`}
                  key={
                    record.training_record_id
                  }
                >
                  <div className="student-booking-header">
                    <div>
                      <h3>
                        {record.activity}
                      </h3>

                      <p>
                        {record.programme ||
                          "No programme"}
                      </p>

                      <span className="status">
                        {resourceBadge(record)} · {record.training_mode}
                      </span>
                    </div>

                    <span className="role">
                      {record.grade == null
                        ? "HISTORICAL"
                        : `GRADE ${record.grade}/5`}
                    </span>
                  </div>

                  <div className="booking-details-grid">
                    {!isStudent && (
                      <Detail
                        label="Student"
                        value={
                          record.student_name
                        }
                      />
                    )}

                    <Detail
                      label="Instructor"
                      value={
                        record.instructor_name
                      }
                    />

                    <Detail
                      label={record.training_mode === "FLIGHT" ? "Aircraft" : "Simulator"}
                      value={resourceLabel(record)}
                    />

                    <Detail
                      label="Programme"
                      value={
                        record.programme || "—"
                      }
                    />

                    <Detail
                      label="Duration"
                      value={`${record.duration_minutes} min`}
                    />

                    <Detail
                      label="Grade"
                      value={
                        record.grade == null
                          ? "Historical — not recorded"
                          : `${record.grade}/5`
                      }
                    />

                    <Detail
                      label="Assessment"
                      value={
                        record.assessment
                          ? formatLabel(
                              record.assessment
                            )
                          : "Historical — not recorded"
                      }
                    />

                    <Detail
                      label="Completed"
                      value={formatDateTime(
                        record.completed_at
                      )}
                    />

                    <Detail
                      label="Current version"
                      value={`v${record.current_version}`}
                    />
                  </div>

                  {record.student_comments && (
                    <CommentBlock
                      title="Comments for Student"
                      text={
                        record.student_comments
                      }
                    />
                  )}

                  {staff &&
                    record.staff_comments && (
                      <CommentBlock
                        title="Staff-only Comments"
                        text={
                          record.staff_comments
                        }
                        internal
                      />
                    )}

                  {record.latest_correction_reason && (
                    <p className="muted">
                      Latest correction:{" "}
                      {
                        record.latest_correction_reason
                      }
                    </p>
                  )}

                  <div className="booking-actions">
                    <button
                      className="secondary"
                      onClick={() =>
                        openHistory(record)
                      }
                    >
                      Version history
                    </button>

                    {!isStudent &&
                      record.can_correct && (
                        <button
                          className="primary"
                          onClick={() =>
                            openCorrection(record)
                          }
                        >
                          Create correction
                        </button>
                      )}
                  </div>
                </article>
              ))
            )}
          </div>
        )}

        {correcting && (
          <div
            role="presentation"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget &&
                !busy
              ) {
                setCorrecting(null);
              }
            }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9000,
              display: "grid",
              placeItems: "center",
              padding: "24px",
              background:
                "rgba(3, 10, 24, 0.62)",
              backdropFilter:
                "blur(7px)",
              WebkitBackdropFilter:
                "blur(7px)",
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="training-correction-title"
              style={{
                width:
                  "min(720px, 100%)",
                maxHeight:
                  "min(850px, calc(100vh - 48px))",
                overflowY: "auto",
                borderRadius: "22px",
                border:
                  "1px solid rgba(255,255,255,.16)",
                background:
                  "rgba(10, 22, 42, .98)",
                boxShadow:
                  "0 28px 90px rgba(0,0,0,.48)",
                padding: "28px",
              }}
            >
              <div className="eyebrow">
                IMMUTABLE TRAINING RECORD
              </div>

              <div className="student-booking-header">
                <div>
                  <h2
                    id="training-correction-title"
                    style={{
                      marginBottom: "6px",
                    }}
                  >
                    Create correction
                  </h2>

                  <p
                    className="muted"
                    style={{
                      marginTop: 0,
                    }}
                  >
                    {correcting.student_name ||
                      "Student"}{" "}
                    ·{" "}
                    {correcting.activity}
                  </p>
                </div>

                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    setCorrecting(null)
                  }
                >
                  Close
                </button>
              </div>

              <p className="muted">
                This does not overwrite the completed record.
                AeroPath will create a new immutable version and
                preserve the previous version in history.
              </p>

              <form
                onSubmit={submitCorrection}
                style={{
                  display: "grid",
                  gap: "12px",
                  marginTop: "18px",
                }}
              >
                <label>
                  Activity *
                </label>

                <input
                  value={
                    correction.activity
                  }
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      activity:
                        event.target.value,
                    })
                  }
                />

                <label>
                  Programme *
                </label>

                <select
                  value={
                    correction.programmeId
                  }
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      programmeId:
                        event.target.value,
                    })
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
                        {
                          programme.name
                        }
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
                    correction.durationMinutes
                  }
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      durationMinutes:
                        event.target.value,
                    })
                  }
                />

                <label>
                  Grade *
                </label>

                <select
                  value={
                    correction.grade
                  }
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      grade:
                        event.target.value,
                    })
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
                  value={
                    correction.assessment
                  }
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      assessment:
                        event.target.value,
                    })
                  }
                >
                  <option value="">
                    Choose assessment
                  </option>

                  <option value="SATISFACTORY">
                    Satisfactory
                  </option>

                  <option value="SATISFACTORY_WITH_BRIEFING">
                    Satisfactory with Briefing
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
                    correction.studentComments
                  }
                  placeholder="Feedback visible to the student."
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      studentComments:
                        event.target.value,
                    })
                  }
                />

                <label>
                  Staff-only Comments
                </label>

                <textarea
                  value={
                    correction.staffComments
                  }
                  placeholder="Internal comments for authorised instructors, Admins and Safety Managers. Never shown to the student."
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      staffComments:
                        event.target.value,
                    })
                  }
                />

                <label>
                  Correction reason *
                </label>

                <textarea
                  value={
                    correction.reason
                  }
                  placeholder="Why is this completed record being corrected?"
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      reason:
                        event.target.value,
                    })
                  }
                />

                <div
                  className="booking-actions"
                  style={{
                    marginTop: "8px",
                  }}
                >
                  <button
                    className="primary"
                    disabled={busy}
                    type="submit"
                  >
                    Review Correction
                  </button>

                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      setCorrecting(null)
                    }
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {history && (
          <div
            className="student-booking-card"
            style={{ marginTop: 20 }}
          >
            <div className="student-booking-header">
              <h2>
                Version history —{" "}
                {history.activity}
              </h2>

              <button
                className="secondary"
                onClick={() => {
                  setHistory(null);
                  setVersions([]);
                }}
              >
                Close
              </button>
            </div>

            {versions.map((version) => (
              <article
                key={version.version_number}
                style={{
                  borderTop:
                    "1px solid rgba(255,255,255,.12)",
                  padding: "12px 0",
                }}
              >
                <strong>
                  Version{" "}
                  {version.version_number}
                </strong>

                <p>
                  {version.activity} ·{" "}
                  {version.programme ||
                    "No programme"}{" "}
                  · {version.duration_minutes}{" "}
                  min
                </p>

                <p>
                  Grade:{" "}
                  {version.grade == null
                    ? "Historical — not recorded"
                    : `${version.grade}/5`}{" "}
                  · Assessment:{" "}
                  {version.assessment
                    ? formatLabel(
                        version.assessment
                      )
                    : "Historical — not recorded"}
                </p>

                {version.student_comments && (
                  <CommentBlock
                    title="Comments for Student"
                    text={
                      version.student_comments
                    }
                  />
                )}

                {staff &&
                  version.staff_comments && (
                    <CommentBlock
                      title="Staff-only Comments"
                      text={
                        version.staff_comments
                      }
                      internal
                    />
                  )}

                {version.correction_reason && (
                  <p className="muted">
                    Reason:{" "}
                    {
                      version.correction_reason
                    }
                  </p>
                )}

                <p className="muted">
                  {formatDateTime(
                    version.created_at
                  )}{" "}
                  ·{" "}
                  {version.created_by_name ||
                    "System"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <ActionConfirmModal
        open={Boolean(confirmCorrection)}
        eyebrow="IMMUTABLE CORRECTION"
        title="Submit this correction?"
        message="Confirm the correction details. The original completed record will remain unchanged and AeroPath will create a new immutable current version."
        confirmLabel="Create new version"
        onConfirm={
          executeCorrection
        }
        onClose={() =>
          setConfirmCorrection(null)
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

function formatHours(minutes) {
  const hours = Number(minutes || 0) / 60;
  return `${hours.toFixed(hours % 1 === 0 ? 0 : 1)} h`;
}
