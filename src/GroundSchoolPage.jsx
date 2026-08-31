import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase } from "./lib/supabase";
import ActionConfirmModal from "./ActionConfirmModal";
import ActionSuccessModal from "./ActionSuccessModal";
import ActionFormModal from "./ActionFormModal";
import ModuleEmblem from "./ModuleEmblem";

const BUCKET = "aeropath-files";

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

function nullablePositiveInteger(value, label) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} must be a whole number greater than zero.`);
  }
  return number;
}

function roleLabel(role) {
  return String(role ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDate(value) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium" }).format(date);
}

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toDateValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function combineDateTime(dateValue, timeValue, label) {
  if (!dateValue) throw new Error(`${label} date is required.`);
  if (!timeValue) throw new Error(`${label} time is required.`);
  const date = new Date(`${dateValue}T${timeValue}:00`);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} date/time is invalid.`);
  return date.toISOString();
}

function dateOnlyToIso(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  if (Number.isNaN(date.getTime())) throw new Error("Choose a valid calendar date.");
  return date.toISOString();
}

function formatPercent(value) {
  if (value == null || value === "") return "—";
  return `${Number(value).toFixed(1).replace(/\.0$/, "")}%`;
}

function humanStatus(value) {
  return String(value ?? "—")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (["scheduled", "published", "graded", "present", "passed"].includes(normalized)) return "approved";
  if (["draft", "pending", "pending_review", "late", "in_progress"].includes(normalized)) return "requested";
  if (["cancelled", "archived", "withdrawn"].includes(normalized)) return "cancelled";
  if (["absent", "failed"].includes(normalized)) return "rejected";
  if (["completed", "excused"].includes(normalized)) return "completed";
  return "";
}

