import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import ActionSuccessModal from "./ActionSuccessModal";
import ActionConfirmModal from "./ActionConfirmModal";
import ActionFormModal from "./ActionFormModal";
import ActionErrorModal from "./ActionErrorModal";
import ModuleEmblem from "./ModuleEmblem";

const ROLE_OPTIONS = ["STUDENT", "INSTRUCTOR", "SAFETY_MANAGER", "ADMIN"];

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

async function safeRpc(name, args = {}, fallback = null) {
  try {
    return await rpc(name, args);
  } catch {
    return fallback;
  }
}

export default function AdminAccountsManagerPage({ onBack, onSignOut }) {
  const [accounts, setAccounts] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [statusFilter, setStatusFilter] = useState("APPROVED");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [profile, setProfile] = useState(null);
  const [progress, setProgress] = useState([]);
  const [tab, setTab] = useState("PROFILE");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [successModal, setSuccessModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [formModal, setFormModal] = useState(null);
  const [newProgramme, setNewProgramme] = useState({ name: "", description: "" });
  const [assignment, setAssignment] = useState({ programmeId: "", hours: "", notes: "" });

  async function loadAll() {
    try {
      setLoading(true);
      setError("");
      const [accountData, programmeData] = await Promise.all([
        rpc("admin_list_accounts_v3"),
        rpc("list_training_programmes_v2"),
      ]);
      setAccounts(accountData ?? []);
      setProgrammes(programmeData ?? []);
    } catch (e) {
      setError(e?.message || "Unable to load administration data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function openUser(account) {
    try {
      setBusy(true);
      setError("");
      setSuccess("");
      const [profileRows, programmeRows] = await Promise.all([
        rpc("admin_get_user_profile_v2", { target_user_id: account.user_id }),
        safeRpc("list_student_programme_progress_v2", { target_student_id: account.user_id }, []),
      ]);
      setSelected(account);
      setProfile(profileRows?.[0] ?? null);
      setProgress(programmeRows ?? []);
      setTab("PROFILE");
    } catch (e) {
      setError(e?.message || "Unable to open user profile.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshSelected() {
    if (!selected) return;
    const refreshed = (await rpc("admin_list_accounts_v3")) ?? [];
    setAccounts(refreshed);
    const current = refreshed.find((x) => x.user_id === selected.user_id) ?? selected;
    await openUser(current);
  }

  const visibleAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      const archived = !!a.archived_at;
      if (statusFilter === "ARCHIVED") {
        if (!archived) return false;
      } else {
        if (archived || a.account_status !== statusFilter) return false;
      }
      if (!q) return true;
      const programmeNames = (a.programmes ?? []).map((p) => p?.name).filter(Boolean);
      return [a.full_name, a.display_name, a.email, ...(a.roles ?? []), ...programmeNames]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [accounts, statusFilter, search]);

  function showAdminSuccess(
    title,
    message = null
  ) {
    setSuccess("");

    setSuccessModal({
      eyebrow:
        "ADMIN UPDATE COMPLETE",
      title,
      message,
      nextText:
        "AeroPath has refreshed the affected administration data.",
    });
  }


  async function action(
    fn,
    ok
  ) {
    try {
      setBusy(true);
      setError("");
      setSuccess("");

      await fn();

      if (selected) {
        await refreshSelected();
      } else {
        await loadAll();
      }

      showAdminSuccess(ok);
    } catch (e) {
      setError(
        e?.message ||
          "Action failed."
      );
    } finally {
      setBusy(false);
    }
  }


  function approve(account) {
    setFormModal({
      kind: "APPROVE",
      account,
      eyebrow:
        "APPROVE ACCOUNT",
      title:
        `Approve ${account.full_name || account.email}?`,
      message:
        "Choose the initial operational role. Additional roles can be assigned later.",
      confirmLabel:
        "Approve account",
      fields: [
        {
          name: "role",
          label: "Initial role",
          type: "select",
          required: true,
          defaultValue:
            "STUDENT",
          options:
            ROLE_OPTIONS.map(
              (role) => ({
                value: role,
                label:
                  formatRole(role),
              })
            ),
        },
      ],
    });
  }


  function reject(account) {
    setFormModal({
      kind: "REJECT",
      account,
      eyebrow:
        "REJECT ACCOUNT",
      title:
        `Reject ${account.full_name || account.email}?`,
      message:
        "The rejection reason will be stored with the account.",
      confirmLabel:
        "Reject account",
      danger: true,
      fields: [
        {
          name: "reason",
          label:
            "Rejection reason",
          type: "textarea",
          required: true,
          autoFocus: true,
        },
      ],
    });
  }


  async function addRole(role) {
    await action(
      () =>
        rpc(
          "admin_add_user_role",
          {
            target_user_id:
              selected.user_id,
            new_role: role,
          }
        ),
      `${formatRole(role)} role added.`
    );
  }


  function removeRole(role) {
    setConfirmModal({
      kind: "REMOVE_ROLE",
      role,
      eyebrow:
        "REMOVE ROLE",
      title:
        `Remove ${formatRole(role)} role?`,
      message:
        "The user's remaining roles and historical records will be preserved.",
      confirmLabel:
        "Remove role",
      danger: true,
    });
  }


  function suspend() {
    setFormModal({
      kind: "SUSPEND",
      eyebrow:
        "SUSPEND ACCOUNT",
      title:
        "Suspend this account?",
      message:
        "Suspension blocks account access while preserving AeroPath history.",
      confirmLabel:
        "Suspend account",
      danger: true,
      fields: [
        {
          name: "reason",
          label:
            "Suspension reason",
          type: "textarea",
          required: true,
          autoFocus: true,
        },
      ],
    });
  }


  async function reactivateSuspended() {
    await action(
      () =>
        rpc(
          "admin_reactivate_user",
          {
            target_user_id:
              selected.user_id,
          }
        ),
      "Account reactivated."
    );
  }


  function archive() {
    setFormModal({
      kind: "ARCHIVE",
      eyebrow:
        "ARCHIVE ACCOUNT",
      title:
        "Archive this account?",
      message:
        "Historical bookings, sessions, training records, files, safety records and audit history will be preserved.",
      confirmLabel:
        "Archive account",
      danger: true,
      fields: [
        {
          name: "reason",
          label:
            "Archive reason",
          type: "textarea",
          required: true,
          autoFocus: true,
        },
      ],
    });
  }


  async function reactivateArchived() {
    await action(
      () =>
        rpc(
          "admin_reactivate_archived_user_v2",
          {
            target_user_id:
              selected.user_id,
          }
        ),
      "Archived account reactivated."
    );
  }


  async function permanentDelete() {
    try {
      setBusy(true);
      setError("");

      const check =
        await rpc(
          "admin_can_permanently_delete_user_v2",
          {
            target_user_id:
              selected.user_id,
          }
        );

      const result =
        check?.[0];

      if (
        !result?.can_delete
      ) {
        setError(
          result?.reason ||
            "Permanent deletion is blocked. Archive this account instead."
        );
        return;
      }

      setFormModal({
        kind:
          "PERMANENT_DELETE",
        eyebrow:
          "PERMANENT DELETE",
        title:
          "Permanently delete this unused account?",
        message:
          "This removes the unused AeroPath account and authentication user. This cannot be undone.",
        confirmLabel:
          "Permanently delete",
        danger: true,
        fields: [
          {
            name: "reason",
            label:
              "Deletion reason",
            type: "textarea",
            required: true,
            autoFocus: true,
          },
        ],
      });
    } catch (e) {
      setError(
        e?.message ||
          "Permanent deletion check failed."
      );
    } finally {
      setBusy(false);
    }
  }


  async function saveProfile(e) {
    e.preventDefault();

    if (
      !profile?.full_name?.trim()
    ) {
      setError(
        "Full name is required."
      );
      return;
    }

    await action(
      () =>
        rpc(
          "admin_update_user_profile_v2",
          {
            target_user_id:
              selected.user_id,
            new_full_name:
              profile.full_name.trim(),
            new_display_name:
              profile.display_name ||
              null,
            new_phone:
              profile.phone ||
              null,
            new_date_of_birth:
              profile.date_of_birth ||
              null,
            new_emergency_contact_name:
              profile.emergency_contact_name ||
              null,
            new_emergency_contact_phone:
              profile.emergency_contact_phone ||
              null,
            new_address:
              profile.address ||
              null,
            new_about:
              profile.about ||
              null,
            new_staff_notes:
              profile.staff_notes ||
              null,
          }
        ),
      "Profile updated."
    );
  }


  async function createProgramme(e) {
    e.preventDefault();

    if (
      !newProgramme.name.trim()
    ) {
      setError(
        "Programme name is required."
      );
      return;
    }

    await action(
      () =>
        rpc(
          "admin_create_training_programme_v2",
          {
            programme_name:
              newProgramme.name.trim(),
            programme_description:
              newProgramme.description.trim() ||
              null,
          }
        ),
      "Programme created."
    );

    setNewProgramme({
      name: "",
      description: "",
    });

    const programmeData =
      await rpc(
        "list_training_programmes_v2"
      );

    setProgrammes(
      programmeData ?? []
    );
  }


  async function toggleProgramme(
    programme
  ) {
    await action(
      () =>
        rpc(
          "admin_update_training_programme_v2",
          {
            target_programme_id:
              programme.programme_id,
            programme_name:
              programme.name,
            programme_description:
              programme.description ||
              null,
            programme_active:
              !programme.active,
          }
        ),
      programme.active
        ? "Programme deactivated."
        : "Programme reactivated."
    );

    setProgrammes(
      (await rpc(
        "list_training_programmes_v2"
      )) ?? []
    );
  }


  async function assignProgramme(e) {
    e.preventDefault();

    if (
      !assignment.programmeId
    ) {
      setError(
        "Choose a programme."
      );
      return;
    }

    const hours =
      Number(assignment.hours);

    if (
      !Number.isFinite(hours) ||
      hours < 0
    ) {
      setError(
        "Assigned hours must be zero or greater."
      );
      return;
    }

    await action(
      () =>
        rpc(
          "admin_assign_student_programme_v2",
          {
            target_student_id:
              selected.user_id,
            target_programme_id:
              assignment.programmeId,
            new_assigned_minutes:
              Math.round(
                hours * 60
              ),
            assignment_notes:
              assignment.notes.trim() ||
              null,
          }
        ),
      "Programme assigned."
    );

    setAssignment({
      programmeId: "",
      hours: "",
      notes: "",
    });
  }


  function editAssignment(item) {
    setFormModal({
      kind:
        "EDIT_ASSIGNMENT",
      item,
      eyebrow:
        "PROGRAMME HOURS",
      title:
        `Update ${item.programme_name}`,
      message:
        "Set the student's assigned hours for this programme and optionally update the assignment notes.",
      confirmLabel:
        "Update programme hours",
      fields: [
        {
          name: "hours",
          label:
            "Assigned hours",
          type: "number",
          min: 0,
          step: "0.1",
          required: true,
          defaultValue:
            String(
              item.assigned_hours ??
                0
            ),
        },
        {
          name: "notes",
          label:
            "Assignment notes",
          type: "textarea",
          required: false,
          defaultValue:
            item.assignment_notes ??
            "",
        },
      ],
    });
  }


  function removeAssignment(item) {
    setFormModal({
      kind:
        "REMOVE_ASSIGNMENT",
      item,
      eyebrow:
        "REMOVE PROGRAMME",
      title:
        `Remove ${item.programme_name}?`,
      message:
        "The assignment will end, but historical training records remain unchanged.",
      confirmLabel:
        "Remove assignment",
      danger: true,
      fields: [
        {
          name: "reason",
          label:
            "Removal reason",
          type: "textarea",
          required: true,
          autoFocus: true,
        },
      ],
    });
  }


  async function executeConfirmModal() {
    const modal =
      confirmModal;

    if (!modal) {
      return;
    }

    setConfirmModal(null);

    if (
      modal.kind ===
      "REMOVE_ROLE"
    ) {
      await action(
        () =>
          rpc(
            "admin_remove_user_role_v2",
            {
              target_user_id:
                selected.user_id,
              role_to_remove:
                modal.role,
            }
          ),
        `${formatRole(modal.role)} role removed.`
      );
    }
  }


  async function executeFormModal(
    values
  ) {
    const modal =
      formModal;

    if (!modal) {
      return;
    }

    setFormModal(null);

    if (
      modal.kind ===
      "APPROVE"
    ) {
      const role =
        String(
          values.role ?? ""
        )
          .trim()
          .toUpperCase();

      if (
        !ROLE_OPTIONS.includes(
          role
        )
      ) {
        setError(
          "Invalid role."
        );
        return;
      }

      await action(
        () =>
          rpc(
            "admin_approve_user",
            {
              target_user_id:
                modal.account.user_id,
              assigned_role:
                role,
            }
          ),
        "Account approved."
      );
      return;
    }

    if (
      modal.kind ===
      "REJECT"
    ) {
      await action(
        () =>
          rpc(
            "admin_reject_user",
            {
              target_user_id:
                modal.account.user_id,
              reason:
                values.reason.trim(),
            }
          ),
        "Account rejected."
      );
      return;
    }

    if (
      modal.kind ===
      "SUSPEND"
    ) {
      await action(
        () =>
          rpc(
            "admin_suspend_user",
            {
              target_user_id:
                selected.user_id,
              suspension_reason:
                values.reason.trim(),
            }
          ),
        "Account suspended."
      );
      return;
    }

    if (
      modal.kind ===
      "ARCHIVE"
    ) {
      await action(
        () =>
          rpc(
            "admin_archive_user_v2",
            {
              target_user_id:
                selected.user_id,
              archive_reason_text:
                values.reason.trim(),
            }
          ),
        "Account archived."
      );
      return;
    }

    if (
      modal.kind ===
      "PERMANENT_DELETE"
    ) {
      try {
        setBusy(true);
        setError("");

        await rpc(
          "admin_permanently_delete_unused_user_v2",
          {
            target_user_id:
              selected.user_id,
            deletion_reason:
              values.reason.trim(),
          }
        );

        setSelected(null);
        setProfile(null);
        setProgress([]);

        await loadAll();

        showAdminSuccess(
          "Unused account permanently deleted.",
          "The deletion was allowed because the account had no protected AeroPath operational history."
        );
      } catch (e) {
        setError(
          e?.message ||
            "Permanent deletion failed."
        );
      } finally {
        setBusy(false);
      }

      return;
    }

    if (
      modal.kind ===
      "EDIT_ASSIGNMENT"
    ) {
      const hours =
        Number(values.hours);

      if (
        !Number.isFinite(hours) ||
        hours < 0
      ) {
        setError(
          "Hours must be zero or greater."
        );
        return;
      }

      await action(
        () =>
          rpc(
            "admin_update_student_programme_hours_v2",
            {
              target_assignment_id:
                modal.item.assignment_id,
              new_assigned_minutes:
                Math.round(
                  hours * 60
                ),
              assignment_notes:
                values.notes.trim() ||
                null,
            }
          ),
        "Programme hours updated."
      );
      return;
    }

    if (
      modal.kind ===
      "REMOVE_ASSIGNMENT"
    ) {
      await action(
        () =>
          rpc(
            "admin_remove_student_programme_v2",
            {
              target_assignment_id:
                modal.item.assignment_id,
              removal_reason:
                values.reason.trim(),
            }
          ),
        "Programme assignment removed."
      );
    }
  }


  return (
    <main className="app accounts-redesign-page">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <span className="role">Admin</span>
          <button className="secondary" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <section className="admin-page accounts-admin-page">
        <button className={`secondary back-button accounts-back-button ${selected ? "" : "root"}`} onClick={selected ? () => setSelected(null) : onBack}>
          ← {selected ? "Back to accounts" : "Back to dashboard"}
        </button>
        <div className="aero-page-heading accounts-page-heading">
          <div>
            <div className="eyebrow">ADMINISTRATION</div>
            <h1>{selected ? (selected.full_name || selected.email) : "User Management"}</h1>
            <p className="muted">
              {selected ? "Manage this user's profile, access, programmes, progress and account status." : "Approve users and manage AeroPath accounts, roles and training assignments."}
            </p>
          </div>
          <div className="aero-heading-aside">
            <ModuleEmblem name="accounts" />
            <div className="accounts-control-status">
              <span className="aero-system-dot" />
              {selected ? (selected.archived_at ? "Archived account" : formatLabel(selected.account_status)) : `${accounts.length} accounts`}
            </div>
          </div>
        </div>

{!selected ? (
          <>
            <div className="admin-stats account-status-tabs">
              {["PENDING", "APPROVED", "SUSPENDED", "REJECTED", "ARCHIVED"].map((s) => (
                <button key={s} className={statusFilter === s ? "stat-card active" : "stat-card"} onClick={() => setStatusFilter(s)}>
                  <strong>{accounts.filter((a) => s === "ARCHIVED" ? !!a.archived_at : (!a.archived_at && a.account_status === s)).length}</strong>
                  <span>{formatLabel(s)}</span>
                </button>
              ))}
            </div>
            <div className="student-booking-card accounts-search-panel">
              <label>Search accounts</label>
              <input value={search} placeholder="Name, email, role or programme" onChange={(e) => setSearch(e.target.value)} />
            </div>
            {loading ? <div className="admin-empty">Loading accounts...</div> : (
              <div className="user-list">
                {visibleAccounts.map((a) => (
                  <article className={`user-card account-user-card account-${String(a.archived_at ? "ARCHIVED" : a.account_status).toLowerCase()}`} key={a.user_id}>
                    <div className="user-card-header">
                      <div>
                        <div className="user-name">{a.display_name || a.full_name || "Unnamed user"}</div>
                        <div className="user-email">{a.email}</div>
                      </div>
                      <span className={`account-status-badge status-${String(a.archived_at ? "ARCHIVED" : a.account_status).toLowerCase()}`}>{a.archived_at ? "ARCHIVED" : a.account_status}</span>
                    </div>
                    <div className="account-role-list">
                      {(a.roles ?? []).length > 0 ? (a.roles ?? []).map((role) => <span key={role}>{formatRole(role)}</span>) : <span>No role assigned</span>}
                    </div>
                    {(a.programmes ?? []).length > 0 && (
                      <p className="account-programme-line"><strong>Programmes</strong>{(a.programmes ?? []).map((p) => p?.name).filter(Boolean).join(", ")}</p>
                    )}
                    <div className="booking-actions">
                      {a.account_status === "PENDING" && !a.archived_at && <button className="primary" onClick={() => approve(a)}>Approve</button>}
                      {a.account_status === "PENDING" && !a.archived_at && <button className="secondary" onClick={() => reject(a)}>Reject</button>}
                      <button className="secondary" onClick={() => openUser(a)}>Manage user</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="booking-filter-grid account-detail-tabs">
              {["PROFILE", "ROLES", "PROGRAMMES", "PROGRESS", "CONTROLS"].map((x) => (
                <button key={x} className={tab === x ? "stat-card active" : "stat-card"} onClick={() => setTab(x)}>
                  <span>{formatLabel(x === "PROGRAMMES" ? "PROGRAMMES & HOURS" : x === "CONTROLS" ? "ACCOUNT CONTROLS" : x)}</span>
                </button>
              ))}
            </div>

            {tab === "PROFILE" && profile && (
              <form className="student-booking-card account-profile-form" onSubmit={saveProfile}>
                <h2>Profile</h2>
                <Field label="Full name"><input value={profile.full_name ?? ""} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} /></Field>
                <Field label="Display name"><input value={profile.display_name ?? ""} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} /></Field>
                <Field label="Email"><input value={profile.email ?? ""} disabled /></Field>
                <Field label="Phone"><input value={profile.phone ?? ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
                <Field label="Date of birth"><input type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={profile.date_of_birth ?? ""} onChange={(e) => setProfile({ ...profile, date_of_birth: e.target.value })} /></Field>
                <Field label="Emergency contact name"><input value={profile.emergency_contact_name ?? ""} onChange={(e) => setProfile({ ...profile, emergency_contact_name: e.target.value })} /></Field>
                <Field label="Emergency contact phone"><input value={profile.emergency_contact_phone ?? ""} onChange={(e) => setProfile({ ...profile, emergency_contact_phone: e.target.value })} /></Field>
                <Field label="Address"><textarea value={profile.address ?? ""} onChange={(e) => setProfile({ ...profile, address: e.target.value })} /></Field>
                <Field label="About"><textarea value={profile.about ?? ""} onChange={(e) => setProfile({ ...profile, about: e.target.value })} /></Field>
                <Field label="Staff notes (not visible to student)"><textarea value={profile.staff_notes ?? ""} onChange={(e) => setProfile({ ...profile, staff_notes: e.target.value })} /></Field>
                <button className="primary" disabled={busy}>Save profile</button>
              </form>
            )}

            {tab === "ROLES" && (
              <div className="student-booking-card account-role-panel">
                <h2>Roles</h2>
                <div className="booking-actions">
                  {ROLE_OPTIONS.map((r) => {
                    const has = (selected.roles ?? []).includes(r);
                    return has
                      ? <button key={r} className="secondary" disabled={busy} onClick={() => removeRole(r)}>Remove {formatRole(r)}</button>
                      : <button key={r} className="primary" disabled={busy} onClick={() => addRole(r)}>Add {formatRole(r)}</button>;
                  })}
                </div>
              </div>
            )}

            {tab === "PROGRAMMES" && (
              <>
                <form className="student-booking-card programme-assignment-form" onSubmit={assignProgramme}>
                  <h2>Assign programme & hours</h2>
                  <label>Programme</label>
                  <select value={assignment.programmeId} onChange={(e) => setAssignment({ ...assignment, programmeId: e.target.value })}>
                    <option value="">Choose programme</option>
                    {programmes.filter((p) => p.active).map((p) => <option key={p.programme_id} value={p.programme_id}>{p.name}</option>)}
                  </select>
                  <label>Assigned hours</label>
                  <input type="number" min="0" step="0.1" value={assignment.hours} onChange={(e) => setAssignment({ ...assignment, hours: e.target.value })} />
                  <label>Assignment notes</label>
                  <textarea value={assignment.notes} onChange={(e) => setAssignment({ ...assignment, notes: e.target.value })} />
                  <button className="primary" disabled={busy}>Assign / reactivate</button>
                </form>

                <div className="student-booking-list">
                  {progress.map((p) => (
                    <article className={`student-booking-card programme-assignment-card ${p.assignment_active ? "active" : "inactive"}`} key={p.assignment_id}>
                      <div className="student-booking-header">
                        <h3>{p.programme_name}</h3>
                        <span className="role">{p.assignment_active ? "ACTIVE" : "INACTIVE"}</span>
                      </div>
                      <div className="programme-hours-summary"><span>Assigned <strong>{p.assigned_hours} h</strong></span><span>Completed <strong>{p.completed_hours} h</strong></span><span>Remaining <strong>{p.remaining_hours} h</strong></span></div>
                      <div className="programme-progress-track"><span style={{ width: `${Math.min(100, Math.max(0, Number(p.progress_percent || 0)))}%` }} /></div>
                      {p.assignment_notes && <p className="muted">{p.assignment_notes}</p>}
                      {p.assignment_active && <div className="booking-actions">
                        <button className="secondary" onClick={() => editAssignment(p)}>Edit hours</button>
                        <button className="secondary" onClick={() => removeAssignment(p)}>Remove assignment</button>
                      </div>}
                    </article>
                  ))}
                </div>

                <form className="student-booking-card programme-create-form" onSubmit={createProgramme}>
                  <h2>Create free-text programme</h2>
                  <label>Programme name</label>
                  <input value={newProgramme.name} onChange={(e) => setNewProgramme({ ...newProgramme, name: e.target.value })} placeholder="e.g. IFR Refresher" />
                  <label>Description</label>
                  <textarea value={newProgramme.description} onChange={(e) => setNewProgramme({ ...newProgramme, description: e.target.value })} />
                  <button className="primary" disabled={busy}>Create programme</button>
                </form>

                <div className="student-booking-list">
                  {programmes.map((p) => (
                    <article className={`student-booking-card programme-catalogue-card ${p.active ? "active" : "inactive"}`} key={p.programme_id}>
                      <div className="student-booking-header">
                        <div><h3>{p.name}</h3><p className="muted">{p.description || "No description"}</p></div>
                        <span className="role">{p.active ? "ACTIVE" : "INACTIVE"}</span>
                      </div>
                      <button className="secondary" onClick={() => toggleProgramme(p)}>{p.active ? "Deactivate" : "Reactivate"}</button>
                    </article>
                  ))}
                </div>
              </>
            )}

            {tab === "PROGRESS" && (
              <div className="student-booking-list">
                {progress.length === 0 ? <div className="admin-empty">No programme assignments.</div> : progress.map((p) => (
                  <article className="student-booking-card account-progress-card" key={p.assignment_id}>
                    <h3>{p.programme_name}</h3>
                    <div className="booking-details-grid">
                      <Detail label="Assigned" value={`${p.assigned_hours} h`} />
                      <Detail label="Completed" value={`${p.completed_hours} h`} />
                      <Detail label="Remaining" value={`${p.remaining_hours} h`} />
                      <Detail label="Progress" value={`${p.progress_percent}%`} />
                    </div>
                    <div className="programme-progress-track"><span style={{ width: `${Math.min(100, Math.max(0, Number(p.progress_percent || 0)))}%` }} /></div>
                  </article>
                ))}
              </div>
            )}

            {tab === "CONTROLS" && (
              <div className="student-booking-card account-controls-panel">
                <h2>Account controls</h2>
                <p className="muted">Archive preserves AeroPath history. Permanent delete is only available for unused accounts with no protected history.</p>
                <div className="booking-actions">
                  {!selected.archived_at && selected.account_status === "APPROVED" && <button className="secondary" disabled={busy} onClick={suspend}>Suspend</button>}
                  {!selected.archived_at && selected.account_status === "SUSPENDED" && <button className="secondary" disabled={busy} onClick={reactivateSuspended}>Reactivate suspension</button>}
                  {!selected.archived_at && <button className="secondary" disabled={busy} onClick={archive}>Archive account</button>}
                  {selected.archived_at && <button className="primary" disabled={busy} onClick={reactivateArchived}>Reactivate archived account</button>}
                  <button className="secondary" disabled={busy} onClick={permanentDelete}>Permanent delete unused account</button>
                </div>
                {profile?.archive_reason && <p className="muted">Archive reason: {profile.archive_reason}</p>}
              </div>
            )}
          </>
        )}
      </section>

      <ActionConfirmModal
        open={Boolean(confirmModal)}
        eyebrow={
          confirmModal?.eyebrow
        }
        title={
          confirmModal?.title
        }
        message={
          confirmModal?.message
        }
        confirmLabel={
          confirmModal?.confirmLabel
        }
        danger={
          Boolean(
            confirmModal?.danger
          )
        }
        onConfirm={
          executeConfirmModal
        }
        onClose={() =>
          setConfirmModal(null)
        }
      />

      <ActionErrorModal
        open={Boolean(error)}
        title="Account action blocked"
        message={error}
        onClose={() => setError("")}
      />

      <ActionFormModal
        open={Boolean(formModal)}
        eyebrow={
          formModal?.eyebrow
        }
        title={
          formModal?.title
        }
        message={
          formModal?.message
        }
        fields={
          formModal?.fields ?? []
        }
        confirmLabel={
          formModal?.confirmLabel
        }
        danger={
          Boolean(
            formModal?.danger
          )
        }
        onConfirm={
          executeFormModal
        }
        onClose={() =>
          setFormModal(null)
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

function Field({ label, children }) { return <div style={{ marginBottom: 14 }}><label>{label}</label>{children}</div>; }
function Detail({ label, value }) { return <div><span className="muted">{label}</span><strong style={{ display: "block" }}>{value}</strong></div>; }
function Brand() { return <div><strong>AeroPath</strong><div className="muted" style={{ fontSize: 11 }}>by Aeroviation</div></div>; }
function formatRole(v) { return formatLabel(v); }
function formatLabel(v) { return String(v ?? "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }
