import { useEffect, useMemo, useState } from "react";

import ActionConfirmModal from "./ActionConfirmModal";
import ActionSuccessModal from "./ActionSuccessModal";
import ActionErrorModal from "./ActionErrorModal";
import ModuleEmblem from "./ModuleEmblem";
import {
  adminCreateTrainingResource,
  adminListTrainingResources,
  adminUpdateTrainingResource,
  resourceBadge,
} from "./lib/resources";

const EMPTY_FORM = {
  resourceType: "AIRCRAFT",
  name: "",
  model: "",
  identifier: "",
  callsign: "",
  description: "",
  active: true,
};

function resourceEmblem(resource) {
  const description = `${resource.name || ""} ${resource.type || ""}`.toUpperCase();
  if (/\bATC\b|AIR TRAFFIC/.test(description)) return "headset";
  if (/\bVR\b|VIRTUAL REALITY/.test(description)) return "vr";
  return resource.resource_type === "AIRCRAFT" ? "aircraft" : "simulator";
}

export default function FleetResourcesPage({ onBack, onSignOut }) {
  const [resources, setResources] = useState([]);
  const [tab, setTab] = useState("AIRCRAFT");
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [confirmToggle, setConfirmToggle] = useState(null);
  const [successModal, setSuccessModal] = useState(null);

  async function loadResources() {
    try {
      setLoading(true);
      setError("");
      setResources(await adminListTrainingResources());
    } catch (loadError) {
      setError(loadError?.message || "Unable to load training resources.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadResources();
  }, []);

  useEffect(() => {
    setCreateForm({ ...EMPTY_FORM, resourceType: tab });
    setEditingId(null);
  }, [tab]);

  const visibleResources = useMemo(
    () => resources.filter((resource) => resource.resource_type === tab),
    [resources, tab]
  );

  const counts = useMemo(
    () => ({
      AIRCRAFT: resources.filter((resource) => resource.resource_type === "AIRCRAFT").length,
      SIMULATOR: resources.filter((resource) => resource.resource_type === "SIMULATOR").length,
    }),
    [resources]
  );

  async function handleCreate(event) {
    event.preventDefault();

    if (!validForm(createForm, setError)) {
      return;
    }

    try {
      setBusyId("CREATE");
      setError("");
      await adminCreateTrainingResource(normalizeForm(createForm));
      setCreateForm({ ...EMPTY_FORM, resourceType: tab });
      await loadResources();
      setSuccessModal({
        eyebrow: `${tab} CREATED`,
        title: `${formatType(tab)} added to the fleet`,
        message: "The active training resource is now available in booking and timetable workflows.",
        nextText: "Approved-booking resource and instructor conflict protection applies automatically.",
      });
    } catch (createError) {
      setError(createError?.message || `Unable to create ${formatType(tab).toLowerCase()}.`);
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(resource) {
    setEditingId(resource.resource_id);
    setEditForm({
      resourceType: resource.resource_type,
      name: resource.name ?? "",
      model: resource.type ?? "",
      identifier: resource.identifier ?? "",
      callsign: resource.callsign ?? "",
      description: resource.description ?? "",
      active: Boolean(resource.active),
    });
    setError("");
  }

  async function saveEdit(resource) {
    if (!validForm(editForm, setError)) {
      return;
    }

    try {
      setBusyId(resource.resource_id);
      setError("");
      await adminUpdateTrainingResource(
        resource.resource_id,
        normalizeForm(editForm)
      );
      setEditingId(null);
      await loadResources();
      setSuccessModal({
        eyebrow: "RESOURCE UPDATED",
        title: `${editForm.name.trim()} updated`,
        message: "The fleet catalogue and all future resource selections now use the updated details.",
        nextText: "Existing bookings, sessions and immutable history remain linked to the same resource ID.",
      });
    } catch (saveError) {
      setError(saveError?.message || "Unable to update training resource.");
    } finally {
      setBusyId(null);
    }
  }

  function requestToggle(resource) {
    setConfirmToggle({
      resource,
      nextActive: !resource.active,
      eyebrow: resource.active ? "DEACTIVATE RESOURCE" : "REACTIVATE RESOURCE",
      title: `${resource.active ? "Deactivate" : "Reactivate"} ${resource.name}?`,
      message: resource.active
        ? "The resource will be removed from new booking choices. AeroPath blocks deactivation when a future approved booking or in-progress session exists."
        : "The resource will become available for new training bookings again.",
      confirmLabel: resource.active ? "Deactivate resource" : "Reactivate resource",
      danger: resource.active,
    });
  }

  async function executeToggle() {
    if (!confirmToggle) {
      return;
    }

    const { resource, nextActive } = confirmToggle;
    setConfirmToggle(null);

    try {
      setBusyId(resource.resource_id);
      setError("");
      await adminUpdateTrainingResource(resource.resource_id, {
        resourceType: resource.resource_type,
        name: resource.name,
        model: resource.type,
        identifier: resource.identifier,
        callsign: resource.callsign || "",
        description: resource.description || "",
        active: nextActive,
      });
      await loadResources();
      setSuccessModal({
        eyebrow: nextActive ? "RESOURCE ACTIVE" : "RESOURCE INACTIVE",
        title: `${resource.name} ${nextActive ? "reactivated" : "deactivated"}`,
        message: nextActive
          ? "The resource is available for new bookings."
          : "The resource is hidden from new bookings while its operational history remains intact.",
        nextText: "No booking, session or training-record history was deleted.",
      });
    } catch (toggleError) {
      setError(toggleError?.message || "Unable to change resource availability.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="app fleet-redesign-page">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <span className="role">Admin Operations</span>
          <button className="secondary" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <section className="bookings-page fleet-resources-page">
        <button className="secondary back-button" onClick={onBack}>← Back to dashboard</button>
        <div className="aero-page-heading fleet-page-heading">
          <div>
            <div className="eyebrow">TRAINING RESOURCE CATALOGUE</div>
            <h1>Fleet &amp; Simulators</h1>
            <p className="muted">
              Manage aircraft and simulators while preserving every booking, session and training record.
            </p>
          </div>
          <div className="aero-heading-aside">
            <ModuleEmblem name="fleet" />
            <div className="fleet-control-status">
              <span className="aero-system-dot" />
              {resources.filter((resource) => resource.active).length} available
            </div>
          </div>
        </div>

        <div className="booking-filter-grid fleet-tabs">
          {[
            ["AIRCRAFT", "Aircraft"],
            ["SIMULATOR", "Simulators"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={tab === value ? "stat-card active" : "stat-card"}
              onClick={() => setTab(value)}
            >
              <strong>{counts[value]}</strong>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="fleet-summary-strip" aria-label="Fleet summary">
          <div><span>Selected group</span><strong>{visibleResources.length}</strong></div>
          <div><span>Available</span><strong>{visibleResources.filter((resource) => resource.active).length}</strong></div>
          <div><span>Unavailable</span><strong>{visibleResources.filter((resource) => !resource.active).length}</strong></div>
        </div>

        <section className="booking-form-card resource-create-panel">
          <div className="booking-section-heading">
            <div>
              <div className="eyebrow">NEW {tab}</div>
              <h2>Add {formatType(tab).toLowerCase()}</h2>
            </div>
            <span className="status">{resourceBadge(tab)}</span>
          </div>

          <ResourceForm
            values={createForm}
            onChange={setCreateForm}
            onSubmit={handleCreate}
            submitLabel={busyId === "CREATE" ? "Creating..." : `Create ${formatType(tab).toLowerCase()}`}
            disabled={busyId === "CREATE"}
          />
        </section>

        <section className="booking-history-section">
          <div className="booking-section-heading">
            <div>
              <div className="eyebrow">{tab} CATALOGUE</div>
              <h2>{tab === "AIRCRAFT" ? "Aircraft" : "Simulators"}</h2>
            </div>
            <span className="booking-count">{visibleResources.length}</span>
          </div>

          {loading ? (
            <div className="admin-empty">Loading fleet resources...</div>
          ) : visibleResources.length === 0 ? (
            <div className="admin-empty">No {formatType(tab).toLowerCase()} resources have been created.</div>
          ) : (
            <div className="student-booking-list fleet-resource-list">
              {visibleResources.map((resource) => (
                <article className={`student-booking-card fleet-resource-card resource-${resource.resource_type.toLowerCase()} ${resource.active ? "active" : "inactive"}`} key={resource.resource_id}>
                  <div className="student-booking-header">
                    <div className="fleet-resource-title">
                      <ModuleEmblem name={resourceEmblem(resource)} compact />
                      <div>
                        <h3>{resource.name}</h3>
                        <p>{resource.type} · {resource.identifier}</p>
                      </div>
                    </div>
                    <div className="resource-badges">
                      <span className="status">{resourceBadge(resource)}</span>
                      <span className={`booking-status ${resource.active ? "approved" : "cancelled"}`}>
                        {resource.active ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>
                  </div>

                  {editingId === resource.resource_id ? (
                    <ResourceForm
                      values={editForm}
                      onChange={setEditForm}
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveEdit(resource);
                      }}
                      submitLabel={busyId === resource.resource_id ? "Saving..." : "Save resource"}
                      disabled={busyId === resource.resource_id}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <>
                      <div className="booking-details-grid">
                        <Detail label={tab === "AIRCRAFT" ? "Registration" : "Identifier"} value={resource.identifier} />
                        <Detail label={tab === "AIRCRAFT" ? "Aircraft type" : "Simulator type"} value={resource.type} />
                        {resource.callsign && <Detail label="Callsign" value={resource.callsign} />}
                        <Detail label="Future approved" value={resource.future_approved_bookings ?? 0} />
                        <Detail label="In progress" value={resource.in_progress_sessions ?? 0} />
                        <Detail label="Total sessions" value={resource.total_sessions ?? 0} />
                      </div>

                      {resource.description && <p className="booking-note">{resource.description}</p>}

                      <div className="booking-actions">
                        <button className="secondary" onClick={() => startEdit(resource)}>Edit resource</button>
                        <button
                          className={resource.active ? "danger-button" : "secondary"}
                          disabled={busyId === resource.resource_id}
                          onClick={() => requestToggle(resource)}
                        >
                          {resource.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <ActionConfirmModal
        open={Boolean(confirmToggle)}
        eyebrow={confirmToggle?.eyebrow}
        title={confirmToggle?.title}
        message={confirmToggle?.message}
        confirmLabel={confirmToggle?.confirmLabel}
        danger={Boolean(confirmToggle?.danger)}
        onClose={() => setConfirmToggle(null)}
        onConfirm={executeToggle}
      />

      <ActionErrorModal
        open={Boolean(error)}
        title="Fleet action blocked"
        message={error}
        onClose={() => setError("")}
      />

      <ActionSuccessModal
        open={Boolean(successModal)}
        eyebrow={successModal?.eyebrow}
        title={successModal?.title}
        message={successModal?.message}
        nextText={successModal?.nextText}
        onClose={() => setSuccessModal(null)}
        onPrimary={() => setSuccessModal(null)}
      />
    </main>
  );
}

function ResourceForm({ values, onChange, onSubmit, submitLabel, disabled, onCancel }) {
  const aircraft = values.resourceType === "AIRCRAFT";
  const change = (field) => (event) =>
    onChange((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form className="booking-form resource-editor-form" onSubmit={onSubmit}>
      <div className="booking-time-grid">
        <div className="booking-field">
          <label>{aircraft ? "Aircraft name" : "Simulator name"}</label>
          <input value={values.name} onChange={change("name")} placeholder={aircraft ? "Bristell B23" : "C172 G1000 Simulator"} />
        </div>
        <div className="booking-field">
          <label>{aircraft ? "Aircraft type" : "Simulator type"}</label>
          <input value={values.model} onChange={change("model")} placeholder={aircraft ? "Bristell B23" : "Fixed-base FNPT"} />
        </div>
      </div>

      <div className="booking-time-grid">
        <div className="booking-field">
          <label>{aircraft ? "Registration" : "Identifier"}</label>
          <input value={values.identifier} onChange={change("identifier")} placeholder={aircraft ? "9V-ABC" : "SIM-C172-01"} />
        </div>
        <div className="booking-field">
          <label>Callsign <span className="muted">(optional)</span></label>
          <input value={values.callsign} onChange={change("callsign")} placeholder={aircraft ? "AEROVIATION 21" : "Optional"} />
        </div>
      </div>

      <div className="booking-field">
        <label>Description <span className="muted">(optional)</span></label>
        <textarea value={values.description} onChange={change("description")} placeholder="Operational notes or resource description." />
      </div>

      <div className="booking-actions">
        <button className="primary" type="submit" disabled={disabled}>{submitLabel}</button>
        {onCancel && <button className="secondary" type="button" onClick={onCancel}>Cancel edit</button>}
      </div>
    </form>
  );
}

function validForm(values, setError) {
  if (!values.name.trim() || !values.model.trim() || !values.identifier.trim()) {
    setError("Name, model/type and identifier are required.");
    return false;
  }
  return true;
}

function normalizeForm(values) {
  return {
    ...values,
    name: values.name.trim(),
    model: values.model.trim(),
    identifier: values.identifier.trim().toUpperCase(),
    callsign: values.callsign.trim().toUpperCase(),
    description: values.description.trim(),
  };
}

function formatType(type) {
  return type === "AIRCRAFT" ? "Aircraft" : "Simulator";
}

function Detail({ label, value }) {
  return (
    <div>
      <span className="muted">{label}</span>
      <strong style={{ display: "block" }}>{value}</strong>
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