function Brand() {
  return (
    <div className="brand compact">
      <div className="brand-name">AEROPATH</div>
      <div className="brand-by">by AEROVIATION</div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

function SectionTabs({ tabs, active, onChange }) {
  return (
    <div className="ground-tabs" role="tablist" aria-label="Ground School sections">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          className={`ground-tab ${active === tab.value ? "active" : ""}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.count != null && <span>{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

const TIME_OPTIONS = Array.from({ length: 72 }, (_, index) => {
  const minutes = 6 * 60 + index * 15;
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { value, label: value };
});

export default function GroundSchoolPage({ role, initialContext = null, onBack, onSignOut }) {
  const isStudent = role === "STUDENT";
  const isInstructor = role === "INSTRUCTOR";
  const isAdminEquivalent = role === "ADMIN" || role === "SAFETY_MANAGER";
  const isStaff = isInstructor || isAdminEquivalent;

  const [classes, setClasses] = useState([]);
  const [groundSessions, setGroundSessions] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [tests, setTests] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [testHistory, setTestHistory] = useState([]);
  const [groundProgress, setGroundProgress] = useState([]);
  const [groundTimeline, setGroundTimeline] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [students, setStudents] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [files, setFiles] = useState([]);

  const [activeTab, setActiveTab] = useState("CLASSES");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [classEditorError, setClassEditorError] = useState("");
  const [sessionEditorError, setSessionEditorError] = useState("");

  const [classDetail, setClassDetail] = useState(null);
  const [classEditor, setClassEditor] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [sessionEditor, setSessionEditor] = useState(null);
  const [classroomEditor, setClassroomEditor] = useState(null);
  const [studentTimeline, setStudentTimeline] = useState(null);
  const [testEditor, setTestEditor] = useState(null);
  const [questionEditor, setQuestionEditor] = useState(null);
  const [attemptDetail, setAttemptDetail] = useState(null);
  const [gradingAttempt, setGradingAttempt] = useState(null);
  const [assignmentEditor, setAssignmentEditor] = useState(null);

  const [formModal, setFormModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [successModal, setSuccessModal] = useState(null);
  const initialContextHandled = useRef(false);

  async function loadData({ keepLoading = false } = {}) {
    try {
      if (!keepLoading) setLoading(true);
      setError("");

      // Idempotent: this only creates a reminder when the 24-hour window is reached.
      try {
        await rpc("dispatch_ground_session_reminders_v1");
      } catch {
        // Reminder dispatch is best-effort and must not block Ground School.
      }

      if (isStudent) {
        const [classRows, sessionRows, assignedRows, historyRows, progressRows, timelineRows] = await Promise.all([
          rpc("list_ground_classes_v2"),
          rpc("list_ground_sessions_v1"),
          rpc("list_my_assigned_knowledge_tests_v1"),
          rpc("list_my_test_history_v1"),
          rpc("list_student_ground_progress_v1"),
          rpc("list_student_ground_timeline_v1"),
        ]);
        setClasses(classRows ?? []);
        setGroundSessions(sessionRows ?? []);
        setAssignments(assignedRows ?? []);
        setTestHistory(historyRows ?? []);
        setGroundProgress(progressRows ?? []);
        setGroundTimeline(timelineRows ?? []);
      } else {
        const studentPromise = isAdminEquivalent
          ? rpc("admin_list_booking_students_v2")
          : rpc("operational_list_student_profiles_v2");
        const [classRows, sessionRows, classroomRows, testRows, programmeRows, studentRows, instructorRows, fileRows, attemptRows] = await Promise.all([
          rpc("list_ground_classes_v2"),
          rpc("list_ground_sessions_v1"),
          rpc("list_ground_classrooms_v1"),
          rpc("admin_list_knowledge_tests_v1"),
          rpc("list_training_programmes_v2"),
          studentPromise,
          rpc("list_approved_instructors"),
          rpc("list_files_v2"),
          rpc("staff_list_knowledge_test_attempts_v1"),
        ]);
        setClasses(classRows ?? []);
        setGroundSessions(sessionRows ?? []);
        setClassrooms(classroomRows ?? []);
        setTests(testRows ?? []);
        setProgrammes((programmeRows ?? []).filter((item) => item.active));
        setStudents((studentRows ?? []).filter((item) => !item.account_status || item.account_status === "APPROVED"));
        setInstructors(instructorRows ?? []);
        setFiles(fileRows ?? []);
        setAttempts(attemptRows ?? []);
      }
    } catch (err) {
      setError(err?.message || "Unable to load Ground School.");
    } finally {
      if (!keepLoading) setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (
      initialContextHandled.current ||
      !initialContext?.groundSessionId
    ) {
      return;
    }

    initialContextHandled.current = true;
    setActiveTab("SESSIONS");
    openSession(initialContext.groundSessionId);
  }, [initialContext]);

  useEffect(() => {
    function refreshVisibleGroundSchool() {
      if (document.visibilityState === "visible") {
        loadData({ keepLoading: true });
      }
    }

    window.addEventListener("focus", refreshVisibleGroundSchool);
    document.addEventListener("visibilitychange", refreshVisibleGroundSchool);

    return () => {
      window.removeEventListener("focus", refreshVisibleGroundSchool);
      document.removeEventListener("visibilitychange", refreshVisibleGroundSchool);
    };
  }, []);

  const tabs = useMemo(() => {
    if (isStudent) {
      return [
        { value: "CLASSES", label: "Classes", count: classes.length },
        { value: "SESSIONS", label: "Ground Sessions", count: groundSessions.filter((item) => item.session_status !== "CANCELLED").length },
        { value: "TESTS", label: "Tests & Quizzes", count: assignments.length },
        { value: "HISTORY", label: "History" },
      ];
    }
    return [
      { value: "CLASSES", label: "Classes", count: classes.length },
      { value: "SESSIONS", label: "Ground Sessions", count: groundSessions.filter((item) => item.session_status !== "CANCELLED").length },
      { value: "TEST_LIBRARY", label: "Test Library", count: tests.length },
      { value: "REVIEW", label: "Review Queue", count: attempts.filter((item) => item.attempt_status === "PENDING_REVIEW").length },
    ];
  }, [isStudent, classes, assignments, tests, attempts, groundSessions]);

  function showSuccess(title, message, nextText = "Ground School data has been refreshed.") {
    setSuccessModal({ title, message, nextText });
  }

  async function openClass(classId) {
    try {
      setBusy(true);
      setError("");
      const detail = await rpc("get_ground_class_detail_v2", { target_class_id: classId });
      setClassDetail(detail);
    } catch (err) {
      setError(err?.message || "Unable to open ground class.");
    } finally {
      setBusy(false);
    }
  }

  async function openSession(sessionId) {
    try {
      setBusy(true);
      setError("");
      const detail = await rpc("get_ground_session_detail_v1", { target_session_id: sessionId });
      setSessionDetail(detail);
    } catch (err) {
      setError(err?.message || "Unable to open Ground Session.");
    } finally {
      setBusy(false);
    }
  }

  function newClass() {
    setClassEditorError("");
    setClassEditor({
      id: null,
      title: "",
      subject: "",
      description: "",
      programmeId: "",
      capacity: "",
      minimumRequiredSessions: "",
    });
  }

  function editClass() {
    const item = classDetail?.class;
    if (!item) return;
    setClassEditorError("");
    setClassEditor({
      id: item.id,
      title: item.title ?? "",
      subject: item.subject ?? "",
      description: item.description ?? "",
      programmeId: item.programme_id ?? "",
      capacity: item.capacity == null ? "" : String(item.capacity),
      minimumRequiredSessions: item.minimum_required_sessions == null ? "" : String(item.minimum_required_sessions),
    });
  }

  async function saveClass(event) {
    event.preventDefault();
    const value = classEditor;
    try {
      setClassEditorError("");
      if (!value?.title.trim()) throw new Error("Class title is required.");
      const capacity = nullablePositiveInteger(value.capacity, "Capacity");
      const minimum = nullablePositiveInteger(value.minimumRequiredSessions, "Minimum required sessions");
      setBusy(true);
      if (value.id) {
        await rpc("admin_update_ground_class_v2", {
          target_class_id: value.id,
          class_title: value.title.trim(),
          class_subject: value.subject.trim() || null,
          class_description: value.description.trim() || null,
          class_programme_id: value.programmeId || null,
          class_capacity: capacity,
          class_minimum_required_sessions: minimum,
        });
      } else {
        await rpc("admin_create_ground_class_v2", {
          class_title: value.title.trim(),
          class_subject: value.subject.trim() || null,
          class_description: value.description.trim() || null,
          class_programme_id: value.programmeId || null,
          class_capacity: capacity,
          class_minimum_required_sessions: minimum,
        });
      }
      const editingId = value.id;
      setClassEditor(null);
      await loadData({ keepLoading: true });
      if (editingId) await openClass(editingId);
      showSuccess(value.id ? "Ground class updated" : "Ground class created", value.id ? "Class details were updated. Existing Ground Sessions are unchanged." : "Now add one or more Ground Session dates before publishing the class.");
    } catch (err) {
      setClassEditorError(err?.message || "Unable to save ground class.");
    } finally {
      setBusy(false);
    }
  }

  function newSession(classId = classDetail?.class?.id) {
    const firstInstructor = instructors[0]?.id ?? "";
    const firstClassroom = classrooms.find((item) => item.active)?.classroom_id ?? "";
    setSessionEditorError("");
    setSessionEditor({
      id: null,
      classId,
      date: "",
      startTime: "09:00",
      endTime: "11:00",
      instructorId: firstInstructor,
      locationMode: firstClassroom ? "CLASSROOM" : "CUSTOM",
      classroomId: firstClassroom,
      customLocation: "",
    });
  }

  function editSession(session) {
    setSessionEditorError("");
    setSessionEditor({
      id: session.ground_session_id || session.id,
      classId: session.ground_class_id,
      date: toDateValue(session.starts_at),
      startTime: toTimeValue(session.starts_at),
      endTime: toTimeValue(session.ends_at),
      instructorId: session.scheduled_instructor_id ?? "",
      locationMode: session.classroom_id ? "CLASSROOM" : "CUSTOM",
      classroomId: session.classroom_id ?? "",
      customLocation: session.custom_location ?? "",
    });
  }

  async function saveSession(event) {
    event.preventDefault();
    const value = sessionEditor;
    try {
      setSessionEditorError("");
      if (!value?.instructorId) throw new Error("Select an Instructor.");
      if (value.locationMode === "CLASSROOM" && !value.classroomId) throw new Error("Select a classroom.");
      if (value.locationMode === "CUSTOM" && !value.customLocation.trim()) throw new Error("Enter the off-site/custom location.");
      const startsAt = combineDateTime(value.date, value.startTime, "Start");
      const endsAt = combineDateTime(value.date, value.endTime, "End");
      if (new Date(endsAt) <= new Date(startsAt)) throw new Error("End time must be after start time.");
      setBusy(true);
      if (value.id) {
        await rpc("admin_update_ground_session_v1", {
          target_session_id: value.id,
          session_instructor_id: value.instructorId,
          session_starts_at: startsAt,
          session_ends_at: endsAt,
          session_classroom_id: value.locationMode === "CLASSROOM" ? value.classroomId : null,
          session_custom_location: value.locationMode === "CUSTOM" ? value.customLocation.trim() : null,
        });
      } else {
        await rpc("admin_create_ground_session_v1", {
          target_class_id: value.classId,
          session_instructor_id: value.instructorId,
          session_starts_at: startsAt,
          session_ends_at: endsAt,
          session_classroom_id: value.locationMode === "CLASSROOM" ? value.classroomId : null,
          session_custom_location: value.locationMode === "CUSTOM" ? value.customLocation.trim() : null,
        });
      }
      const classId = value.classId;
      setSessionEditor(null);
      await loadData({ keepLoading: true });
      if (classId) await openClass(classId);
      showSuccess(value.id ? "Ground Session rescheduled" : "Ground Session scheduled", "The Instructor, students and classroom are protected by AeroPath conflict checks. A reminder is generated 24 hours before the session.");
    } catch (err) {
      setSessionEditorError(err?.message || "Unable to save Ground Session.");
    } finally {
      setBusy(false);
    }
  }

  function askPublishClass() {
    const item = classDetail?.class;
    if (!item) return;
    setConfirmModal({
      action: "PUBLISH_CLASS",
      classId: item.id,
      title: "Publish ground class?",
      message: `${item.title}\nStudents will be able to see the class, its scheduled dates, materials and attached tests.`,
      confirmLabel: "Publish Class",
    });
  }

  function askStartSession(session) {
    setConfirmModal({
      action: "START_SESSION",
      sessionId: session.ground_session_id || session.id,
      title: "I'm starting this class",
      message: `${session.class_title || classDetail?.class?.title || "Ground Session"}\n${formatDateTime(session.starts_at)}\nStarting creates a roster snapshot and unlocks attendance.`,
      confirmLabel: "Start Class",
    });
  }

  function askCompleteSession(session) {
    setConfirmModal({
      action: "COMPLETE_SESSION",
      sessionId: session.id || session.ground_session_id,
      title: "Complete this Ground Session?",
      message: "Attendance and comments remain auditable after completion. Staff may still correct attendance later if required.",
      confirmLabel: "Complete Class",
    });
  }

  function askCancelSession(session) {
    setConfirmModal({
      action: "CANCEL_SESSION",
      sessionId: session.ground_session_id || session.id,
      title: "Cancel this Ground Session?",
      message: `${session.class_title || classDetail?.class?.title || "Ground Session"}\nA cancellation reason is required.`,
      confirmLabel: "Cancel Session",
      danger: true,
      inputLabel: "Cancellation reason",
      inputRequired: true,
    });
  }

  function updateLocalGroundSessionStatus(sessionId, status) {
    setGroundSessions((current) =>
      current.map((session) =>
        session.ground_session_id === sessionId
          ? {
              ...session,
              session_status: status,
            }
          : session
      )
    );
  }

  async function executeConfirm(inputValue = "") {
    const item = confirmModal;
    if (!item) return;
    try {
      setBusy(true);
      setError("");
      if (item.action === "PUBLISH_CLASS") {
        await rpc("admin_publish_ground_class_v2", { target_class_id: item.classId });
        showSuccess("Ground class published", "Enrolled students can now see the scheduled Ground Sessions, class materials and tests.");
      } else if (item.action === "START_SESSION") {
        await rpc("staff_start_ground_session_v1", { target_session_id: item.sessionId });
        updateLocalGroundSessionStatus(item.sessionId, "IN_PROGRESS");
        await openSession(item.sessionId);
        showSuccess("Ground Session started", "The class is now live. Attendance and comments are available immediately.");
      } else if (item.action === "COMPLETE_SESSION") {
        await rpc("staff_complete_ground_session_v1", { target_session_id: item.sessionId });
        updateLocalGroundSessionStatus(item.sessionId, "COMPLETED");
        await openSession(item.sessionId);
        showSuccess("Ground Session completed", "Attendance, notes and session history remain available for audit and correction.");
      } else if (item.action === "CANCEL_SESSION") {
        await rpc("admin_cancel_ground_session_v1", { target_session_id: item.sessionId, reason: inputValue });
        showSuccess("Ground Session cancelled", "The cancelled date remains in the Ground School history.");
        setSessionDetail(null);
      } else if (item.action === "WITHDRAW_STUDENT") {
        await rpc("admin_withdraw_ground_class_student_v2", {
          target_class_id: item.classId,
          target_student_id: item.studentId,
          reason: inputValue,
        });
        showSuccess("Student withdrawn", "Historical completed rosters remain unchanged.");
      } else if (item.action === "DETACH_CLASS_FILE") {
        await rpc("staff_detach_ground_class_file_v1", { target_class_id: item.classId, target_file_id: item.fileId });
        showSuccess("Class material detached", "The AeroPath file itself was not deleted.");
      } else if (item.action === "DETACH_SESSION_FILE") {
        await rpc("staff_detach_ground_session_file_v1", { target_session_id: item.sessionId, target_file_id: item.fileId });
        showSuccess("Session file detached", "The AeroPath file itself was not deleted.");
        await openSession(item.sessionId);
      } else if (item.action === "ATTENDANCE_CHANGE") {
        await rpc("staff_mark_ground_session_attendance_v1", {
          target_session_id: item.sessionId,
          target_student_id: item.studentId,
          new_attendance_status: item.status,
          late_arrival_time_value: item.lateTime || null,
          correction_reason: inputValue || null,
        });
        await openSession(item.sessionId);
      } else if (item.action === "PUBLISH_TEST") {
        await rpc("admin_publish_knowledge_test_v1", { target_test_id: item.testId });
        showSuccess("Test published", "The test can now be assigned by an Instructor, Admin or Safety Manager.");
        setTestEditor(null);
      } else if (item.action === "ARCHIVE_TEST") {
        await rpc("admin_archive_knowledge_test_v1", { target_test_id: item.testId });
        showSuccess("Test archived", "Historical attempts remain available.");
        setTestEditor(null);
      } else if (item.action === "DELETE_QUESTION") {
        await rpc("admin_delete_knowledge_test_question_v1", { target_question_id: item.questionId });
        showSuccess("Question deleted", "The draft test has been updated.");
        await openTestEditor(item.testId);
      } else if (item.action === "SUBMIT_ATTEMPT") {
        const result = await rpc("submit_knowledge_test_attempt_v1", { target_attempt_id: item.attemptId });
        setAttemptDetail(result);
        showSuccess(result?.attempt?.status === "PENDING_REVIEW" ? "Test submitted for review" : "Test submitted", result?.attempt?.result_released ? `Your result is ${formatPercent(result?.attempt?.percentage)}.` : "Your attempt is locked and saved with its submission date.");
      } else if (item.action === "RELEASE_RESULT") {
        await rpc("staff_release_knowledge_test_result_v1", { target_attempt_id: item.attemptId });
        showSuccess("Result released", "The student has been notified in AeroPath.");
        setGradingAttempt(null);
      }
      setConfirmModal(null);
      await loadData({ keepLoading: true });
      if (classDetail?.class?.id) await openClass(classDetail.class.id);
      if (testEditor?.test?.id) await openTestEditor(testEditor.test.id);
    } catch (err) {
      setError(err?.message || "Unable to complete action.");
      setConfirmModal(null);
    } finally {
      setBusy(false);
    }
  }

  function openEnrolStudent() {
    const currentIds = new Set((classDetail?.students ?? []).map((item) => item.student_id));
    const options = students
      .filter((item) => !currentIds.has(item.student_id))
      .map((item) => ({ value: item.student_id, label: item.display_name || item.full_name || item.email }));
    setFormModal({
      action: "ENROL_STUDENT",
      eyebrow: "GROUND SCHOOL",
      title: "Enrol student",
      message: classDetail?.class?.title,
      confirmLabel: "Enrol Student",
      fields: [{ name: "studentId", label: "Student", type: "select", required: true, defaultValue: "", options: [{ value: "", label: "Choose student" }, ...options] }],
    });
  }

  function openEnrolProgramme() {
    setFormModal({
      action: "ENROL_PROGRAMME",
      eyebrow: "GROUND SCHOOL",
      title: "Enrol programme",
      message: "All currently active students in the selected programme will be enrolled.",
      confirmLabel: "Enrol Programme",
      fields: [{ name: "programmeId", label: "Programme", type: "select", required: true, defaultValue: "", options: [{ value: "", label: "Choose programme" }, ...programmes.map((item) => ({ value: item.programme_id, label: item.name }))] }],
    });
  }

  function openAttachClassFile() {
    setFormModal({
      action: "ATTACH_CLASS_FILE",
      eyebrow: "CLASS MATERIALS",
      title: "Attach AeroPath file",
      message: "Class materials remain available for the entire Ground Class.",
      confirmLabel: "Attach File",
      fields: [
        { name: "fileId", label: "AeroPath file", type: "select", required: true, defaultValue: "", options: [{ value: "", label: "Choose file" }, ...files.map((item) => ({ value: item.file_id, label: `${item.file_name} · ${humanStatus(item.file_scope)}` }))] },
        { name: "label", label: "Display label", type: "text", required: false, defaultValue: "" },
        { name: "required", label: "Required material", type: "select", required: true, defaultValue: "NO", options: [{ value: "NO", label: "No" }, { value: "YES", label: "Yes" }] },
      ],
    });
  }

  function openAttachSessionFile() {
    setFormModal({
      action: "ATTACH_SESSION_FILE",
      eyebrow: "SESSION FILES",
      title: "Attach file to this Ground Session",
      message: "Use this for material or notes specific to this particular class date.",
      confirmLabel: "Attach File",
      fields: [
        { name: "fileId", label: "AeroPath file", type: "select", required: true, defaultValue: "", options: [{ value: "", label: "Choose file" }, ...files.map((item) => ({ value: item.file_id, label: `${item.file_name} · ${humanStatus(item.file_scope)}` }))] },
        { name: "label", label: "Display label", type: "text", required: false, defaultValue: "" },
      ],
    });
  }

  function openClassComment(visibility = "INTERNAL") {
    setFormModal({
      action: "CLASS_COMMENT",
      visibility,
      eyebrow: visibility === "INTERNAL" ? "CLASS INTERNAL COMMENT" : "CLASS FEEDBACK",
      title: visibility === "INTERNAL" ? "Add class comment" : "Add student-visible class feedback",
      message: visibility === "INTERNAL" ? "Visible only to authorised staff." : "Visible to students enrolled in this Ground Class session.",
      confirmLabel: "Add Comment",
      fields: [{ name: "comment", label: "Comment", type: "textarea", required: true, defaultValue: "" }],
    });
  }

  function openStudentComment(student, visibility = "INTERNAL") {
    setFormModal({
      action: "STUDENT_COMMENT",
      studentId: student.student_id,
      visibility,
      eyebrow: visibility === "INTERNAL" ? "STUDENT INTERNAL NOTE" : "STUDENT FEEDBACK",
      title: visibility === "INTERNAL" ? `Internal note — ${student.student_name}` : `Feedback — ${student.student_name}`,
      message: visibility === "INTERNAL" ? "This note is staff-only and is added chronologically to the student's internal training history." : "This feedback is visible to the student and remains in chronological history.",
      confirmLabel: "Add Note",
      fields: [{ name: "comment", label: "Comment", type: "textarea", required: true, defaultValue: "" }],
    });
  }

  function openAttachTestToClass() {
    const published = tests.filter((item) => item.test_status === "PUBLISHED");
    setAssignmentEditor({
      testId: "",
      targetType: "CLASS",
      targetId: classDetail?.class?.id ?? "",
      availability: "IMMEDIATE",
      availableFrom: "",
      dueAt: "",
      required: true,
      requiresPass: false,
      maxAttempts: "",
      publishedTests: published,
      lockedTarget: true,
    });
  }

  async function openStudentTimeline(student) {
    try {
      setBusy(true);
      const [progress, timeline, records] = await Promise.all([
        rpc("list_student_ground_progress_v1", { target_student_id: student.student_id }),
        rpc("list_student_ground_timeline_v1", { target_student_id: student.student_id }),
        rpc("list_training_records_v2"),
      ]);
      const operationalRecords = (records ?? []).filter((record) => record.student_id === student.student_id);
      setStudentTimeline({ student, progress: progress ?? [], timeline: timeline ?? [], operationalRecords });
    } catch (err) {
      setError(err?.message || "Unable to load student training timeline.");
    } finally {
      setBusy(false);
    }
  }

  async function markAttendance(student, status) {
    const session = sessionDetail?.session;
    if (!session) return;
    const changingExisting = student.attendance_status && student.attendance_status !== "PENDING" && student.attendance_status !== status;
    if (changingExisting) {
      setConfirmModal({
        action: "ATTENDANCE_CHANGE",
        sessionId: session.id,
        studentId: student.student_id,
        status,
        lateTime: status === "LATE" ? student.late_arrival_time || null : null,
        title: `Correct attendance for ${student.student_name}?`,
        message: `${humanStatus(student.attendance_status)} → ${humanStatus(status)}\nThe previous attendance remains in revision history.`,
        confirmLabel: "Save Correction",
        inputLabel: "Correction reason",
        inputRequired: true,
      });
      return;
    }
    try {
      setBusy(true);
      await rpc("staff_mark_ground_session_attendance_v1", {
        target_session_id: session.id,
        target_student_id: student.student_id,
        new_attendance_status: status,
        late_arrival_time_value: null,
        correction_reason: null,
      });
      await openSession(session.id);
    } catch (err) {
      setError(err?.message || "Unable to update attendance.");
    } finally {
      setBusy(false);
    }
  }

  async function executeForm(values) {
    const item = formModal;
    if (!item) return;
    try {
      setBusy(true);
      setError("");
      const classId = classDetail?.class?.id;
      const sessionId = sessionDetail?.session?.id;

      if (item.action === "ENROL_STUDENT") {
        await rpc("admin_enrol_ground_class_students_v2", { target_class_id: classId, target_student_ids: [values.studentId] });
        showSuccess("Student enrolled", "Future Ground Sessions will include this student. Already-started session rosters remain unchanged.");
      } else if (item.action === "ENROL_PROGRAMME") {
        const affected = await rpc("admin_enrol_ground_class_programme_v2", { target_class_id: classId, target_programme_id: values.programmeId });
        showSuccess("Programme enrolled", `${affected ?? 0} student enrolment(s) were added or reactivated.`);
      } else if (item.action === "ATTACH_CLASS_FILE") {
        await rpc("staff_attach_ground_class_file_v1", {
          target_class_id: classId,
          target_file_id: values.fileId,
          material_label: values.label || null,
          material_required: values.required === "YES",
        });
        showSuccess("Class material attached", "The material remains available for the whole Ground Class.");
      } else if (item.action === "ATTACH_SESSION_FILE") {
        await rpc("staff_attach_ground_session_file_v1", { target_session_id: sessionId, target_file_id: values.fileId, material_label: values.label || null });
        showSuccess("Session file attached", "The file is linked only to this Ground Session date.");
        await openSession(sessionId);
      } else if (item.action === "CLASS_COMMENT") {
        await rpc("staff_add_ground_session_comment_v1", { target_session_id: sessionId, comment_text_value: values.comment, comment_visibility: item.visibility });
        showSuccess("Class comment added", item.visibility === "INTERNAL" ? "The note is visible only to authorised staff." : "The feedback is visible to enrolled students.");
        await openSession(sessionId);
      } else if (item.action === "STUDENT_COMMENT") {
        await rpc("staff_add_ground_student_comment_v1", { target_session_id: sessionId, target_student_id: item.studentId, comment_text_value: values.comment, comment_visibility: item.visibility });
        showSuccess(item.visibility === "INTERNAL" ? "Internal student note added" : "Student feedback added", "The comment was added chronologically to the student's Ground School history.");
        await openSession(sessionId);
      } else if (item.action === "CREATE_TEST") {
        const id = await rpc("admin_create_knowledge_test_v1", {
          test_title: values.title,
          test_description: values.description || null,
          test_programme_id: values.programmeId || null,
          test_pass_mark_percent: Number(values.passMark),
          test_time_limit_minutes: nullablePositiveInteger(values.timeLimit, "Time limit"),
          test_max_attempts: nullablePositiveInteger(values.maxAttempts, "Maximum attempts"),
          randomize_question_order: values.randomizeQuestions === "YES",
          randomize_answer_order: values.randomizeAnswers === "YES",
          release_results_immediately: values.releaseImmediately === "YES",
        });
        showSuccess("Draft test created", "Add questions, review the answer key, then publish the test.");
        await openTestEditor(id);
      } else if (item.action === "DUPLICATE_TEST") {
        const id = await rpc("admin_duplicate_knowledge_test_v1", { source_test_id: item.testId, duplicate_title: values.title });
        showSuccess("Test duplicated", "The copy is a new draft and can be edited independently.");
        await openTestEditor(id);
      }
      setFormModal(null);
      await loadData({ keepLoading: true });
      if (classId) await openClass(classId);
    } catch (err) {
      setError(err?.message || "Unable to complete form action.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadMaterial(material) {
    try {
      setError("");
      const { data, error: storageError } = await supabase.storage.from(BUCKET).createSignedUrl(material.storage_path, 120);
      if (storageError) throw storageError;
      if (!data?.signedUrl) throw new Error("Unable to create a secure file link.");
      const anchor = document.createElement("a");
      anchor.href = data.signedUrl;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
    } catch (err) {
      setError(err?.message || "Unable to open material.");
    }
  }

  function openCreateTest() {
    setFormModal({
      action: "CREATE_TEST",
      eyebrow: "TEST AUTHORING",
      title: "Create custom test",
      message: "Instructors, Admins and Safety Managers can create draft tests. Publishing locks the question content.",
      confirmLabel: "Create Draft",
      fields: [
        { name: "title", label: "Test title", type: "text", required: true, defaultValue: "" },
        { name: "description", label: "Description", type: "textarea", required: false, defaultValue: "" },
        { name: "programmeId", label: "Programme", type: "select", required: false, defaultValue: "", options: [{ value: "", label: "No specific programme" }, ...programmes.map((item) => ({ value: item.programme_id, label: item.name }))] },
        { name: "passMark", label: "Pass mark (%)", type: "number", min: 0, required: true, defaultValue: "75" },
        { name: "timeLimit", label: "Time limit (minutes)", type: "number", min: 1, required: false, defaultValue: "" },
        { name: "maxAttempts", label: "Maximum attempts", type: "number", min: 1, required: false, defaultValue: "1" },
        { name: "randomizeQuestions", label: "Randomise question order", type: "select", required: true, defaultValue: "NO", options: [{ value: "NO", label: "No" }, { value: "YES", label: "Yes" }] },
        { name: "randomizeAnswers", label: "Randomise answer order", type: "select", required: true, defaultValue: "NO", options: [{ value: "NO", label: "No" }, { value: "YES", label: "Yes" }] },
        { name: "releaseImmediately", label: "Release objective-only results immediately", type: "select", required: true, defaultValue: "YES", options: [{ value: "YES", label: "Yes" }, { value: "NO", label: "No" }] },
      ],
    });
  }

  async function openTestEditor(testId) {
    try {
      setBusy(true);
      setError("");
      const editor = await rpc("admin_get_knowledge_test_editor_v1", { target_test_id: testId });
      setTestEditor(editor);
    } catch (err) {
      setError(err?.message || "Unable to open test editor.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTestSettings(event) {
    event.preventDefault();
    const test = testEditor?.test;
    if (!test) return;
    try {
      setBusy(true);
      await rpc("admin_update_knowledge_test_v1", {
        target_test_id: test.id,
        test_title: test.title,
        test_description: test.description || null,
        test_programme_id: test.programme_id || null,
        test_pass_mark_percent: Number(test.pass_mark_percent),
        test_time_limit_minutes: nullablePositiveInteger(test.time_limit_minutes, "Time limit"),
        test_max_attempts: nullablePositiveInteger(test.max_attempts, "Maximum attempts"),
        randomize_question_order: Boolean(test.randomize_questions),
        randomize_answer_order: Boolean(test.randomize_answers),
        release_results_immediately: Boolean(test.release_results_immediately),
      });
      await openTestEditor(test.id);
      await loadData({ keepLoading: true });
      showSuccess("Draft test settings saved", "Question content and assignments are unchanged.");
    } catch (err) {
      setError(err?.message || "Unable to save test settings.");
    } finally {
      setBusy(false);
    }
  }

  function addQuestion() {
    const nextPosition = (testEditor?.questions?.length ?? 0) + 1;
    setQuestionEditor({
      questionId: null,
      testId: testEditor.test.id,
      position: nextPosition,
      type: "SINGLE_CHOICE",
      prompt: "",
      points: "1",
      options: [{ label: "", isCorrect: true }, { label: "", isCorrect: false }],
    });
  }

  function editQuestion(question) {
    setQuestionEditor({
      questionId: question.question_id,
      testId: testEditor.test.id,
      position: question.position,
      type: question.question_type,
      prompt: question.prompt,
      points: String(question.points),
      options: (question.options ?? []).map((option) => ({ label: option.label, isCorrect: option.is_correct })),
    });
  }

  async function saveQuestion(event) {
    event.preventDefault();
    const q = questionEditor;
    try {
      if (!q.prompt.trim()) throw new Error("Question text is required.");
      const points = Number(q.points);
      if (!Number.isFinite(points) || points <= 0) throw new Error("Question points must be greater than zero.");
      const options = q.type === "SHORT_TEXT" ? [] : q.type === "TRUE_FALSE" ? q.options.slice(0, 2) : q.options;
      if (q.type !== "SHORT_TEXT") {
        if (options.some((entry) => !entry.label.trim())) throw new Error("Every answer option needs text.");
        const correctCount = options.filter((entry) => entry.isCorrect).length;
        if (["SINGLE_CHOICE", "TRUE_FALSE"].includes(q.type) && correctCount !== 1) throw new Error("Choose exactly one correct answer.");
        if (q.type === "MULTI_CHOICE" && correctCount < 1) throw new Error("Choose at least one correct answer.");
      }
      setBusy(true);
      await rpc("admin_save_knowledge_test_question_v1", {
        target_test_id: q.testId,
        target_question_id: q.questionId,
        question_position: Number(q.position),
        question_type_value: q.type,
        question_prompt: q.prompt,
        question_points: points,
        question_options: options.map((entry) => ({ label: entry.label, is_correct: entry.isCorrect })),
      });
      setQuestionEditor(null);
      await openTestEditor(q.testId);
      await loadData({ keepLoading: true });
      showSuccess(q.questionId ? "Question updated" : "Question added", "The answer key remains private until results are released.");
    } catch (err) {
      setError(err?.message || "Unable to save question.");
    } finally {
      setBusy(false);
    }
  }

  function openAssignTest(testId) {
    setAssignmentEditor({
      testId,
      targetType: "STUDENT",
      targetId: "",
      availability: "IMMEDIATE",
      availableFrom: "",
      dueAt: "",
      required: true,
      requiresPass: false,
      maxAttempts: "",
      publishedTests: null,
      lockedTarget: false,
    });
  }

  async function saveAssignment(event) {
    event.preventDefault();
    const value = assignmentEditor;
    try {
      const testId = value.testId || value.selectedTestId;
      if (!testId) throw new Error("Choose a published test.");
      if (!value?.targetId) throw new Error("Choose an assignment target.");
      const availableFrom = value.availableFrom ? dateOnlyToIso(value.availableFrom, false) : null;
      const dueAt = value.dueAt ? dateOnlyToIso(value.dueAt, true) : null;
      setBusy(true);
      await rpc("admin_assign_knowledge_test_v1", {
        target_test_id: testId,
        target_type: value.targetType,
        target_ids: [value.targetId],
        assignment_required: value.required,
        assignment_requires_pass: value.requiresPass,
        assignment_availability_mode: value.availability,
        assignment_available_from: availableFrom,
        assignment_due_at: dueAt,
        assignment_max_attempts: nullablePositiveInteger(value.maxAttempts, "Attempt limit"),
      });
      setAssignmentEditor(null);
      await loadData({ keepLoading: true });
      if (testEditor?.test?.id) await openTestEditor(testEditor.test.id);
      if (classDetail?.class?.id) await openClass(classDetail.class.id);
      showSuccess("Test assigned", "Attempts will retain their actual start/submission dates and immutable result history.");
    } catch (err) {
      setError(err?.message || "Unable to assign test.");
    } finally {
      setBusy(false);
    }
  }

  function openDuplicateTest(test) {
    setFormModal({
      action: "DUPLICATE_TEST",
      testId: test.test_id,
      eyebrow: "TEST AUTHORING",
      title: "Duplicate test",
      message: "The duplicate becomes an editable draft.",
      confirmLabel: "Duplicate Test",
      fields: [{ name: "title", label: "New test title", type: "text", required: true, defaultValue: `${test.title} — Copy` }],
    });
  }

  async function openStudentTest(item, createIfNeeded = false) {
    try {
      setBusy(true);
      setError("");
      let attemptId = item.latest_attempt_id;
      if (createIfNeeded || !attemptId) attemptId = await rpc("start_knowledge_test_attempt_v1", { target_assignment_id: item.assignment_id });
      const detail = await rpc("get_knowledge_test_attempt_v1", { target_attempt_id: attemptId });
      setAttemptDetail(detail);
    } catch (err) {
      setError(err?.message || "Unable to open test.");
    } finally {
      setBusy(false);
    }
  }

  async function openStaffAttempt(attemptId) {
    try {
      setBusy(true);
      setError("");
      const detail = await rpc("get_knowledge_test_attempt_v1", { target_attempt_id: attemptId });
      setGradingAttempt(detail);
    } catch (err) {
      setError(err?.message || "Unable to open test attempt.");
    } finally {
      setBusy(false);
    }
  }

  async function gradeAttempt(payload) {
    try {
      setBusy(true);
      const result = await rpc("staff_grade_knowledge_test_attempt_v1", {
        target_attempt_id: gradingAttempt.attempt.attempt_id,
        written_grades: payload.grades,
        overall_feedback_text: payload.overallFeedback || null,
        release_result: payload.releaseResult,
      });
      setGradingAttempt(result);
      await loadData({ keepLoading: true });
      showSuccess("Test graded", payload.releaseResult ? "The result was released to the student." : "The result is graded but remains unreleased.");
    } catch (err) {
      setError(err?.message || "Unable to grade attempt.");
    } finally {
      setBusy(false);
    }
  }

  function editClassroom(room = null) {
    setClassroomEditor({
      id: room?.classroom_id ?? null,
      name: room?.name ?? "",
      physicalLocation: room?.physical_location ?? "",
      description: room?.description ?? "",
      active: room?.active ?? true,
    });
  }

  async function saveClassroom(event) {
    event.preventDefault();
    const value = classroomEditor;
    try {
      if (!value.name.trim()) throw new Error("Classroom name is required.");
      setBusy(true);
      await rpc("admin_save_ground_classroom_v1", {
        target_classroom_id: value.id,
        classroom_name: value.name.trim(),
        classroom_physical_location: value.physicalLocation.trim() || null,
        classroom_description: value.description.trim() || null,
        classroom_active: value.active,
      });
      setClassroomEditor(null);
      await loadData({ keepLoading: true });
      showSuccess(value.id ? "Classroom updated" : "Classroom created", "Ground Session location menus now use the updated classroom details.");
    } catch (err) {
      setError(err?.message || "Unable to save classroom.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app ground-school-redesign-page">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <span className="role">{roleLabel(role)}</span>
          <button className="secondary" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <section className="bookings-page ground-school-page">
        <button className="secondary back-button" type="button" onClick={onBack}>← Back to dashboard</button>

        <div className="ground-school-heading aero-page-heading">
          <div>
            <div className="eyebrow">GROUND SCHOOL</div>
            <h1>Ground School</h1>
            <p className="muted">
              {isStudent
                ? "Your classes, individual class dates, materials, tests and chronological Ground School history."
                : isAdminEquivalent
                  ? "Build Ground Classes, schedule individual dates, assign instructors/classrooms, manage attendance and assessments."
                  : "See Ground Sessions, start classes, take attendance, write comments and create or grade tests."}
            </p>
          </div>
          <div className="aero-heading-aside">
            <ModuleEmblem name="ground" />
            <div className="booking-actions ground-heading-actions">
              <button className="secondary" type="button" disabled={loading || busy} onClick={() => loadData()}>Refresh</button>
              {isAdminEquivalent && activeTab === "CLASSES" && <button className="primary" type="button" onClick={newClass}>+ Create Class</button>}
              {isAdminEquivalent && activeTab === "SESSIONS" && <button className="secondary" type="button" onClick={() => editClassroom(classrooms[0] ?? null)}>Manage Classrooms</button>}
              {isStaff && activeTab === "TEST_LIBRARY" && <button className="primary" type="button" onClick={openCreateTest}>+ Create Test</button>}
            </div>
          </div>
        </div>

        <SectionTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        {error && <div className="login-error booking-message">{error}</div>}

        {loading ? (
          <div className="admin-empty">Loading Ground School...</div>
        ) : (
          <>
            {activeTab === "CLASSES" && <ClassList classes={classes} sessions={groundSessions} isStudent={isStudent} onOpen={openClass} />}
            {activeTab === "SESSIONS" && <StaffSessionsList sessions={groundSessions} onOpen={openSession} onStart={isStaff ? askStartSession : () => {}} />}
            {activeTab === "TEST_LIBRARY" && isStaff && <TestLibrary tests={tests} onOpen={openTestEditor} onAssign={openAssignTest} onDuplicate={openDuplicateTest} />}
            {activeTab === "TESTS" && isStudent && <StudentTests assignments={assignments} onOpen={(item, createNew) => openStudentTest(item, createNew)} />}
            {activeTab === "REVIEW" && isStaff && <ReviewQueue attempts={attempts} onOpen={openStaffAttempt} />}
            {activeTab === "HISTORY" && isStudent && <StudentHistory progress={groundProgress} timeline={groundTimeline} testHistory={testHistory} />}
          </>
        )}
      </section>

      {classDetail && (
        <ClassDetailModal
          detail={classDetail}
          isStudent={isStudent}
          isStaff={isStaff}
          isAdminEquivalent={isAdminEquivalent}
          busy={busy}
          onClose={() => setClassDetail(null)}
          onEdit={editClass}
          onPublish={askPublishClass}
          onScheduleSession={() => newSession(classDetail.class.id)}
          onOpenSession={openSession}
          onEditSession={editSession}
          onCancelSession={askCancelSession}
          onStartSession={askStartSession}
          onEnrolStudent={openEnrolStudent}
          onEnrolProgramme={openEnrolProgramme}
          onWithdrawStudent={(student) => setConfirmModal({ action: "WITHDRAW_STUDENT", classId: classDetail.class.id, studentId: student.student_id, title: "Withdraw student from class?", message: `${student.student_name}\nA reason is required. Already-started roster snapshots remain unchanged.`, confirmLabel: "Withdraw Student", danger: true, inputLabel: "Withdrawal reason", inputRequired: true })}
          onStudentTimeline={openStudentTimeline}
          onAttachFile={openAttachClassFile}
          onDetachFile={(material) => setConfirmModal({ action: "DETACH_CLASS_FILE", classId: classDetail.class.id, fileId: material.file_id, title: "Detach class material?", message: `${material.display_label || material.file_name}\nThis removes only the Ground Class link.`, confirmLabel: "Detach Material", danger: true })}
          onDownload={downloadMaterial}
          onAttachTest={openAttachTestToClass}
          onOpenStudentTest={(test) => {
            const assignment = assignments.find((entry) => entry.assignment_id === test.assignment_id);
            if (!assignment) setError("This class test is not currently available in your assignments.");
            else if (assignment.latest_attempt_id) openStudentTest(assignment, false);
            else if (assignment.can_start) openStudentTest(assignment, true);
            else setError("This test is not open yet or no attempts remain.");
          }}
        />
      )}

      {sessionDetail && (
        <SessionDetailModal
          detail={sessionDetail}
          isStudent={isStudent}
          isStaff={isStaff}
          isAdminEquivalent={isAdminEquivalent}
          busy={busy}
          onClose={() => setSessionDetail(null)}
          onStart={askStartSession}
          onComplete={askCompleteSession}
          onEdit={editSession}
          onCancel={askCancelSession}
          onAttendance={markAttendance}
          onClassComment={openClassComment}
          onStudentComment={openStudentComment}
          onStudentTimeline={openStudentTimeline}
          onAttachFile={openAttachSessionFile}
          onDetachFile={(material) => setConfirmModal({ action: "DETACH_SESSION_FILE", sessionId: sessionDetail.session.id, fileId: material.file_id, title: "Detach session file?", message: material.display_label || material.file_name, confirmLabel: "Detach File", danger: true })}
          onDownload={downloadMaterial}
        />
      )}

      {classEditor && <ClassEditorModal value={classEditor} programmes={programmes} busy={busy} error={classEditorError} onChange={(next) => { setClassEditorError(""); setClassEditor(next); }} onClose={() => setClassEditor(null)} onSubmit={saveClass} />}
      {sessionEditor && <SessionEditorModal value={sessionEditor} instructors={instructors} classrooms={classrooms} busy={busy} error={sessionEditorError} onChange={(next) => { setSessionEditorError(""); setSessionEditor(next); }} onClose={() => setSessionEditor(null)} onSubmit={saveSession} />}
      {classroomEditor && <ClassroomManagerModal value={classroomEditor} classrooms={classrooms} busy={busy} onChange={setClassroomEditor} onEdit={editClassroom} onNew={() => editClassroom(null)} onClose={() => setClassroomEditor(null)} onSubmit={saveClassroom} />}
      {studentTimeline && <StudentTimelineModal value={studentTimeline} onClose={() => setStudentTimeline(null)} />}

      {testEditor && (
        <TestEditorModal
          editor={testEditor}
          programmes={programmes}
          students={students}
          classes={classes}
          busy={busy}
          onChange={(nextTest) => setTestEditor((current) => ({ ...current, test: nextTest }))}
          onClose={() => setTestEditor(null)}
          onSave={saveTestSettings}
          onAddQuestion={addQuestion}
          onEditQuestion={editQuestion}
          onDeleteQuestion={(question) => setConfirmModal({ action: "DELETE_QUESTION", testId: testEditor.test.id, questionId: question.question_id, title: "Delete question?", message: question.prompt, confirmLabel: "Delete Question", danger: true })}
          onPublish={() => setConfirmModal({ action: "PUBLISH_TEST", testId: testEditor.test.id, title: "Publish this test?", message: "After publication, question content is locked. Duplicate the test if you need a new editable version.", confirmLabel: "Publish Test" })}
          onArchive={() => setConfirmModal({ action: "ARCHIVE_TEST", testId: testEditor.test.id, title: "Archive this test?", message: "Historical attempts and results will remain available.", confirmLabel: "Archive Test", danger: true })}
          onAssign={() => openAssignTest(testEditor.test.id)}
        />
      )}

      {assignmentEditor && <AssignmentEditorModal value={assignmentEditor} students={students} programmes={programmes} classes={classes} busy={busy} onChange={setAssignmentEditor} onClose={() => setAssignmentEditor(null)} onSubmit={saveAssignment} />}
      {questionEditor && <QuestionEditorModal value={questionEditor} busy={busy} onChange={setQuestionEditor} onClose={() => setQuestionEditor(null)} onSubmit={saveQuestion} />}

      {attemptDetail && isStudent && (
        <StudentAttemptModal
          detail={attemptDetail}
          busy={busy}
          onClose={() => { setAttemptDetail(null); loadData({ keepLoading: true }); }}
          onError={setError}
          onSubmit={() => setConfirmModal({ action: "SUBMIT_ATTEMPT", attemptId: attemptDetail.attempt.attempt_id, title: "Submit test attempt?", message: "Submitted attempts are immutable and retain this attempt's actual submission date.", confirmLabel: "Submit Test" })}
        />
      )}

      {gradingAttempt && isStaff && (
        <GradingModal
          detail={gradingAttempt}
          busy={busy}
          onClose={() => setGradingAttempt(null)}
          onGrade={gradeAttempt}
          onRelease={() => setConfirmModal({ action: "RELEASE_RESULT", attemptId: gradingAttempt.attempt.attempt_id, title: "Release result to student?", message: "The student will be notified and can see the released score and feedback.", confirmLabel: "Release Result" })}
        />
      )}

      <ActionFormModal open={Boolean(formModal)} eyebrow={formModal?.eyebrow} title={formModal?.title} message={formModal?.message} fields={formModal?.fields ?? []} confirmLabel={formModal?.confirmLabel} danger={formModal?.danger} onConfirm={executeForm} onClose={() => setFormModal(null)} />
      <ActionConfirmModal open={Boolean(confirmModal)} title={confirmModal?.title} message={confirmModal?.message} confirmLabel={confirmModal?.confirmLabel} danger={confirmModal?.danger} inputLabel={confirmModal?.inputLabel} inputPlaceholder={confirmModal?.inputPlaceholder} inputRequired={confirmModal?.inputRequired} onConfirm={executeConfirm} onClose={() => setConfirmModal(null)} />
      <ActionSuccessModal
        open={Boolean(successModal)}
        eyebrow="GROUND SCHOOL UPDATE COMPLETE"
        title={successModal?.title}
        message={successModal?.message}
        nextText={successModal?.nextText}
        primaryLabel={isAdminEquivalent ? "Return to Operations Centre" : "Return to Flight Deck"}
        secondaryLabel="Stay on this page"
        onPrimary={() => {
          setSuccessModal(null);
          onBack?.();
        }}
        onClose={() => setSuccessModal(null)}
      />
    </main>
  );
}

function ClassList({ classes, sessions, isStudent, onOpen }) {
  if (classes.length === 0) return <div className="admin-empty">No Ground Classes are available.</div>;
  return (
    <div className="student-booking-list">
      {classes.map((item) => {
        const related = sessions.filter((session) => session.ground_class_id === item.ground_class_id && session.session_status !== "CANCELLED");
        const next = related.find((session) => session.session_status === "IN_PROGRESS") || related.find((session) => session.session_status === "SCHEDULED" && new Date(session.starts_at) >= new Date());
        return (
          <article className="student-booking-card" key={item.ground_class_id}>
            <div className="student-booking-header">
              <div>
                <h3>{item.title}</h3>
                <p>{item.programme_name || item.subject || "Ground School"}</p>
              </div>
              <span className={`booking-status ${statusClass(item.class_status)}`}>{humanStatus(item.class_status)}</span>
            </div>
            <div className="booking-details-grid instructor-booking-details">
              <Detail label="Sessions" value={`${item.completed_session_count ?? 0}/${item.session_count ?? 0} completed`} />
              <Detail label="Minimum required" value={item.minimum_required_sessions ? String(item.minimum_required_sessions) : "All scheduled"} />
              <Detail label="Students" value={String(item.enrolled_students ?? 0)} />
              <Detail label="Next date" value={next ? formatDateTime(next.starts_at) : item.first_session_at ? formatDateTime(item.first_session_at) : "Not scheduled"} />
            </div>
            {isStudent && next && <div className="booking-note"><strong>Next Ground Session</strong><p>{formatDateTime(next.starts_at)} · {next.display_location} · {next.scheduled_instructor_name}</p></div>}
            <div className="booking-actions"><button className="primary" type="button" onClick={() => onOpen(item.ground_class_id)}>Open Class</button></div>
          </article>
        );
      })}
    </div>
  );
}

function StaffSessionsList({ sessions, onOpen, onStart }) {
  const active = [...sessions]
    .filter((item) => item.session_status !== "CANCELLED")
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  if (active.length === 0) return <div className="admin-empty">No Ground Sessions have been scheduled.</div>;
  return (
    <div className="student-booking-list">
      {active.map((item) => (
        <article className="student-booking-card" key={item.ground_session_id}>
          <div className="student-booking-header">
            <div><h3>{item.class_title}</h3><p>{item.programme_name || item.class_subject || "Ground School"}</p></div>
            <span className={`booking-status ${statusClass(item.session_status)}`}>{humanStatus(item.session_status)}</span>
          </div>
          <div className="booking-details-grid instructor-booking-details">
            <Detail label="Date" value={formatDate(item.starts_at)} />
            <Detail label="Time" value={`${formatTime(item.starts_at)} – ${formatTime(item.ends_at)}`} />
            <Detail label="Classroom / location" value={item.display_location} />
            <Detail label="Scheduled instructor" value={item.scheduled_instructor_name} />
            <Detail label="Conducted by" value={item.conducted_by_name || "Not started"} />
            <Detail label="Students" value={String(item.enrolled_students ?? 0)} />
          </div>
          <div className="booking-actions">
            <button className="primary" type="button" onClick={() => onOpen(item.ground_session_id)}>Open Session</button>
            {item.can_start && <button className="secondary" type="button" onClick={() => onStart(item)}>I'm Starting This Class</button>}
          </div>
        </article>
      ))}
    </div>
  );
}

function StudentHistory({ progress, timeline, testHistory }) {
  return (
    <div className="ground-history-stack">
      <section className="student-booking-card">
        <div className="eyebrow">GROUND SCHOOL PROGRESS</div>
        <h2>Programme Progress</h2>
        {progress.length === 0 ? <p className="muted">No Ground School programme progress yet.</p> : (
          <div className="ground-progress-grid">
            {progress.map((item) => (
              <div className="ground-progress-card" key={item.programme_id}>
                <strong>{item.programme_name}</strong>
                <span>{item.completed_sessions}/{item.scheduled_sessions} sessions completed</span>
                <span>{item.present_sessions} present · {item.late_sessions} late · {item.absent_sessions} absent · {item.upcoming_sessions} upcoming</span>
                <b>{formatPercent(item.attendance_percent)} attendance</b>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="student-booking-card">
        <div className="eyebrow">CHRONOLOGICAL HISTORY</div>
        <h2>Ground & Test Timeline</h2>
        {timeline.length === 0 ? <p className="muted">No Ground School activity yet.</p> : <TimelineList items={timeline} />}
      </section>
      <section className="student-booking-card">
        <div className="eyebrow">TEST ATTEMPTS</div>
        <h2>Tests & Quizzes</h2>
        {testHistory.length === 0 ? <p className="muted">No submitted test attempts yet.</p> : (
          <div className="ground-compact-list">
            {testHistory.map((item) => (
              <div className="ground-compact-row" key={item.attempt_id}>
                <div><strong>{item.test_title}</strong><span>Attempt {item.attempt_number} · {formatDateTime(item.submitted_at)}</span></div>
                <span className={`booking-status ${item.result_released ? (item.passed ? "approved" : "rejected") : "requested"}`}>{item.result_released ? formatPercent(item.percentage) : humanStatus(item.attempt_status)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TimelineList({ items }) {
  return (
    <div className="ground-timeline">
      {items.map((item, index) => (
        <div className="ground-timeline-item" key={`${item.occurred_at}-${item.event_type}-${index}`}>
          <div className="ground-timeline-dot" />
          <div className="ground-timeline-content">
            <span>{formatDateTime(item.occurred_at)}</span>
            <strong>{item.title}</strong>
            <p>{item.subtitle}{item.status ? ` · ${humanStatus(item.status)}` : ""}{item.score_percent != null ? ` · ${formatPercent(item.score_percent)}` : ""}</p>
            {item.comment_text && <div className={`booking-note ${item.internal ? "ground-internal-note" : ""}`}><strong>{item.internal ? "Internal note" : "Comment"}</strong><p>{item.comment_text}</p></div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ModalShell({ title, eyebrow, children, onClose, width = "min(980px, 100%)", busy = false }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [busy, onClose]);

  return (
    <div
      className="aeropath-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <section
        className="aeropath-large-modal ground-modal-shell"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="student-booking-header">
          <div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>
          <button className="secondary" type="button" disabled={busy} onClick={onClose}>Close</button>
        </div>
        <div className="ground-modal-scroll">{children}</div>
      </section>
    </div>
  );
}

function ClassDetailModal({ detail, isStudent, isStaff, isAdminEquivalent, busy, onClose, onEdit, onPublish, onScheduleSession, onOpenSession, onEditSession, onCancelSession, onStartSession, onEnrolStudent, onEnrolProgramme, onWithdrawStudent, onStudentTimeline, onAttachFile, onDetachFile, onDownload, onAttachTest, onOpenStudentTest }) {
  const item = detail.class;
  const sessions = detail.sessions ?? [];
  return (
    <ModalShell title={item.title} eyebrow="GROUND CLASS" onClose={onClose} busy={busy}>
      <div className="booking-details-grid instructor-booking-details">
        <Detail label="Status" value={humanStatus(item.status)} />
        <Detail label="Programme" value={item.programme_name || "—"} />
        <Detail label="Scheduled sessions" value={String(sessions.filter((entry) => entry.session_status !== "CANCELLED").length)} />
        <Detail label="Minimum required" value={item.minimum_required_sessions ? String(item.minimum_required_sessions) : "All scheduled"} />
        <Detail label="Capacity" value={item.capacity ?? "No limit"} />
      </div>
      {item.description && <div className="booking-note"><strong>Class overview</strong><p>{item.description}</p></div>}

      {isAdminEquivalent && (
        <div className="booking-actions ground-modal-actions">
          {item.status === "DRAFT" && <button className="secondary" type="button" onClick={onEdit}>Edit Class</button>}
          {["DRAFT", "SCHEDULED"].includes(item.status) && <button className="secondary" type="button" onClick={onScheduleSession}>+ Add Class Date</button>}
          {item.status === "DRAFT" && <button className="primary" type="button" disabled={sessions.length === 0} onClick={onPublish}>Publish Class</button>}
        </div>
      )}

      <section className="ground-detail-section">
        <div className="booking-section-heading"><div><div className="eyebrow">CLASS DATES</div><h3>Ground Sessions</h3></div></div>
        {sessions.length === 0 ? <p className="muted">No class dates have been scheduled.</p> : (
          <div className="ground-compact-list">
            {sessions.map((session) => (
              <div className="ground-compact-row ground-session-row" key={session.ground_session_id}>
                <div>
                  <strong>{formatDate(session.starts_at)} · {formatTime(session.starts_at)}–{formatTime(session.ends_at)}</strong>
                  <span>{session.display_location} · {session.scheduled_instructor_name}</span>
                </div>
                <div className="booking-actions">
                  <span className={`booking-status ${statusClass(session.session_status)}`}>{humanStatus(session.session_status)}</span>
                  <button className="secondary" type="button" onClick={() => onOpenSession(session.ground_session_id)}>Open</button>
                  {isStaff && session.can_start && <button className="primary" type="button" onClick={() => onStartSession(session)}>Start</button>}
                  {isAdminEquivalent && session.session_status === "SCHEDULED" && <button className="secondary" type="button" onClick={() => onEditSession(session)}>Edit</button>}
                  {isAdminEquivalent && ["SCHEDULED", "IN_PROGRESS"].includes(session.session_status) && <button className="danger-button" type="button" onClick={() => onCancelSession(session)}>Cancel</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isStaff && (
        <section className="ground-detail-section">
          <div className="booking-section-heading">
            <div><div className="eyebrow">ENROLMENT</div><h3>{detail.students.length} Students</h3></div>
            {isAdminEquivalent && ["DRAFT", "SCHEDULED"].includes(item.status) && <div className="booking-actions"><button className="secondary" type="button" onClick={onEnrolStudent}>+ Student</button><button className="secondary" type="button" onClick={onEnrolProgramme}>+ Programme</button></div>}
          </div>
          {detail.students.length === 0 ? <p className="muted">No students are enrolled.</p> : (
            <div className="ground-roster">
              {detail.students.map((student) => (
                <div className="ground-roster-row" key={student.student_id}>
                  <div><strong>{student.student_name}</strong><span>{student.student_email}</span></div>
                  <button className="secondary" type="button" onClick={() => onStudentTimeline(student)}>View History</button>
                  {isAdminEquivalent && ["DRAFT", "SCHEDULED"].includes(item.status) && <button className="secondary" type="button" onClick={() => onWithdrawStudent(student)}>Withdraw</button>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="ground-detail-section">
        <div className="booking-section-heading"><div><div className="eyebrow">CLASS MATERIALS</div><h3>Always Available</h3></div>{isStaff && <button className="secondary" type="button" onClick={onAttachFile}>+ Attach File</button>}</div>
        {detail.materials.length === 0 ? <p className="muted">No class materials attached.</p> : (
          <div className="ground-compact-list">{detail.materials.map((material) => <div className="ground-compact-row" key={material.material_id}><div><strong>{material.display_label || material.file_name}</strong><span>{material.required ? "Required" : "Optional"} · {material.file_name}</span></div><div className="booking-actions"><button className="secondary" type="button" onClick={() => onDownload(material)}>Open</button>{isStaff && <button className="secondary" type="button" onClick={() => onDetachFile(material)}>Detach</button>}</div></div>)}</div>
        )}
      </section>

      <section className="ground-detail-section">
        <div className="booking-section-heading"><div><div className="eyebrow">ASSESSMENTS</div><h3>Tests & Quizzes</h3></div>{isStaff && <button className="secondary" type="button" onClick={onAttachTest}>+ Attach Test</button>}</div>
        {detail.tests.length === 0 ? <p className="muted">No published tests are attached.</p> : (
          <div className="ground-compact-list">{detail.tests.map((test) => <div className="ground-compact-row" key={test.assignment_id}><div><strong>{test.title}</strong><span>{test.required ? "Required" : "Optional"} · Pass {formatPercent(test.pass_mark_percent)}{test.due_at ? ` · Due ${formatDate(test.due_at)}` : ""}</span></div>{isStudent && <button className="secondary" type="button" onClick={() => onOpenStudentTest(test)}>Open</button>}</div>)}</div>
        )}
      </section>
    </ModalShell>
  );
}

function SessionDetailModal({ detail, isStudent, isStaff, isAdminEquivalent, busy, onClose, onStart, onComplete, onEdit, onCancel, onAttendance, onClassComment, onStudentComment, onStudentTimeline, onAttachFile, onDetachFile, onDownload }) {
  const session = detail.session;
  const roster = detail.roster ?? [];
  const classComments = detail.class_comments ?? [];
  const studentComments = detail.student_comments ?? [];
  const sessionFiles = detail.session_files ?? [];
  return (
    <ModalShell title={session.class_title} eyebrow="GROUND SESSION" onClose={onClose} busy={busy}>
      <div className="booking-details-grid instructor-booking-details">
        <Detail label="Status" value={humanStatus(session.status)} />
        <Detail label="Date" value={formatDate(session.starts_at)} />
        <Detail label="Time" value={`${formatTime(session.starts_at)} – ${formatTime(session.ends_at)}`} />
        <Detail label="Classroom / location" value={session.display_location} />
        <Detail label="Scheduled instructor" value={session.scheduled_instructor_name} />
        <Detail label="Conducted by" value={session.conducted_by_name || "Not started"} />
      </div>

      {isStaff && (
        <div className="booking-actions ground-modal-actions">
          {session.can_start && <button className="primary" type="button" onClick={() => onStart(session)}>I'm Starting This Class</button>}
          {session.status === "IN_PROGRESS" && <button className="primary" type="button" onClick={() => onComplete(session)}>Complete Ground Session</button>}
          {isAdminEquivalent && session.status === "SCHEDULED" && <button className="secondary" type="button" onClick={() => onEdit({ ...session, ground_session_id: session.id })}>Reschedule</button>}
          {isAdminEquivalent && ["SCHEDULED", "IN_PROGRESS"].includes(session.status) && <button className="danger-button" type="button" onClick={() => onCancel({ ...session, ground_session_id: session.id })}>Cancel</button>}
        </div>
      )}

      {isStaff && (
        <section className="ground-detail-section">
          <div className="booking-section-heading"><div><div className="eyebrow">ATTENDANCE</div><h3>Session Roster</h3></div></div>
          {session.status === "SCHEDULED" ? <p className="muted">Attendance unlocks after an Instructor starts this Ground Session.</p> : roster.length === 0 ? <p className="muted">No students were on the roster snapshot.</p> : (
            <div className="ground-roster ground-session-roster">
              {roster.map((student) => (
                <div className="ground-roster-row ground-session-roster-row" key={student.student_id}>
                  <div><strong>{student.student_name}</strong><span>{student.student_email}</span></div>
                  <select value={student.attendance_status || "PENDING"} disabled={busy} onChange={(event) => onAttendance(student, event.target.value)}>
                    {["PENDING", "PRESENT", "LATE", "ABSENT", "EXCUSED"].map((status) => <option key={status} value={status}>{humanStatus(status)}</option>)}
                  </select>
                  <div className="booking-actions ground-inline-actions">
                    <button className="secondary" type="button" onClick={() => onStudentComment(student, "INTERNAL")}>Internal Note</button>
                    <button className="secondary" type="button" onClick={() => onStudentComment(student, "STUDENT_VISIBLE")}>Feedback</button>
                    <button className="secondary" type="button" onClick={() => onStudentTimeline(student)}>History</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="ground-detail-section">
        <div className="booking-section-heading"><div><div className="eyebrow">CLASS COMMENTS</div><h3>Chronological Session Notes</h3></div>{isStaff && <div className="booking-actions"><button className="secondary" type="button" onClick={() => onClassComment("INTERNAL")}>+ Internal Comment</button><button className="secondary" type="button" onClick={() => onClassComment("STUDENT_VISIBLE")}>+ Student Feedback</button></div>}</div>
        {classComments.length === 0 ? <p className="muted">No class comments yet.</p> : <CommentFeed comments={classComments} isStudent={isStudent} />}
      </section>

      {isStaff && (
        <section className="ground-detail-section">
          <div className="booking-section-heading"><div><div className="eyebrow">STUDENT NOTES</div><h3>Individual Comments</h3></div></div>
          {studentComments.length === 0 ? <p className="muted">No individual student comments yet.</p> : <CommentFeed comments={studentComments} />}
        </section>
      )}

      {!isStaff && studentComments.length > 0 && (
        <section className="ground-detail-section">
          <div className="booking-section-heading"><div><div className="eyebrow">YOUR FEEDBACK</div><h3>Instructor Feedback</h3></div></div>
          <CommentFeed comments={studentComments} isStudent />
        </section>
      )}

      <section className="ground-detail-section">
        <div className="booking-section-heading"><div><div className="eyebrow">SESSION FILES</div><h3>This Class Date</h3></div>{isStaff && <button className="secondary" type="button" onClick={onAttachFile}>+ Attach File</button>}</div>
        {sessionFiles.length === 0 ? <p className="muted">No files are linked specifically to this Ground Session.</p> : <div className="ground-compact-list">{sessionFiles.map((material) => <div className="ground-compact-row" key={material.material_id}><div><strong>{material.display_label || material.file_name}</strong><span>{material.file_name}</span></div><div className="booking-actions"><button className="secondary" type="button" onClick={() => onDownload(material)}>Open</button>{isStaff && <button className="secondary" type="button" onClick={() => onDetachFile(material)}>Detach</button>}</div></div>)}</div>}
      </section>
    </ModalShell>
  );
}

function CommentFeed({ comments }) {
  return (
    <div className="ground-comment-feed">
      {comments.map((comment) => (
        <div className={`ground-comment-item ${comment.visibility === "INTERNAL" ? "internal" : ""}`} key={comment.comment_id}>
          <div><strong>{comment.student_name ? `${comment.student_name} · ` : ""}{comment.visibility === "INTERNAL" ? "Internal" : "Student-visible"}</strong><span>{formatDateTime(comment.created_at)}{comment.created_by_name ? ` · ${comment.created_by_name}` : ""}</span></div>
          <p>{comment.comment_text}</p>
        </div>
      ))}
    </div>
  );
}

function ClassEditorModal({ value, programmes, busy, error, onChange, onClose, onSubmit }) {
  return (
    <ModalShell title={value.id ? "Edit Ground Class" : "Create Ground Class"} eyebrow="CLASS EDITOR" onClose={onClose} busy={busy} width="min(760px, 100%)">
      {error && <div className="login-error booking-message ground-modal-error" role="alert">{error}</div>}
      <form className="ground-form-grid" onSubmit={onSubmit} noValidate>
        <Field label="Class title *"><input value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} /></Field>
        <Field label="Subject"><input value={value.subject} onChange={(event) => onChange({ ...value, subject: event.target.value })} /></Field>
        <Field label="Programme"><select value={value.programmeId} onChange={(event) => onChange({ ...value, programmeId: event.target.value })}><option value="">No programme</option>{programmes.map((item) => <option key={item.programme_id} value={item.programme_id}>{item.name}</option>)}</select></Field>
        <Field label="Capacity"><input type="number" min="1" value={value.capacity} onChange={(event) => onChange({ ...value, capacity: event.target.value })} /></Field>
        <Field label="Minimum required sessions"><input type="number" min="1" value={value.minimumRequiredSessions} onChange={(event) => onChange({ ...value, minimumRequiredSessions: event.target.value })} /><small className="field-note">Leave blank if all scheduled sessions are expected.</small></Field>
        <Field label="Description" wide><textarea value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} /></Field>
        <div className="booking-note ground-field-wide"><strong>Scheduling</strong><p>Create the Ground Class first. Then add individual class dates with a calendar, Instructor, time and classroom/off-site location.</p></div>
        <div className="booking-actions ground-form-actions"><button className="primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Save Class"}</button><button className="secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button></div>
      </form>
    </ModalShell>
  );
}

function SessionEditorModal({ value, instructors, classrooms, busy, error, onChange, onClose, onSubmit }) {
  return (
    <ModalShell title={value.id ? "Reschedule Ground Session" : "Add Ground Session Date"} eyebrow="GROUND SESSION SCHEDULER" onClose={onClose} busy={busy} width="min(780px, 100%)">
      {error && <div className="login-error booking-message ground-modal-error" role="alert">{error}</div>}
      <form className="ground-form-grid" onSubmit={onSubmit} noValidate>
        <Field label="Class date *"><CalendarField value={value.date} onChange={(date) => onChange({ ...value, date })} /></Field>
        <Field label="Instructor *"><select value={value.instructorId} onChange={(event) => onChange({ ...value, instructorId: event.target.value })}><option value="">Choose instructor</option>{instructors.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.display_name || item.email}</option>)}</select></Field>
        <Field label="Start time *"><select value={value.startTime} onChange={(event) => onChange({ ...value, startTime: event.target.value })}>{TIME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
        <Field label="End time *"><select value={value.endTime} onChange={(event) => onChange({ ...value, endTime: event.target.value })}>{TIME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
        <Field label="Location type"><select value={value.locationMode} onChange={(event) => onChange({ ...value, locationMode: event.target.value, classroomId: event.target.value === "CLASSROOM" ? value.classroomId : "", customLocation: event.target.value === "CUSTOM" ? value.customLocation : "" })}><option value="CLASSROOM">Aero classroom</option><option value="CUSTOM">Off-site / custom location</option></select></Field>
        {value.locationMode === "CLASSROOM" ? (
          <Field label="Classroom *"><select value={value.classroomId} onChange={(event) => onChange({ ...value, classroomId: event.target.value })}><option value="">Choose classroom</option>{classrooms.filter((item) => item.active).map((room) => <option key={room.classroom_id} value={room.classroom_id}>{room.name}{room.physical_location ? ` — ${room.physical_location}` : ""}</option>)}</select></Field>
        ) : (
          <Field label="Off-site / custom location *"><input value={value.customLocation} placeholder="e.g. RSAF Museum" onChange={(event) => onChange({ ...value, customLocation: event.target.value })} /></Field>
        )}
        <div className="booking-note ground-field-wide"><strong>Conflict protection</strong><p>AeroPath blocks overlapping Instructor, classroom and enrolled-student schedules. The 24-hour reminder is fixed for now.</p></div>
        <div className="booking-actions ground-form-actions"><button className="primary" type="submit" disabled={busy}>{busy ? "Saving..." : value.id ? "Save Changes" : "Add Class Date"}</button><button className="secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button></div>
      </form>
    </ModalShell>
  );
}

function CalendarField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const initial = value ? new Date(`${value}T12:00:00`) : new Date();
  const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month, index - mondayIndex + 1);
    const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { date, dateValue, currentMonth: date.getMonth() === month };
  });
  return (
    <div className="aero-calendar-field">
      <button className="aero-calendar-trigger" type="button" onClick={() => setOpen((current) => !current)}><span>{value ? formatDate(value) : "Choose date"}</span><span aria-hidden="true">▾</span></button>
      {open && (
        <div className="aero-calendar-popover">
          <div className="aero-calendar-header">
            <button type="button" onClick={() => setView(new Date(year, month - 1, 1))}>‹</button>
            <strong>{new Intl.DateTimeFormat("en-SG", { month: "long", year: "numeric" }).format(view)}</strong>
            <button type="button" onClick={() => setView(new Date(year, month + 1, 1))}>›</button>
          </div>
          <div className="aero-calendar-weekdays">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
          <div className="aero-calendar-grid">
            {cells.map((cell) => <button key={cell.dateValue} type="button" className={`${cell.currentMonth ? "" : "outside"} ${value === cell.dateValue ? "selected" : ""}`} onClick={() => { onChange(cell.dateValue); setOpen(false); }}>{cell.date.getDate()}</button>)}
          </div>
          <button className="aero-calendar-today" type="button" onClick={() => { const today = toDateValue(new Date()); onChange(today); setView(new Date()); setOpen(false); }}>Today</button>
        </div>
      )}
    </div>
  );
}

function ClassroomManagerModal({ value, classrooms, busy, onChange, onEdit, onNew, onClose, onSubmit }) {
  return (
    <ModalShell title="Ground Classrooms" eyebrow="CLASSROOM MANAGEMENT" onClose={onClose} busy={busy} width="min(820px, 100%)">
      <div className="ground-classroom-grid">
        {classrooms.map((room) => <button className={`ground-classroom-card ${value.id === room.classroom_id ? "active" : ""}`} key={room.classroom_id} type="button" onClick={() => onEdit(room)}><strong>{room.name}</strong><span>{room.physical_location || "Physical location not set"}</span><small>{room.active ? "Active" : "Inactive"}</small></button>)}
      </div>
      <form className="ground-form-grid ground-detail-section" onSubmit={onSubmit}>
        <Field label="Classroom name *"><input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} /></Field>
        <Field label="Physical location"><input value={value.physicalLocation} placeholder="e.g. Level 2, Room 03" onChange={(event) => onChange({ ...value, physicalLocation: event.target.value })} /></Field>
        <Field label="Active"><select value={value.active ? "YES" : "NO"} onChange={(event) => onChange({ ...value, active: event.target.value === "YES" })}><option value="YES">Yes</option><option value="NO">No</option></select></Field>
        <Field label="Description" wide><textarea value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} /></Field>
        <div className="booking-actions ground-form-actions"><button className="primary" type="submit" disabled={busy}>{value.id ? "Save Classroom" : "Create Classroom"}</button><button className="secondary" type="button" onClick={onNew}>+ New Classroom</button></div>
      </form>
    </ModalShell>
  );
}

function StudentTimelineModal({ value, onClose }) {
  const operationalCount = value.operationalRecords?.length ?? 0;
  return (
    <ModalShell title={value.student.student_name || value.student.full_name || "Student"} eyebrow="STUDENT TRAINING TIMELINE" onClose={onClose}>
      <div className="ground-progress-grid">
        {value.progress.map((item) => <div className="ground-progress-card" key={item.programme_id}><strong>{item.programme_name}</strong><span>{item.completed_sessions}/{item.scheduled_sessions} Ground Sessions completed</span><span>{item.present_sessions} present · {item.late_sessions} late · {item.absent_sessions} absent</span><b>{formatPercent(item.attendance_percent)} attendance</b></div>)}
        <div className="ground-progress-card"><strong>Operational Training</strong><span>{operationalCount > 0 ? `${operationalCount} training record(s)` : "Not started"}</span><small>Simulator and flight records are split in Training History.</small></div>
      </div>
      <section className="ground-detail-section"><div className="booking-section-heading"><div><div className="eyebrow">CHRONOLOGICAL NOTES</div><h3>Ground School & Tests</h3></div></div>{value.timeline.length === 0 ? <p className="muted">No Ground School history yet.</p> : <TimelineList items={value.timeline} />}</section>
    </ModalShell>
  );
}

function Field({ label, children, wide = false }) {
  return <div className={`booking-field ${wide ? "ground-field-wide" : ""}`}><label>{label}</label>{children}</div>;
}

function TestLibrary({ tests, onOpen, onAssign, onDuplicate }) {
  if (tests.length === 0) return <div className="admin-empty">No tests have been created.</div>;
  return (
    <div className="student-booking-list">
      {tests.map((test) => (
        <article className="student-booking-card" key={test.test_id}>
          <div className="student-booking-header">
            <div>
              <h3>{test.title}</h3>
              <p>{test.programme_name || "General knowledge"}</p>
            </div>
            <span className={`booking-status ${statusClass(test.test_status)}`}>{humanStatus(test.test_status)}</span>
          </div>
          <div className="booking-details-grid instructor-booking-details">
            <Detail label="Questions" value={String(test.question_count)} />
            <Detail label="Pass mark" value={formatPercent(test.pass_mark_percent)} />
            <Detail label="Time limit" value={test.time_limit_minutes ? `${test.time_limit_minutes} min` : "None"} />
            <Detail label="Assignments" value={String(test.active_assignment_count)} />
          </div>
          <div className="booking-actions">
            <button className="primary" type="button" onClick={() => onOpen(test.test_id)}>Open Test</button>
            {test.test_status === "PUBLISHED" && <button className="secondary" type="button" onClick={() => onAssign(test.test_id)}>Assign</button>}
            <button className="secondary" type="button" onClick={() => onDuplicate(test)}>Duplicate</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function StudentTests({ assignments, onOpen }) {
  if (assignments.length === 0) return <div className="admin-empty">No tests are currently assigned to you.</div>;
  return (
    <div className="student-booking-list">
      {assignments.map((item) => {
        const inProgress = item.latest_attempt_status === "IN_PROGRESS";
        const resultReady = item.latest_result_released;
        return (
          <article className="student-booking-card" key={item.assignment_id}>
            <div className="student-booking-header">
              <div>
                <h3>{item.title}</h3>
                <p>{item.ground_class_title || item.programme_name || "Assigned knowledge test"}</p>
              </div>
              <span className={`booking-status ${resultReady ? (item.latest_passed ? "approved" : "rejected") : inProgress ? "requested" : ""}`}>
                {resultReady ? (item.latest_passed ? "PASSED" : "NOT PASSED") : inProgress ? "IN PROGRESS" : item.latest_attempt_status ? humanStatus(item.latest_attempt_status) : "ASSIGNED"}
              </span>
            </div>
            <div className="booking-details-grid instructor-booking-details">
              <Detail label="Available" value={formatDateTime(item.available_from)} />
              <Detail label="Due" value={formatDateTime(item.due_at)} />
              <Detail label="Pass mark" value={formatPercent(item.pass_mark_percent)} />
              <Detail label="Attempts" value={`${item.attempts_started}/${item.allowed_attempts ?? "∞"}`} />
              {resultReady && <Detail label="Latest score" value={formatPercent(item.latest_percentage)} />}
            </div>
            <div className="booking-actions">
              {item.latest_attempt_id && (
                <button className={inProgress ? "primary" : "secondary"} type="button" onClick={() => onOpen(item, false)}>
                  {inProgress ? "Resume Test" : resultReady ? "View Result" : "View Latest Attempt"}
                </button>
              )}
              {item.can_start && !inProgress && (
                <button className="primary" type="button" onClick={() => onOpen(item, true)}>
                  {item.latest_attempt_id ? "Start New Attempt" : "Start Test"}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ReviewQueue({ attempts, onOpen }) {
  if (attempts.length === 0) return <div className="admin-empty">No test attempts are available for review.</div>;
  return (
    <div className="student-booking-list">
      {attempts.map((item) => (
        <article className="student-booking-card" key={item.attempt_id}>
          <div className="student-booking-header">
            <div>
              <h3>{item.test_title}</h3>
              <p>{item.student_name} · Attempt {item.attempt_number}</p>
            </div>
            <span className={`booking-status ${statusClass(item.attempt_status)}`}>{humanStatus(item.attempt_status)}</span>
          </div>
          <div className="booking-details-grid instructor-booking-details">
            <Detail label="Class" value={item.ground_class_title || "Direct / programme assignment"} />
            <Detail label="Submitted" value={formatDateTime(item.submitted_at)} />
            <Detail label="Score" value={item.percentage == null ? "Awaiting grading" : formatPercent(item.percentage)} />
            <Detail label="Released" value={item.result_released ? "Yes" : "No"} />
          </div>
          <div className="booking-actions">
            <button className={item.can_grade ? "primary" : "secondary"} type="button" onClick={() => onOpen(item.attempt_id)}>
              {item.can_grade ? "Grade Attempt" : "View Attempt"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function TestEditorModal({ editor, programmes, students, classes, busy, onChange, onClose, onSave, onAddQuestion, onEditQuestion, onDeleteQuestion, onPublish, onArchive, onAssign }) {
  const test = editor.test;
  const isDraft = test.status === "DRAFT";
  return (
    <ModalShell title={test.title} eyebrow="TEST EDITOR" onClose={onClose} busy={busy}>
      <div className="student-booking-header">
        <p className="muted">{isDraft ? "Draft tests are editable. Publishing locks the question content." : "Published/archived tests are immutable; duplicate to create an editable version."}</p>
        <span className={`booking-status ${statusClass(test.status)}`}>{humanStatus(test.status)}</span>
      </div>
      <form className="ground-form-grid" onSubmit={onSave}>
        <Field label="Title *"><input disabled={!isDraft} value={test.title ?? ""} onChange={(event) => onChange({ ...test, title: event.target.value })} /></Field>
        <Field label="Programme"><select disabled={!isDraft} value={test.programme_id ?? ""} onChange={(event) => onChange({ ...test, programme_id: event.target.value || null })}><option value="">No programme</option>{programmes.map((item) => <option key={item.programme_id} value={item.programme_id}>{item.name}</option>)}</select></Field>
        <Field label="Pass mark (%)"><input disabled={!isDraft} type="number" min="0" max="100" value={test.pass_mark_percent ?? 75} onChange={(event) => onChange({ ...test, pass_mark_percent: event.target.value })} /></Field>
        <Field label="Time limit (minutes)"><input disabled={!isDraft} type="number" min="1" value={test.time_limit_minutes ?? ""} onChange={(event) => onChange({ ...test, time_limit_minutes: event.target.value })} /></Field>
        <Field label="Maximum attempts"><input disabled={!isDraft} type="number" min="1" value={test.max_attempts ?? ""} onChange={(event) => onChange({ ...test, max_attempts: event.target.value })} /></Field>
        <Field label="Randomise questions"><select disabled={!isDraft} value={test.randomize_questions ? "YES" : "NO"} onChange={(event) => onChange({ ...test, randomize_questions: event.target.value === "YES" })}><option value="NO">No</option><option value="YES">Yes</option></select></Field>
        <Field label="Randomise answers"><select disabled={!isDraft} value={test.randomize_answers ? "YES" : "NO"} onChange={(event) => onChange({ ...test, randomize_answers: event.target.value === "YES" })}><option value="NO">No</option><option value="YES">Yes</option></select></Field>
        <Field label="Immediate objective results"><select disabled={!isDraft} value={test.release_results_immediately ? "YES" : "NO"} onChange={(event) => onChange({ ...test, release_results_immediately: event.target.value === "YES" })}><option value="YES">Yes</option><option value="NO">No</option></select></Field>
        <Field label="Description" wide><textarea disabled={!isDraft} value={test.description ?? ""} onChange={(event) => onChange({ ...test, description: event.target.value })} /></Field>
        {isDraft && <div className="booking-actions ground-form-actions"><button className="secondary" type="submit" disabled={busy}>Save Settings</button></div>}
      </form>

      <section className="ground-detail-section">
        <div className="booking-section-heading"><div><div className="eyebrow">QUESTION BANK</div><h3>{editor.questions.length} Questions</h3></div>{isDraft && <button className="primary" type="button" onClick={onAddQuestion}>+ Add Question</button>}</div>
        {editor.questions.length === 0 ? <p className="muted">Add at least one valid question before publishing.</p> : (
          <div className="ground-compact-list">
            {editor.questions.map((question) => (
              <div className="ground-question-card" key={question.question_id}>
                <div><span className="eyebrow">Q{question.position} · {humanStatus(question.question_type)} · {question.points} pt</span><strong>{question.prompt}</strong></div>
                {question.question_type !== "SHORT_TEXT" && <ol>{question.options.map((option) => <li key={option.option_id} className={option.is_correct ? "ground-correct-option" : ""}>{option.label}{option.is_correct ? " ✓" : ""}</li>)}</ol>}
                {isDraft && <div className="booking-actions"><button className="secondary" type="button" onClick={() => onEditQuestion(question)}>Edit</button><button className="danger-button" type="button" onClick={() => onDeleteQuestion(question)}>Delete</button></div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ground-detail-section">
        <div className="booking-section-heading"><div><div className="eyebrow">ASSIGNMENTS</div><h3>{editor.assignments.filter((item) => item.active).length} Active</h3></div>{test.status === "PUBLISHED" && <button className="secondary" type="button" onClick={onAssign}>+ Assign</button>}</div>
        {editor.assignments.length === 0 ? <p className="muted">No assignments yet.</p> : <div className="ground-compact-list">{editor.assignments.map((assignment) => <div className="ground-compact-row" key={assignment.assignment_id}><div><strong>{assignmentTargetLabel(assignment, students, programmes, classes)}</strong><span>{assignment.required ? "Required" : "Optional"} · {humanStatus(assignment.availability_mode)}</span></div><span className={`booking-status ${assignment.active ? "approved" : "cancelled"}`}>{assignment.active ? "ACTIVE" : "INACTIVE"}</span></div>)}</div>}
      </section>

      <div className="booking-actions ground-modal-actions">
        {isDraft && <button className="primary" type="button" disabled={busy || editor.questions.length === 0} onClick={onPublish}>Publish Test</button>}
        {test.status === "PUBLISHED" && <button className="secondary" type="button" onClick={onAssign}>Assign Test</button>}
        {test.status === "PUBLISHED" && <button className="danger-button" type="button" onClick={onArchive}>Archive Test</button>}
      </div>
    </ModalShell>
  );
}

function assignmentTargetLabel(assignment, students, programmes, classes) {
  if (assignment.student_id) {
    const student = students.find((item) => item.student_id === assignment.student_id);
    return student?.display_name || student?.full_name || student?.email || "Student assignment";
  }
  if (assignment.programme_id) {
    const programme = programmes.find((item) => item.programme_id === assignment.programme_id);
    return programme?.name ? `${programme.name} programme` : "Programme assignment";
  }
  if (assignment.ground_class_id) {
    const groundClass = classes.find((item) => item.ground_class_id === assignment.ground_class_id);
    return groundClass?.title || "Ground class assignment";
  }
  return "Assignment";
}


function AssignmentEditorModal({ value, students, programmes, classes, busy, onChange, onClose, onSubmit }) {
  const targetOptions = value.targetType === "STUDENT"
    ? students.map((item) => ({ value: item.student_id, label: item.display_name || item.full_name || item.email }))
    : value.targetType === "PROGRAMME"
      ? programmes.map((item) => ({ value: item.programme_id, label: item.name }))
      : classes.filter((item) => ["DRAFT", "SCHEDULED"].includes(item.class_status)).map((item) => ({ value: item.ground_class_id, label: item.title }));

  return (
    <ModalShell title="Assign Published Test" eyebrow="TEST ASSIGNMENT" onClose={onClose} busy={busy} width="min(760px, 100%)">
      <form className="ground-form-grid" onSubmit={onSubmit}>
        {value.publishedTests && (
          <Field label="Published test *">
            <select value={value.selectedTestId ?? ""} onChange={(event) => onChange({ ...value, selectedTestId: event.target.value })}>
              <option value="">Choose test</option>
              {value.publishedTests.map((test) => <option key={test.test_id} value={test.test_id}>{test.title}</option>)}
            </select>
          </Field>
        )}
        <Field label="Assign to">
          <select disabled={value.lockedTarget} value={value.targetType} onChange={(event) => onChange({ ...value, targetType: event.target.value, targetId: "" })}>
            <option value="STUDENT">Student</option>
            <option value="PROGRAMME">Programme</option>
            <option value="CLASS">Ground class</option>
          </select>
        </Field>
        <Field label="Target *">
          <select disabled={value.lockedTarget} value={value.targetId} onChange={(event) => onChange({ ...value, targetId: event.target.value })}>
            <option value="">Choose target</option>
            {targetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label="Availability">
          <select value={value.availability} onChange={(event) => onChange({ ...value, availability: event.target.value })}>
            <option value="IMMEDIATE">Immediate</option>
            <option value="SCHEDULED">Specific date</option>
          </select>
        </Field>
        {value.availability === "SCHEDULED" && <Field label="Available from"><CalendarField value={value.availableFrom} onChange={(date) => onChange({ ...value, availableFrom: date })} /></Field>}
        <Field label="Due date"><CalendarField value={value.dueAt} onChange={(date) => onChange({ ...value, dueAt: date })} /></Field>
        <Field label="Attempt limit override"><input type="number" min="1" value={value.maxAttempts} onChange={(event) => onChange({ ...value, maxAttempts: event.target.value })} /></Field>
        <Field label="Required"><select value={value.required ? "YES" : "NO"} onChange={(event) => onChange({ ...value, required: event.target.value === "YES" })}><option value="YES">Yes</option><option value="NO">No</option></select></Field>
        <Field label="Pass required"><select value={value.requiresPass ? "YES" : "NO"} onChange={(event) => onChange({ ...value, requiresPass: event.target.value === "YES" })}><option value="NO">No</option><option value="YES">Yes</option></select></Field>
        <div className="booking-note ground-field-wide"><strong>Date handling</strong><p>Tests are assigned by date only. AeroPath records the exact time/date when each student actually starts and submits an attempt.</p></div>
        <div className="booking-actions ground-form-actions"><button className="primary" type="submit" disabled={busy}>Create Assignment</button><button className="secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button></div>
      </form>
    </ModalShell>
  );
}

function QuestionEditorModal({ value, busy, onChange, onClose, onSubmit }) {
  const isShort = value.type === "SHORT_TEXT";
  const isTrueFalse = value.type === "TRUE_FALSE";

  useEffect(() => {
    if (isTrueFalse && (value.options.length !== 2 || value.options[0]?.label !== "True" || value.options[1]?.label !== "False")) {
      onChange({ ...value, options: [{ label: "True", isCorrect: true }, { label: "False", isCorrect: false }] });
    }
  }, [value.type]);

  function changeOption(index, patch) {
    const options = value.options.map((option, i) => i === index ? { ...option, ...patch } : option);
    if (["SINGLE_CHOICE", "TRUE_FALSE"].includes(value.type) && patch.isCorrect) {
      options.forEach((option, i) => { option.isCorrect = i === index; });
    }
    onChange({ ...value, options });
  }

  return (
    <ModalShell title={value.questionId ? "Edit Question" : "Add Question"} eyebrow="TEST AUTHORING" onClose={onClose} busy={busy} width="min(760px, 100%)">
      <form onSubmit={onSubmit}>
        <div className="ground-form-grid">
          <Field label="Question type"><select value={value.type} onChange={(event) => onChange({ ...value, type: event.target.value, options: event.target.value === "TRUE_FALSE" ? [{ label: "True", isCorrect: true }, { label: "False", isCorrect: false }] : event.target.value === "SHORT_TEXT" ? [] : value.options.length >= 2 ? value.options : [{ label: "", isCorrect: true }, { label: "", isCorrect: false }] })}><option value="SINGLE_CHOICE">Multiple choice — one answer</option><option value="MULTI_CHOICE">Multiple choice — multiple answers</option><option value="TRUE_FALSE">True / False</option><option value="SHORT_TEXT">Short written answer</option></select></Field>
          <Field label="Position"><input type="number" min="1" value={value.position} onChange={(event) => onChange({ ...value, position: event.target.value })} /></Field>
          <Field label="Points"><input type="number" min="0.01" step="0.01" value={value.points} onChange={(event) => onChange({ ...value, points: event.target.value })} /></Field>
          <Field label="Question *" wide><textarea value={value.prompt} onChange={(event) => onChange({ ...value, prompt: event.target.value })} /></Field>
        </div>

        {!isShort && (
          <section className="ground-detail-section">
            <div className="booking-section-heading"><div><div className="eyebrow">ANSWER KEY</div><h3>Options</h3></div>{!isTrueFalse && <button className="secondary" type="button" onClick={() => onChange({ ...value, options: [...value.options, { label: "", isCorrect: false }] })}>+ Option</button>}</div>
            <div className="ground-option-editor">
              {value.options.map((option, index) => (
                <div className="ground-option-row" key={index}>
                  <input value={option.label} disabled={isTrueFalse} placeholder={`Option ${index + 1}`} onChange={(event) => changeOption(index, { label: event.target.value })} />
                  <label className="ground-check-label"><input type={value.type === "MULTI_CHOICE" ? "checkbox" : "radio"} name="correct-answer" checked={Boolean(option.isCorrect)} onChange={() => changeOption(index, { isCorrect: value.type === "MULTI_CHOICE" ? !option.isCorrect : true })} /> Correct</label>
                  {!isTrueFalse && value.options.length > 2 && <button className="secondary" type="button" onClick={() => onChange({ ...value, options: value.options.filter((_, i) => i !== index) })}>Remove</button>}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="booking-actions ground-form-actions"><button className="primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Save Question"}</button><button className="secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button></div>
      </form>
    </ModalShell>
  );
}

function StudentAttemptModal({ detail, busy, onClose, onError, onSubmit }) {
  const [answers, setAnswers] = useState(() => buildAnswerState(detail));
  const [saveState, setSaveState] = useState("");
  const timers = useRef(new Map());
  const editable = detail.attempt.can_edit;

  useEffect(() => {
    setAnswers(buildAnswerState(detail));
  }, [detail.attempt.attempt_id]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
  }, []);

  function scheduleSave(question, nextAnswer) {
    if (!editable) return;
    const existing = timers.current.get(question.question_id);
    if (existing) window.clearTimeout(existing);
    setSaveState("Saving...");
    const timer = window.setTimeout(async () => {
      try {
        await rpc("save_knowledge_test_answer_v1", {
          target_attempt_id: detail.attempt.attempt_id,
          target_question_id: question.question_id,
          selected_option_ids: nextAnswer.selected,
          written_answer: nextAnswer.text || null,
        });
        setSaveState("Saved");
      } catch (err) {
        setSaveState("Save failed");
        onError(err?.message || "Unable to save answer.");
      }
    }, 450);
    timers.current.set(question.question_id, timer);
  }

  function updateAnswer(question, updater) {
    setAnswers((current) => {
      const previous = current[question.question_id] ?? { selected: [], text: "" };
      const next = updater(previous);
      scheduleSave(question, next);
      return { ...current, [question.question_id]: next };
    });
  }

  const resultVisible = detail.attempt.result_released;
  return (
    <ModalShell title={detail.test.title} eyebrow={`TEST ATTEMPT ${detail.attempt.attempt_number}`} onClose={onClose} busy={busy}>
      <div className="booking-details-grid instructor-booking-details">
        <Detail label="Status" value={humanStatus(detail.attempt.status)} />
        <Detail label="Pass mark" value={formatPercent(detail.test.pass_mark_percent)} />
        <Detail label="Deadline" value={formatDateTime(detail.attempt.deadline_at)} />
        <Detail label="Autosave" value={saveState || (editable ? "Ready" : "Locked")} />
        {resultVisible && <Detail label="Score" value={formatPercent(detail.attempt.percentage)} />}
        {resultVisible && <Detail label="Result" value={detail.attempt.passed ? "Pass" : "Not passed"} />}
      </div>
      {detail.attempt.overall_feedback && <div className="booking-note"><strong>Overall feedback</strong><p>{detail.attempt.overall_feedback}</p></div>}

      <div className="ground-attempt-questions">
        {detail.questions.map((question, index) => {
          const answer = answers[question.question_id] ?? { selected: [], text: "" };
          return (
            <article className="ground-attempt-question" key={question.question_id}>
              <div className="eyebrow">QUESTION {index + 1} · {question.points} POINTS</div>
              <h3>{question.prompt}</h3>
              {question.question_type === "SHORT_TEXT" ? (
                <textarea disabled={!editable} value={answer.text} placeholder="Type your answer" onChange={(event) => updateAnswer(question, (previous) => ({ ...previous, text: event.target.value }))} />
              ) : (
                <div className="ground-answer-options">
                  {question.options.map((option) => {
                    const checked = answer.selected.includes(option.option_id);
                    const multi = question.question_type === "MULTI_CHOICE";
                    return (
                      <label className={`ground-answer-option ${resultVisible && option.is_correct ? "correct" : ""}`} key={option.option_id}>
                        <input
                          disabled={!editable}
                          type={multi ? "checkbox" : "radio"}
                          name={multi ? undefined : `question-${question.question_id}`}
                          checked={checked}
                          onChange={() => updateAnswer(question, (previous) => ({
                            ...previous,
                            selected: multi
                              ? checked ? previous.selected.filter((id) => id !== option.option_id) : [...previous.selected, option.option_id]
                              : [option.option_id],
                          }))}
                        />
                        <span>{option.label}</span>
                        {resultVisible && option.is_correct && <strong>Correct answer</strong>}
                      </label>
                    );
                  })}
                </div>
              )}
              {resultVisible && question.answer && (
                <div className="booking-note"><strong>Awarded</strong><p>{question.answer.awarded_points ?? 0} / {question.points} points{question.answer.feedback ? ` · ${question.answer.feedback}` : ""}</p></div>
              )}
            </article>
          );
        })}
      </div>

      <div className="booking-actions ground-modal-actions">
        {editable && <button className="primary" type="button" onClick={onSubmit}>Submit Test</button>}
        <button className="secondary" type="button" onClick={onClose}>{editable ? "Save & Close" : "Close"}</button>
      </div>
    </ModalShell>
  );
}

function buildAnswerState(detail) {
  const state = {};
  for (const question of detail.questions ?? []) {
    state[question.question_id] = {
      selected: question.answer?.selected_option_ids ?? [],
      text: question.answer?.text_answer ?? "",
    };
  }
  return state;
}

function GradingModal({ detail, busy, onClose, onGrade, onRelease }) {
  const written = detail.questions.filter((question) => question.question_type === "SHORT_TEXT");
  const [grades, setGrades] = useState(() => Object.fromEntries(written.map((question) => [question.question_id, { points: question.answer?.awarded_points ?? "", feedback: question.answer?.feedback ?? "" }])));
  const [overallFeedback, setOverallFeedback] = useState(detail.attempt.overall_feedback ?? "");
  const [releaseResult, setReleaseResult] = useState(true);
  const canGrade = detail.attempt.status === "PENDING_REVIEW";

  function submit(event) {
    event.preventDefault();
    const payload = [];
    for (const question of written) {
      const current = grades[question.question_id] ?? {};
      const points = Number(current.points);
      if (!Number.isFinite(points) || points < 0 || points > Number(question.points)) return;
      payload.push({ question_id: question.question_id, awarded_points: points, feedback: current.feedback || null });
    }
    onGrade({ grades: payload, overallFeedback, releaseResult });
  }

  return (
    <ModalShell title={detail.test.title} eyebrow="STAFF TEST REVIEW" onClose={onClose} busy={busy}>
      <div className="booking-details-grid instructor-booking-details">
        <Detail label="Status" value={humanStatus(detail.attempt.status)} />
        <Detail label="Attempt" value={String(detail.attempt.attempt_number)} />
        <Detail label="Max score" value={String(detail.attempt.max_score)} />
        <Detail label="Released" value={detail.attempt.result_released ? "Yes" : "No"} />
        {detail.attempt.percentage != null && <Detail label="Score" value={formatPercent(detail.attempt.percentage)} />}
      </div>

      <form onSubmit={submit}>
        <div className="ground-attempt-questions">
          {detail.questions.map((question, index) => (
            <article className="ground-attempt-question" key={question.question_id}>
              <div className="eyebrow">QUESTION {index + 1} · {humanStatus(question.question_type)}</div>
              <h3>{question.prompt}</h3>
              {question.question_type === "SHORT_TEXT" ? (
                <>
                  <div className="booking-note"><strong>Student response</strong><p>{question.answer?.text_answer || "No written response."}</p></div>
                  {canGrade && (
                    <div className="ground-form-grid">
                      <Field label={`Awarded points (max ${question.points})`}><input type="number" min="0" max={question.points} step="0.01" value={grades[question.question_id]?.points ?? ""} onChange={(event) => setGrades((current) => ({ ...current, [question.question_id]: { ...current[question.question_id], points: event.target.value } }))} /></Field>
                      <Field label="Feedback"><textarea value={grades[question.question_id]?.feedback ?? ""} onChange={(event) => setGrades((current) => ({ ...current, [question.question_id]: { ...current[question.question_id], feedback: event.target.value } }))} /></Field>
                    </div>
                  )}
                </>
              ) : (
                <div className="ground-answer-options">{question.options.map((option) => <div className={`ground-answer-option ${option.is_correct ? "correct" : ""}`} key={option.option_id}><span>{option.label}</span>{option.is_correct && <strong>Correct</strong>}</div>)}</div>
              )}
              {question.answer?.awarded_points != null && <p className="muted">Awarded: {question.answer.awarded_points} / {question.points}</p>}
            </article>
          ))}
        </div>
        {canGrade && (
          <>
            <Field label="Overall feedback"><textarea value={overallFeedback} onChange={(event) => setOverallFeedback(event.target.value)} /></Field>
            <Field label="Release result after grading"><select value={releaseResult ? "YES" : "NO"} onChange={(event) => setReleaseResult(event.target.value === "YES")}><option value="YES">Yes</option><option value="NO">No — hold for later release</option></select></Field>
            <div className="booking-actions ground-modal-actions"><button className="primary" type="submit" disabled={busy}>Grade Attempt</button></div>
          </>
        )}
      </form>
      {!canGrade && detail.attempt.status === "GRADED" && !detail.attempt.result_released && <div className="booking-actions ground-modal-actions"><button className="primary" type="button" onClick={onRelease}>Release Result</button></div>}
    </ModalShell>
  );
}
