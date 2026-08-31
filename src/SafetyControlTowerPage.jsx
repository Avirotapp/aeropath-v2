import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "./lib/supabase";
import ModuleEmblem from "./ModuleEmblem";


const REPORT_TYPES = [
  "INCIDENT",
  "ACCIDENT",
  "OCCURRENCE",
  "OSHE",
];

const REPORT_STATUSES = [
  "UNDER_REVIEW",
  "INVESTIGATING",
  "ACTION_REQUIRED",
  "CLOSED",
];

const LIKELIHOODS = ["5", "4", "3", "2", "1"];
const SEVERITIES = ["A", "B", "C", "D", "E"];


async function submitSafetyReport(form) {
  const { data, error } = await supabase.rpc(
    "submit_safety_report",
    {
      submitted_report_type: form.reportType,
      submitted_title: form.title,
      submitted_description: form.description,
      submitted_event_time: form.eventTime
        ? new Date(form.eventTime).toISOString()
        : null,
      submitted_location: form.location,
      submitted_persons_involved: form.personsInvolved,
      submitted_immediate_actions: form.immediateActions,
    }
  );

  if (error) throw error;
  return data;
}


async function listMySafetyReports() {
  const { data, error } = await supabase.rpc(
    "list_my_safety_reports"
  );

  if (error) throw error;
  return data ?? [];
}


async function listOperationalReports() {
  const { data, error } = await supabase.rpc(
    "safety_list_reports"
  );

  if (error) throw error;
  return data ?? [];
}


async function listSafetyManagers() {
  const { data, error } = await supabase.rpc(
    "safety_list_managers"
  );

  if (error) throw error;
  return data ?? [];
}


async function listRiskMatrix() {
  const { data, error } = await supabase
    .from("safety_risk_matrix")
    .select("*");

  if (error) throw error;
  return data ?? [];
}


async function assignSafetyManager(reportId, managerId) {
  const { error } = await supabase.rpc(
    "safety_assign_manager",
    {
      target_report_id: reportId,
      target_manager_id: managerId,
    }
  );

  if (error) throw error;
}


async function assessRisk(reportId, likelihood, severity, notes) {
  const { data, error } = await supabase.rpc(
    "safety_assess_risk",
    {
      target_report_id: reportId,
      assessed_likelihood: likelihood,
      assessed_severity: severity,
      assessment_notes: notes,
    }
  );

  if (error) throw error;
  return data;
}


async function setReportStatus(reportId, status, notes) {
  const { error } = await supabase.rpc(
    "safety_set_report_status",
    {
      target_report_id: reportId,
      new_report_status: status,
      status_notes: notes,
    }
  );

  if (error) throw error;
}


async function createSafetyAction(reportId, form) {
  const { data, error } = await supabase.rpc(
    "safety_create_action",
    {
      target_report_id: reportId,
      action_title: form.title,
      action_description: form.description,
      assigned_user_id: form.assignedTo || null,
      action_due_at: form.dueAt
        ? new Date(form.dueAt).toISOString()
        : null,
    }
  );

  if (error) throw error;
  return data;
}


async function updateSafetyAction(actionId, status, notes) {
  const { error } = await supabase.rpc(
    "safety_update_action_status",
    {
      target_action_id: actionId,
      new_action_status: status,
      action_notes: notes,
    }
  );

  if (error) throw error;
}


async function listSafetyActions(reportId) {
  const { data, error } = await supabase.rpc(
    "safety_list_actions",
    {
      target_report_id: reportId,
    }
  );

  if (error) throw error;
  return data ?? [];
}


async function listSafetyEvents(reportId) {
  const { data, error } = await supabase.rpc(
    "safety_list_report_events",
    {
      target_report_id: reportId,
    }
  );

  if (error) throw error;
  return data ?? [];
}


