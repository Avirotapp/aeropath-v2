import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import ActionToast from "./ActionToast";
import ModuleEmblem from "./ModuleEmblem";

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

export default function MyProfilePage({ onBack, onSignOut }) {
  const [profile, setProfile] = useState(null);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try {
      setLoading(true); setError("");
      const [rows, programmeRows] = await Promise.all([
        rpc("my_profile_v2"),
        safeRpc("list_student_programme_progress_v2", { target_student_id: null }, []),
      ]);
      setProfile(rows?.[0] ?? null);
      setProgress(programmeRows ?? []);
    } catch (e) { setError(e?.message || "Unable to load profile."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    if (!profile?.full_name?.trim()) return setError("Full name is required.");
    try {
      setBusy(true); setError(""); setSuccess("");
      await rpc("update_my_profile_v2", {
        new_full_name: profile.full_name.trim(),
        new_display_name: profile.display_name || null,
        new_phone: profile.phone || null,
        new_date_of_birth: profile.date_of_birth || null,
        new_emergency_contact_name: profile.emergency_contact_name || null,
        new_emergency_contact_phone: profile.emergency_contact_phone || null,
        new_address: profile.address || null,
        new_about: profile.about || null,
      });
      setSuccess("Profile updated.");
      await load();
    } catch (e2) { setError(e2?.message || "Unable to update profile."); }
    finally { setBusy(false); }
  }

  return (
    <main className="app">
      <header className="topbar">
        <Brand />
        <div className="topbar-right"><button className="secondary" onClick={onSignOut}>Sign out</button></div>
      </header>
      <section className="bookings-page">
        <button className="secondary back-button" onClick={onBack}>← Back to dashboard</button>
        <div className="aero-page-heading">
          <div>
            <div className="eyebrow">MY ACCOUNT</div>
            <h1>My Profile</h1>
            <p className="muted">Update your personal/contact information. Roles, programme allocation, assigned hours and account controls remain Admin-managed.</p>
          </div>
          <ModuleEmblem name="profile" />
        </div>
        {error && <div className="login-error booking-message">{error}</div>}
{loading ? <div className="admin-empty">Loading profile...</div> : profile && (
          <>
            <form className="student-booking-card" onSubmit={save}>
              <label>Full name *</label><input value={profile.full_name ?? ""} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
              <label>Display name</label><input value={profile.display_name ?? ""} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
              <label>Email</label><input value={profile.email ?? ""} disabled />
              <label>Phone</label><input value={profile.phone ?? ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              <label>Date of birth</label><input type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={profile.date_of_birth ?? ""} onChange={(e) => setProfile({ ...profile, date_of_birth: e.target.value })} />
              <label>Emergency contact name</label><input value={profile.emergency_contact_name ?? ""} onChange={(e) => setProfile({ ...profile, emergency_contact_name: e.target.value })} />
              <label>Emergency contact phone</label><input value={profile.emergency_contact_phone ?? ""} onChange={(e) => setProfile({ ...profile, emergency_contact_phone: e.target.value })} />
              <label>Address</label><textarea value={profile.address ?? ""} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
              <label>About</label><textarea value={profile.about ?? ""} onChange={(e) => setProfile({ ...profile, about: e.target.value })} />
              <button className="primary" disabled={busy}>Save profile</button>
            </form>

            {progress.length > 0 && (
              <div className="student-booking-card">
                <h2>My Training Progress</h2>
                <div className="booking-details-grid">
                  {progress.filter((p) => p.assignment_active).map((p) => (
                    <div key={p.assignment_id}>
                      <strong>{p.programme_name}</strong>
                      <p>{p.completed_hours} / {p.assigned_hours} h</p>
                      <p className="muted">{p.remaining_hours} h remaining · {p.progress_percent}%</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <ActionToast
        open={Boolean(success)}
        message={success}
        onClose={() =>
          setSuccess("")
        }
      />
    </main>
  );
}

function Brand() { return <div><strong>AeroPath</strong><div className="muted" style={{ fontSize: 11 }}>by Aeroviation</div></div>; }