export default function SafetyControlTowerPage({
  role,
  onBack,
  onSignOut,
}) {
  const operational = [
    "ADMIN",
    "SAFETY_MANAGER",
  ].includes(role);

  const [reports, setReports] = useState([]);
  const [managers, setManagers] = useState([]);
  const [riskMatrix, setRiskMatrix] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [actions, setActions] = useState([]);
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const [submitForm, setSubmitForm] = useState({
    reportType: "OCCURRENCE",
    title: "",
    description: "",
    eventTime: "",
    location: "",
    personsInvolved: "",
    immediateActions: "",
  });

  const [riskForm, setRiskForm] = useState({
    likelihood: "3",
    severity: "C",
    notes: "",
  });

  const [actionForm, setActionForm] = useState({
    title: "",
    description: "",
    assignedTo: "",
    dueAt: "",
  });

  const [reportStatusForm, setReportStatusForm] = useState({
    status: "UNDER_REVIEW",
    notes: "",
  });

  const [actionStatusDrafts, setActionStatusDrafts] = useState({});


  async function loadReports(preferredId = null) {
    try {
      setLoading(true);
      setError("");

      const reportData = operational
        ? await listOperationalReports()
        : await listMySafetyReports();

      setReports(reportData);

      const nextId =
        preferredId ??
        selectedReportId ??
        reportData?.[0]?.report_id ??
        null;

      setSelectedReportId(nextId);

      if (operational) {
        const [managerData, matrixData] = await Promise.all([
          listSafetyManagers(),
          listRiskMatrix(),
        ]);

        setManagers(managerData);
        setRiskMatrix(matrixData);
      }
    } catch (err) {
      console.error("Failed to load safety data:", err);
      setError(
        err?.message ||
          "Unable to load Safety Control Tower data."
      );
    } finally {
      setLoading(false);
    }
  }


  async function loadReportDetail(reportId) {
    if (!reportId) {
      setActions([]);
      setEvents([]);
      return;
    }

    try {
      setDetailLoading(true);
      setError("");

      const [actionData, eventData] = await Promise.all([
        listSafetyActions(reportId),
        listSafetyEvents(reportId),
      ]);

      setActions(actionData);
      setEvents(eventData);
    } catch (err) {
      console.error("Failed to load safety report detail:", err);
      setError(
        err?.message ||
          "Unable to load safety report details."
      );
    } finally {
      setDetailLoading(false);
    }
  }


  useEffect(() => {
    loadReports();
  }, []);


  useEffect(() => {
    loadReportDetail(selectedReportId);
  }, [selectedReportId]);


  const selectedReport = useMemo(
    () =>
      reports.find(
        (report) =>
          report.report_id === selectedReportId
      ) ?? null,
    [reports, selectedReportId]
  );


  useEffect(() => {
    if (!selectedReport) return;

    setReportStatusForm({
      status:
        selectedReport.status === "SUBMITTED"
          ? "UNDER_REVIEW"
          : selectedReport.status === "CLOSED"
            ? "CLOSED"
            : selectedReport.status,
      notes: "",
    });
  }, [selectedReportId, selectedReport?.status]);


  useEffect(() => {
    setActionStatusDrafts((current) => {
      const next = { ...current };

      for (const action of actions) {
        if (!next[action.action_id]) {
          next[action.action_id] = {
            status: action.status,
            notes: "",
          };
        }
      }

      return next;
    });
  }, [actions]);


  const visibleReports = useMemo(() => {
    return reports.filter((report) => {
      const statusMatch =
        statusFilter === "ALL" ||
        report.status === statusFilter;

      const typeMatch =
        typeFilter === "ALL" ||
        report.report_type === typeFilter;

      return statusMatch && typeMatch;
    });
  }, [reports, statusFilter, typeFilter]);


  const matrixSelection = useMemo(
    () =>
      riskMatrix.find(
        (item) =>
          item.likelihood === riskForm.likelihood &&
          item.severity === riskForm.severity
      ) ?? null,
    [riskMatrix, riskForm]
  );


  async function handleSubmitReport(event) {
    event.preventDefault();

    if (!submitForm.title.trim()) {
      setError("Report title is required.");
      return;
    }

    if (!submitForm.description.trim()) {
      setError("Report description is required.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      const reportId = await submitSafetyReport({
        ...submitForm,
        title: submitForm.title.trim(),
        description: submitForm.description.trim(),
      });

      setSubmitForm({
        reportType: "OCCURRENCE",
        title: "",
        description: "",
        eventTime: "",
        location: "",
        personsInvolved: "",
        immediateActions: "",
      });

      setSuccess("Safety report submitted successfully.");
      await loadReports(reportId);
    } catch (err) {
      console.error("Failed to submit safety report:", err);
      setError(
        err?.message ||
          "Unable to submit safety report."
      );
    } finally {
      setBusy(false);
    }
  }


  async function handleAssignManager(managerId) {
    if (!selectedReport || !managerId) return;

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      await assignSafetyManager(
        selectedReport.report_id,
        managerId
      );

      setSuccess("Safety Manager assigned.");
      await loadReports(selectedReport.report_id);
      await loadReportDetail(selectedReport.report_id);
    } catch (err) {
      console.error("Failed to assign Safety Manager:", err);
      setError(
        err?.message ||
          "Unable to assign Safety Manager."
      );
    } finally {
      setBusy(false);
    }
  }


  async function handleAssessRisk(event) {
    event.preventDefault();

    if (!selectedReport) return;

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      const riskIndex = await assessRisk(
        selectedReport.report_id,
        riskForm.likelihood,
        riskForm.severity,
        riskForm.notes.trim()
      );

      setSuccess(
        `Risk assessment saved: ${riskIndex}.`
      );

      await loadReports(selectedReport.report_id);
      await loadReportDetail(selectedReport.report_id);
    } catch (err) {
      console.error("Failed to assess risk:", err);
      setError(
        err?.message ||
          "Unable to save risk assessment."
      );
    } finally {
      setBusy(false);
    }
  }


  async function handleStatusChange(event) {
    event.preventDefault();

    if (!selectedReport) return;

    const nextStatus = reportStatusForm.status;
    const notes = reportStatusForm.notes.trim();

    if (!REPORT_STATUSES.includes(nextStatus)) {
      setSuccess("");
      setError("Invalid safety report status.");
      return;
    }

    if (nextStatus === "CLOSED" && !notes) {
      setSuccess("");
      setError("Closure notes are required.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      await setReportStatus(
        selectedReport.report_id,
        nextStatus,
        notes
      );

      setError("");
      setSuccess(`Report status changed to ${formatLabel(nextStatus)}.`);
      setReportStatusForm((current) => ({
        ...current,
        notes: "",
      }));

      await loadReports(selectedReport.report_id);
      await loadReportDetail(selectedReport.report_id);
    } catch (err) {
      console.error("Failed to change safety status:", err);
      setSuccess("");
      setError(
        err?.message ||
          "Unable to change report status."
      );
    } finally {
      setBusy(false);
    }
  }



  async function handleCreateAction(event) {
    event.preventDefault();

    if (!selectedReport) return;

    if (!actionForm.title.trim()) {
      setError("Corrective action title is required.");
      return;
    }

    if (!actionForm.description.trim()) {
      setError("Corrective action description is required.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      await createSafetyAction(
        selectedReport.report_id,
        {
          ...actionForm,
          title: actionForm.title.trim(),
          description: actionForm.description.trim(),
        }
      );

      setActionForm({
        title: "",
        description: "",
        assignedTo: "",
        dueAt: "",
      });

      setSuccess("Corrective action created.");
      await loadReports(selectedReport.report_id);
      await loadReportDetail(selectedReport.report_id);
    } catch (err) {
      console.error("Failed to create safety action:", err);
      setError(
        err?.message ||
          "Unable to create corrective action."
      );
    } finally {
      setBusy(false);
    }
  }


  async function handleActionStatus(action) {
    const draft = actionStatusDrafts[action.action_id] ?? {
      status: action.status,
      notes: "",
    };

    const nextStatus = draft.status;
    const notes = draft.notes.trim();

    if (
      !["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(
        nextStatus
      )
    ) {
      setSuccess("");
      setError("Invalid corrective action status.");
      return;
    }

    if (nextStatus === "COMPLETED" && !notes) {
      setSuccess("");
      setError("Completion notes are required.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      await updateSafetyAction(
        action.action_id,
        nextStatus,
        notes
      );

      setError("");
      setSuccess("Corrective action updated.");

      setActionStatusDrafts((current) => ({
        ...current,
        [action.action_id]: {
          status: nextStatus,
          notes: "",
        },
      }));

      await loadReportDetail(selectedReport.report_id);
      await loadReports(selectedReport.report_id);
    } catch (err) {
      console.error("Failed to update safety action:", err);
      setSuccess("");
      setError(
        err?.message ||
          "Unable to update corrective action."
      );
    } finally {
      setBusy(false);
    }
  }



  return (
    <main className="app safety-redesign-page">
      <header className="topbar">
        <Brand />

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
          ENTERPRISE SAFETY MANAGEMENT SYSTEM
        </div>

        <div className="student-booking-header aero-page-heading">
          <div>
            <h1>
              {operational
                ? "Safety Control Tower"
                : "Safety Reports"}
            </h1>

            <p className="muted">
              {operational
                ? "Review safety reports, assess operational risk, manage investigations and track corrective actions."
                : "Submit safety reports and track the reports you have raised in AeroPath."}
            </p>
          </div>

          <div className="aero-heading-aside">
            <ModuleEmblem name="safety" />
            <button
              className="secondary"
              type="button"
              disabled={loading || busy}
              onClick={() => loadReports(selectedReportId)}
            >
              Refresh
            </button>
          </div>
        </div>


        {error && (
          <div className="login-error booking-message">
            {error}
          </div>
        )}

        {success && (
          <div className="signup-success booking-message">
            {success}
          </div>
        )}


        {!operational && (
          <SubmitReportForm
            form={submitForm}
            setForm={setSubmitForm}
            busy={busy}
            onSubmit={handleSubmitReport}
          />
        )}


        {operational && (
          <SafetyOverview reports={reports} />
        )}


        <div style={filterRowStyle}>
          <div>
            <label>Report status</label>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
            >
              <option value="ALL">All statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="INVESTIGATING">Investigating</option>
              <option value="ACTION_REQUIRED">Action required</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          <div>
            <label>Report type</label>
            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value)
              }
            >
              <option value="ALL">All types</option>
              {REPORT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatLabel(type)}
                </option>
              ))}
            </select>
          </div>
        </div>


        {loading ? (
          <div className="admin-empty">
            Loading safety reports...
          </div>
        ) : (
          <div style={workspaceStyle}>
            <section style={listPanelStyle}>
              <div className="eyebrow">
                {operational ? "REPORT QUEUE" : "MY REPORTS"}
              </div>

              {visibleReports.length === 0 ? (
                <div className="admin-empty">
                  No safety reports found.
                </div>
              ) : (
                <div className="student-booking-list">
                  {visibleReports.map((report) => (
                    <ReportListCard
                      key={report.report_id}
                      report={report}
                      selected={
                        report.report_id === selectedReportId
                      }
                      operational={operational}
                      onClick={() =>
                        setSelectedReportId(report.report_id)
                      }
                    />
                  ))}
                </div>
              )}
            </section>


            <section style={detailPanelStyle}>
              {!selectedReport ? (
                <div className="admin-empty">
                  Select a safety report.
                </div>
              ) : (
                <ReportDetail
                  report={selectedReport}
                  operational={operational}
                  managers={managers}
                  riskForm={riskForm}
                  setRiskForm={setRiskForm}
                  matrixSelection={matrixSelection}
                  actionForm={actionForm}
                  setActionForm={setActionForm}
                  actions={actions}
                  events={events}
                  detailLoading={detailLoading}
                  busy={busy}
                  onAssignManager={handleAssignManager}
                  onAssessRisk={handleAssessRisk}
                  reportStatusForm={reportStatusForm}
                  setReportStatusForm={setReportStatusForm}
                  actionStatusDrafts={actionStatusDrafts}
                  setActionStatusDrafts={setActionStatusDrafts}
                  onStatusChange={handleStatusChange}
                  onCreateAction={handleCreateAction}
                  onActionStatus={handleActionStatus}
                />
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}


function SubmitReportForm({
  form,
  setForm,
  busy,
  onSubmit,
}) {
  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <article className="student-booking-card">
      <div className="eyebrow">
        SUBMIT SAFETY REPORT
      </div>

      <h2>Report a safety event</h2>

      <p className="muted">
        Use this form for incidents, accidents,
        occurrences and OSHE reports.
      </p>

      <form onSubmit={onSubmit}>
        <div style={twoColumnStyle}>
          <div>
            <label>Report type *</label>
            <select
              value={form.reportType}
              onChange={(event) =>
                update("reportType", event.target.value)
              }
              disabled={busy}
            >
              {REPORT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatLabel(type)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Event date / time</label>
            <input
              type="text" inputMode="numeric" placeholder="YYYY-MM-DDTHH:mm"
              value={form.eventTime}
              onChange={(event) =>
                update("eventTime", event.target.value)
              }
              disabled={busy}
            />
          </div>
        </div>

        <label>Title *</label>
        <input
          value={form.title}
          onChange={(event) =>
            update("title", event.target.value)
          }
          placeholder="Short description of the safety event"
          disabled={busy}
        />

        <label>Description *</label>
        <textarea
          value={form.description}
          onChange={(event) =>
            update("description", event.target.value)
          }
          placeholder="Describe what happened and the relevant circumstances."
          disabled={busy}
        />

        <div style={twoColumnStyle}>
          <div>
            <label>Location</label>
            <input
              value={form.location}
              onChange={(event) =>
                update("location", event.target.value)
              }
              disabled={busy}
            />
          </div>

          <div>
            <label>Persons involved</label>
            <input
              value={form.personsInvolved}
              onChange={(event) =>
                update("personsInvolved", event.target.value)
              }
              disabled={busy}
            />
          </div>
        </div>

        <label>Immediate actions taken</label>
        <textarea
          value={form.immediateActions}
          onChange={(event) =>
            update("immediateActions", event.target.value)
          }
          disabled={busy}
        />

        <button
          className="primary"
          type="submit"
          disabled={busy}
        >
          {busy ? "Submitting..." : "Submit safety report"}
        </button>
      </form>
    </article>
  );
}


function SafetyOverview({ reports }) {
  const count = (status) =>
    reports.filter((report) => report.status === status).length;

  const highRisk = reports.filter((report) =>
    ["HIGH", "EXTREME"].includes(report.risk_level)
  ).length;

  return (
    <div className="admin-stats">
      <StatCard label="Submitted" value={count("SUBMITTED")} />
      <StatCard
        label="Investigating"
        value={count("INVESTIGATING")}
      />
      <StatCard
        label="Action required"
        value={count("ACTION_REQUIRED")}
      />
      <StatCard label="High / extreme risk" value={highRisk} />
    </div>
  );
}


function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}


function ReportListCard({
  report,
  selected,
  operational,
  onClick,
}) {
  return (
    <article
      className="student-booking-card"
      onClick={onClick}
      style={{
        cursor: "pointer",
        outline: selected
          ? "2px solid rgba(255,255,255,0.32)"
          : "none",
      }}
    >
      <div className="student-booking-header">
        <div>
          <div className="eyebrow">
            #{report.report_number} · {formatLabel(report.report_type)}
          </div>

          <h3>{report.title}</h3>

          <p>{formatDateTime(report.created_at)}</p>
        </div>

        <span className={`booking-status ${statusClass(report.status)}`}>
          {formatLabel(report.status)}
        </span>
      </div>

      {operational && (
        <p className="muted">
          Reporter: {report.reporter_name || report.reporter_email || "—"}
        </p>
      )}

      {report.risk_index && (
        <div className="booking-lock-note">
          Risk {report.risk_index} · {formatLabel(report.risk_level)}
        </div>
      )}
    </article>
  );
}


function ReportDetail({
  report,
  operational,
  managers,
  riskForm,
  setRiskForm,
  matrixSelection,
  actionForm,
  setActionForm,
  actions,
  events,
  detailLoading,
  busy,
  onAssignManager,
  onAssessRisk,
  reportStatusForm,
  setReportStatusForm,
  actionStatusDrafts,
  setActionStatusDrafts,
  onStatusChange,
  onCreateAction,
  onActionStatus,
}) {
  return (
    <div>
      <article className="student-booking-card">
        <div className="student-booking-header">
          <div>
            <div className="eyebrow">
              SAFETY REPORT #{report.report_number}
            </div>
            <h2>{report.title}</h2>
          </div>

          <span className={`booking-status ${statusClass(report.status)}`}>
            {formatLabel(report.status)}
          </span>
        </div>

        <div className="booking-details-grid instructor-booking-details">
          <Detail label="Type" value={formatLabel(report.report_type)} />
          <Detail
            label="Event time"
            value={formatDateTime(report.event_time)}
          />
          <Detail label="Location" value={report.location || "—"} />
          <Detail
            label="Risk"
            value={
              report.risk_index
                ? `${report.risk_index} · ${formatLabel(report.risk_level)}`
                : "Not assessed"
            }
          />
          {operational && (
            <Detail
              label="Reporter"
              value={report.reporter_name || report.reporter_email || "—"}
            />
          )}
          {operational && (
            <Detail
              label="Safety Manager"
              value={report.assigned_safety_manager_name || "Unassigned"}
            />
          )}
        </div>

        <div className="booking-note">
          <strong>Description</strong>
          <p>{report.description}</p>
        </div>

        {report.persons_involved && (
          <div className="booking-note">
            <strong>Persons involved</strong>
            <p>{report.persons_involved}</p>
          </div>
        )}

        {report.immediate_actions && (
          <div className="booking-note">
            <strong>Immediate actions</strong>
            <p>{report.immediate_actions}</p>
          </div>
        )}

        {report.closure_notes && (
          <div className="booking-note">
            <strong>Closure notes</strong>
            <p>{report.closure_notes}</p>
          </div>
        )}
      </article>


      {operational && report.status !== "CLOSED" && (
        <article className="student-booking-card">
          <div className="eyebrow">CONTROL TOWER</div>
          <h3>Investigation control</h3>

          <label>Assigned Safety Manager</label>
          <select
            value={report.assigned_safety_manager_id || ""}
            disabled={busy}
            onChange={(event) =>
              onAssignManager(event.target.value)
            }
          >
            <option value="">Select Safety Manager</option>
            {managers.map((manager) => (
              <option key={manager.user_id} value={manager.user_id}>
                {manager.full_name || manager.email}
              </option>
            ))}
          </select>

          <form onSubmit={onStatusChange} style={{ marginTop: "14px" }}>
            <label>Report status</label>
            <select
              value={reportStatusForm.status}
              disabled={busy}
              onChange={(event) =>
                setReportStatusForm((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            >
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="INVESTIGATING">Investigating</option>
              <option value="ACTION_REQUIRED">Action Required</option>
              <option value="CLOSED">Closed</option>
            </select>

            <label style={{ marginTop: "12px" }}>
              {reportStatusForm.status === "CLOSED"
                ? "Closure notes *"
                : "Status notes"}
            </label>
            <textarea
              value={reportStatusForm.notes}
              disabled={busy}
              placeholder={
                reportStatusForm.status === "CLOSED"
                  ? "Explain why this report can be closed."
                  : "Optional status update notes."
              }
              onChange={(event) =>
                setReportStatusForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />

            <button
              className="secondary"
              type="submit"
              disabled={busy}
            >
              {busy ? "Updating..." : "Update report status"}
            </button>
          </form>
        </article>
      )}


      {operational && report.status !== "CLOSED" && (
        <article className="student-booking-card">
          <div className="eyebrow">RISK ASSESSMENT</div>
          <h3>5 × 5 safety risk matrix</h3>

          <form onSubmit={onAssessRisk}>
            <div style={twoColumnStyle}>
              <div>
                <label>Likelihood</label>
                <select
                  value={riskForm.likelihood}
                  onChange={(event) =>
                    setRiskForm((current) => ({
                      ...current,
                      likelihood: event.target.value,
                    }))
                  }
                  disabled={busy}
                >
                  {LIKELIHOODS.map((item) => (
                    <option key={item} value={item}>
                      {item} · {likelihoodLabel(item)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Severity</label>
                <select
                  value={riskForm.severity}
                  onChange={(event) =>
                    setRiskForm((current) => ({
                      ...current,
                      severity: event.target.value,
                    }))
                  }
                  disabled={busy}
                >
                  {SEVERITIES.map((item) => (
                    <option key={item} value={item}>
                      {item} · {severityLabel(item)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {matrixSelection && (
              <div className="booking-note">
                <strong>
                  Proposed risk: {matrixSelection.risk_index}
                  {" · "}
                  {formatLabel(matrixSelection.risk_level)}
                </strong>

                {matrixSelection.requires_immediate_action && (
                  <p>
                    Immediate risk-control action is required by the configured AeroPath matrix.
                  </p>
                )}
              </div>
            )}

            <label>Assessment notes</label>
            <textarea
              value={riskForm.notes}
              onChange={(event) =>
                setRiskForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              disabled={busy}
            />

            <button
              className="primary"
              type="submit"
              disabled={busy}
            >
              Save risk assessment
            </button>
          </form>
        </article>
      )}


      {operational && report.status !== "CLOSED" && (
        <article className="student-booking-card">
          <div className="eyebrow">CORRECTIVE ACTION</div>
          <h3>Create action</h3>

          <form onSubmit={onCreateAction}>
            <label>Action title *</label>
            <input
              value={actionForm.title}
              onChange={(event) =>
                setActionForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              disabled={busy}
            />

            <label>Description *</label>
            <textarea
              value={actionForm.description}
              onChange={(event) =>
                setActionForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              disabled={busy}
            />

            <div style={twoColumnStyle}>
              <div>
                <label>Assign to Safety Manager</label>
                <select
                  value={actionForm.assignedTo}
                  onChange={(event) =>
                    setActionForm((current) => ({
                      ...current,
                      assignedTo: event.target.value,
                    }))
                  }
                  disabled={busy}
                >
                  <option value="">Unassigned</option>
                  {managers.map((manager) => (
                    <option key={manager.user_id} value={manager.user_id}>
                      {manager.full_name || manager.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Due date / time</label>
                <input
                  type="text" inputMode="numeric" placeholder="YYYY-MM-DDTHH:mm"
                  value={actionForm.dueAt}
                  onChange={(event) =>
                    setActionForm((current) => ({
                      ...current,
                      dueAt: event.target.value,
                    }))
                  }
                  disabled={busy}
                />
              </div>
            </div>

            <button
              className="primary"
              type="submit"
              disabled={busy}
            >
              Create corrective action
            </button>
          </form>
        </article>
      )}


      <article className="student-booking-card">
        <div className="eyebrow">CORRECTIVE ACTIONS</div>
        <h3>Action register</h3>

        {detailLoading ? (
          <div className="admin-empty">Loading actions...</div>
        ) : actions.length === 0 ? (
          <div className="admin-empty">No corrective actions.</div>
        ) : (
          <div className="student-booking-list">
            {actions.map((action) => (
              <div className="booking-note" key={action.action_id}>
                <div className="student-booking-header">
                  <div>
                    <strong>
                      #{action.action_number} · {action.title}
                    </strong>
                    <p>{action.description}</p>
                  </div>

                  <span className={`booking-status ${statusClass(action.status)}`}>
                    {formatLabel(action.status)}
                  </span>
                </div>

                <p className="muted">
                  Assigned to: {action.assigned_to_name || "Unassigned"}
                  {action.due_at
                    ? ` · Due ${formatDateTime(action.due_at)}`
                    : ""}
                </p>

                {action.completion_notes && (
                  <p>Completion: {action.completion_notes}</p>
                )}

                {action.can_update && report.status !== "CLOSED" && (
                  <div style={{ marginTop: "14px" }}>
                    <div style={twoColumnStyle}>
                      <div>
                        <label>Action status</label>
                        <select
                          value={
                            actionStatusDrafts[action.action_id]?.status ??
                            action.status
                          }
                          disabled={busy}
                          onChange={(event) =>
                            setActionStatusDrafts((current) => ({
                              ...current,
                              [action.action_id]: {
                                status: event.target.value,
                                notes:
                                  current[action.action_id]?.notes ?? "",
                              },
                            }))
                          }
                        >
                          <option value="OPEN">Open</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                      </div>

                      <div>
                        <label>
                          {(actionStatusDrafts[action.action_id]?.status ??
                            action.status) === "COMPLETED"
                            ? "Completion notes *"
                            : "Action notes"}
                        </label>
                        <textarea
                          value={
                            actionStatusDrafts[action.action_id]?.notes ?? ""
                          }
                          disabled={busy}
                          placeholder={
                            (actionStatusDrafts[action.action_id]?.status ??
                              action.status) === "COMPLETED"
                              ? "Describe how the corrective action was completed."
                              : "Optional action update notes."
                          }
                          onChange={(event) =>
                            setActionStatusDrafts((current) => ({
                              ...current,
                              [action.action_id]: {
                                status:
                                  current[action.action_id]?.status ??
                                  action.status,
                                notes: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>

                    <button
                      className="secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => onActionStatus(action)}
                    >
                      {busy ? "Updating..." : "Update action status"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </article>


      <article className="student-booking-card">
        <div className="eyebrow">AUDIT HISTORY</div>
        <h3>Report timeline</h3>

        {detailLoading ? (
          <div className="admin-empty">Loading history...</div>
        ) : events.length === 0 ? (
          <div className="admin-empty">No report events.</div>
        ) : (
          <div className="student-booking-list">
            {events.map((event) => (
              <div className="booking-note" key={event.event_id}>
                <strong>{formatLabel(event.event_type)}</strong>
                <p>
                  {formatDateTime(event.created_at)} · {event.actor_name || "AeroPath User"}
                </p>
                {event.previous_status || event.new_status ? (
                  <p>
                    {event.previous_status
                      ? formatLabel(event.previous_status)
                      : "Start"}
                    {" → "}
                    {event.new_status
                      ? formatLabel(event.new_status)
                      : "—"}
                  </p>
                ) : null}
                {event.notes && <p>{event.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}


function Detail({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}


function Brand() {
  return (
    <div className="brand compact">
      <div className="brand-name">AEROPATH</div>
      <div className="brand-by">by AEROVIATION</div>
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
  if (!value) return "—";

  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}


function formatDateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}


function likelihoodLabel(value) {
  return {
    5: "Frequent",
    4: "Occasional",
    3: "Remote",
    2: "Improbable",
    1: "Extremely Improbable",
  }[value] ?? value;
}


function severityLabel(value) {
  return {
    A: "Catastrophic",
    B: "Hazardous",
    C: "Major",
    D: "Minor",
    E: "Negligible",
  }[value] ?? value;
}


function statusClass(value) {
  switch (value) {
    case "CLOSED":
    case "COMPLETED":
      return "approved";
    case "SUBMITTED":
    case "OPEN":
      return "requested";
    case "ACTION_REQUIRED":
    case "EXTREME":
    case "HIGH":
      return "rejected";
    default:
      return "requested";
  }
}


const workspaceStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
  gap: "20px",
  alignItems: "start",
};

const listPanelStyle = {
  minWidth: 0,
};

const detailPanelStyle = {
  minWidth: 0,
};

const filterRowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
  margin: "20px 0",
};

const twoColumnStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};
