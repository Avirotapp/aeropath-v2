import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "./lib/supabase";
import ActionSuccessModal from "./ActionSuccessModal";
import ActionConfirmModal from "./ActionConfirmModal";
import ActionErrorModal from "./ActionErrorModal";
import ModuleEmblem from "./ModuleEmblem";

async function studentListPreflights() {
  const { data, error } =
    await supabase.rpc(
      "student_list_preflight_bookings"
    );

  if (error) throw error;

  return data ?? [];
}

async function operationalListPreflights() {
  const { data, error } =
    await supabase.rpc(
      "operational_list_preflights"
    );

  if (error) throw error;

  return data ?? [];
}

async function submitPreflight({
  bookingId,
  departure,
  arrival,
  alternate,
  weather,
  notams,
  fuel,
  massBalance,
  performance,
  sunrise,
  sunset,
}) {
  const { data, error } =
    await supabase.rpc(
      "student_submit_preflight",
      {
        target_booking_id:
          bookingId,

        preflight_departure:
          departure,

        preflight_arrival:
          arrival,

        preflight_alternate:
          alternate || null,

        preflight_weather_briefing:
          weather || null,

        preflight_notam_briefing:
          notams || null,

        preflight_fuel_data: {
          notes: fuel || "",
        },

        preflight_mass_balance_data: {
          notes:
            massBalance || "",
        },

        preflight_performance_data: {
          notes:
            performance || "",
        },

        preflight_sunrise_time:
          sunrise || null,

        preflight_sunset_time:
          sunset || null,
      }
    );

  if (error) throw error;

  return data;
}

async function acceptPreflight(
  submissionId
) {
  const { data, error } =
    await supabase.rpc(
      "operational_accept_preflight",
      {
        target_submission_id:
          submissionId,
      }
    );

  if (error) throw error;

  return data;
}

async function requestChanges(
  submissionId,
  reason
) {
  const { data, error } =
    await supabase.rpc(
      "operational_request_preflight_changes",
      {
        target_submission_id:
          submissionId,
        reason,
      }
    );

  if (error) throw error;

  return data;
}

export default function PreflightPage({
  role,
  onBack,
  onSignOut,
}) {
  const isStudent =
    role === "STUDENT";

  const [items, setItems] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [
    successModal,
    setSuccessModal,
  ] = useState(null);

  const [
    confirmAction,
    setConfirmAction,
  ] = useState(null);

  const [busyId, setBusyId] =
    useState(null);

  const [forms, setForms] =
    useState({});

  const [filter, setFilter] =
    useState(
      isStudent
        ? "ALL"
        : "SUBMITTED"
    );

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const data =
        isStudent
          ? await studentListPreflights()
          : await operationalListPreflights();

      setItems(data);
    } catch (err) {
      console.error(
        "Failed to load pre-flight data:",
        err
      );

      setError(
        err?.message ||
          "Unable to load pre-flight data."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredItems =
    useMemo(() => {
      if (filter === "ALL") {
        return items;
      }

      if (
        filter ===
        "NOT_SUBMITTED"
      ) {
        return items.filter(
          (item) =>
            !item.submission_id
        );
      }

      return items.filter(
        (item) =>
          item.review_status ===
          filter
      );
    }, [items, filter]);

  const counts =
    useMemo(
      () => ({
        ALL: items.length,

        NOT_SUBMITTED:
          items.filter(
            (item) =>
              !item.submission_id
          ).length,

        SUBMITTED:
          items.filter(
            (item) =>
              item.review_status ===
              "SUBMITTED"
          ).length,

        CHANGES_REQUESTED:
          items.filter(
            (item) =>
              item.review_status ===
              "CHANGES_REQUESTED"
          ).length,

        ACCEPTED:
          items.filter(
            (item) =>
              item.review_status ===
              "ACCEPTED"
          ).length,
      }),
      [items]
    );

  function defaultForm(item) {
    return {
      departure:
        item.departure || "",

      arrival:
        item.arrival || "",

      alternate:
        item.alternate || "",

      weather:
        item.weather_briefing ||
        "",

      notams:
        item.notam_briefing ||
        "",

      fuel:
        item.fuel_data?.notes ||
        "",

      massBalance:
        item.mass_balance_data
          ?.notes || "",

      performance:
        item.performance_data
          ?.notes || "",

      sunrise:
        normaliseTime(
          item.sunrise_time
        ),

      sunset:
        normaliseTime(
          item.sunset_time
        ),
    };
  }

  function getForm(item) {
    return (
      forms[item.booking_id] ||
      defaultForm(item)
    );
  }

  function updateForm(
    item,
    field,
    value
  ) {
    setForms((current) => ({
      ...current,

      [item.booking_id]: {
        ...defaultForm(item),
        ...current[
          item.booking_id
        ],
        [field]: value,
      },
    }));
  }

  function handleSubmit(item) {
    const form = getForm(item);

    if (
      !form.departure.trim()
    ) {
      setError(
        "Departure is required."
      );
      return;
    }

    if (
      !form.arrival.trim()
    ) {
      setError(
        "Arrival is required."
      );
      return;
    }

    const version =
      (item.current_version ||
        0) + 1;

    setError("");

    setConfirmAction({
      kind: "SUBMIT",
      item,
      form,
      version,
      eyebrow:
        "SUBMIT PREFLIGHT",
      title:
        `Submit Pre-flight Version ${version}?`,
      message:
        "Once submitted, this version becomes read-only unless an Instructor/Admin requests changes.",
      confirmLabel:
        "Submit pre-flight",
    });
  }


  async function executeSubmit(
    item,
    form,
    version
  ) {
    try {
      setConfirmAction(null);

      setBusyId(
        item.booking_id
      );

      setError("");
      setSuccess("");

      await submitPreflight({
        bookingId:
          item.booking_id,

        ...form,
      });

      setForms(
        (current) => {
          const next = {
            ...current,
          };

          delete next[
            item.booking_id
          ];

          return next;
        }
      );

      await loadData();

      setSuccessModal({
        eyebrow:
          "PREFLIGHT SENT",
        title:
          `Pre-flight Version ${version} submitted`,
        message:
          "Your booking-specific pre-flight preparation has been sent successfully and is now read-only unless changes are requested.",
        nextText:
          "Await Instructor/Admin review. AeroPath will show this under Waiting On in your Flight Deck.",
      });
    } catch (err) {
      console.error(
        "Pre-flight submission failed:",
        err
      );

      setError(
        err?.message ||
          "Unable to submit pre-flight."
      );
    } finally {
      setBusyId(null);
    }
  }


  function handleAccept(item) {
    setConfirmAction({
      kind: "ACCEPT",
      item,
      eyebrow:
        "ACCEPT PREFLIGHT",
      title:
        `Accept Pre-flight Version ${item.current_version}?`,
      message:
        "The submitted version will be marked accepted and locked for the student.",
      confirmLabel:
        "Accept pre-flight",
    });
  }


  async function executeAccept(
    item
  ) {
    try {
      setConfirmAction(null);

      setBusyId(
        item.submission_id
      );

      setError("");
      setSuccess("");

      await acceptPreflight(
        item.submission_id
      );

      await loadData();

      setSuccessModal({
        eyebrow:
          "PREFLIGHT ACCEPTED",
        title:
          "Pre-flight accepted",
        message:
          `${item.student_name || item.student_email || "Student"} · ${item.simulator_name}`,
        nextText:
          "The student's Flight Deck will no longer show this pre-flight as awaiting review.",
      });
    } catch (err) {
      console.error(
        "Pre-flight acceptance failed:",
        err
      );

      setError(
        err?.message ||
          "Unable to accept pre-flight."
      );
    } finally {
      setBusyId(null);
    }
  }


  function handleRequestChanges(
    item
  ) {
    setConfirmAction({
      kind:
        "REQUEST_CHANGES",
      item,
      eyebrow:
        "REQUEST CHANGES",
      title:
        "Return this pre-flight for changes?",
      message:
        "The student will be able to edit the preparation and submit a new version.",
      confirmLabel:
        "Request changes",
      danger: true,
      inputLabel:
        "What must the student change?",
      inputPlaceholder:
        "Give the student a clear correction or briefing instruction.",
      inputRequired: true,
    });
  }


  async function executeRequestChanges(
    item,
    reason
  ) {
    try {
      setConfirmAction(null);

      setBusyId(
        item.submission_id
      );

      setError("");
      setSuccess("");

      await requestChanges(
        item.submission_id,
        reason.trim()
      );

      await loadData();

      setSuccessModal({
        eyebrow:
          "CHANGES REQUESTED",
        title:
          "Pre-flight returned to student",
        message:
          "The student may now revise the preparation and submit a new version.",
        nextText:
          "This item will appear as an action on the student's Flight Deck.",
      });
    } catch (err) {
      console.error(
        "Pre-flight change request failed:",
        err
      );

      setError(
        err?.message ||
          "Unable to request changes."
      );
    } finally {
      setBusyId(null);
    }
  }


  return (
    <main className="app preflight-redesign-page">
      <header className="topbar">
        <Brand />

        <div className="topbar-right">
          <span className="role">
            {formatRole(role)}
          </span>

          <button
            className="secondary"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="bookings-page preflight-page">
        <button
          className="secondary back-button"
          onClick={onBack}
        >
          ← Back to dashboard
        </button>

        <div className="aero-page-heading preflight-page-heading">
          <div>
            <div className="eyebrow">FLIGHT PREPARATION</div>
            <h1>
              {isStudent ? "Pre-flight" : "Pre-flight Reviews"}
            </h1>
            <p className="muted">
              {isStudent
                ? "Prepare and submit booking-specific planning before your simulator or aircraft session."
                : "Review submitted planning, accept it, or return it with a clear correction briefing."}
            </p>
          </div>
          <div className="aero-heading-aside">
            <ModuleEmblem name="preflight" />
            <div className="preflight-control-status">
              <span className="aero-system-dot" />
              {isStudent ? "Preparation desk" : `${counts.SUBMITTED} awaiting review`}
            </div>
          </div>
        </div>

        <div className="booking-filter-grid preflight-status-tabs">
          {isStudent && (
            <>
              <FilterCard
                label="All"
                count={
                  counts.ALL
                }
                active={
                  filter === "ALL"
                }
                onClick={() =>
                  setFilter("ALL")
                }
              />

              <FilterCard
                label="Not Submitted"
                count={
                  counts.NOT_SUBMITTED
                }
                active={
                  filter ===
                  "NOT_SUBMITTED"
                }
                onClick={() =>
                  setFilter(
                    "NOT_SUBMITTED"
                  )
                }
              />
            </>
          )}

          <FilterCard
            label="Submitted"
            count={
              counts.SUBMITTED
            }
            active={
              filter ===
              "SUBMITTED"
            }
            onClick={() =>
              setFilter(
                "SUBMITTED"
              )
            }
          />

          <FilterCard
            label="Changes"
            count={
              counts.CHANGES_REQUESTED
            }
            active={
              filter ===
              "CHANGES_REQUESTED"
            }
            onClick={() =>
              setFilter(
                "CHANGES_REQUESTED"
              )
            }
          />

          <FilterCard
            label="Accepted"
            count={
              counts.ACCEPTED
            }
            active={
              filter ===
              "ACCEPTED"
            }
            onClick={() =>
              setFilter(
                "ACCEPTED"
              )
            }
          />
        </div>

        {loading ? (
          <div className="admin-empty">
            Loading pre-flight
            information...
          </div>
        ) : filteredItems.length ===
          0 ? (
          <div className="admin-empty">
            No pre-flight items in
            this category.
          </div>
        ) : (
          <div className="student-booking-list">
            {filteredItems.map(
              (item) => {
                const itemIsBusy =
                  busyId !== null &&
                  (
                    busyId ===
                      item.booking_id ||
                    (
                      item.submission_id !==
                        null &&
                      busyId ===
                        item.submission_id
                    )
                  );

                return (
                  <PreflightCard
                    key={
                      item.booking_id
                    }
                    item={item}
                    role={role}
                    form={getForm(
                      item
                    )}
                    busy={
                      itemIsBusy
                    }
                    onChange={(
                      field,
                      value
                    ) =>
                      updateForm(
                        item,
                        field,
                        value
                      )
                    }
                    onSubmit={() =>
                      handleSubmit(
                        item
                      )
                    }
                    onAccept={() =>
                      handleAccept(
                        item
                      )
                    }
                    onRequestChanges={() =>
                      handleRequestChanges(
                        item
                      )
                    }
                  />
                );
              }
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
            "SUBMIT"
          ) {
            executeSubmit(
              confirmAction.item,
              confirmAction.form,
              confirmAction.version
            );
            return;
          }

          if (
            confirmAction?.kind ===
            "ACCEPT"
          ) {
            executeAccept(
              confirmAction.item
            );
            return;
          }

          if (
            confirmAction?.kind ===
            "REQUEST_CHANGES"
          ) {
            executeRequestChanges(
              confirmAction.item,
              inputValue
            );
          }
        }}
      />

      <ActionErrorModal
        open={Boolean(error)}
        title="Pre-flight action blocked"
        message={error}
        onClose={() => setError("")}
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
        onPrimary={() => {
          setSuccessModal(null);
          onBack();
        }}
        onClose={() =>
          setSuccessModal(null)
        }
      />
    </main>
  );
}

function PreflightCard({
  item,
  role,
  form,
  busy,
  onChange,
  onSubmit,
  onAccept,
  onRequestChanges,
}) {
  const isStudent =
    role === "STUDENT";

  const editable =
    isStudent &&
    (
      !item.submission_id ||
      item.review_status ===
        "CHANGES_REQUESTED"
    );

  return (
    <article className={`student-booking-card preflight-card preflight-${String(item.review_status || "NOT_SUBMITTED").toLowerCase()}`}>
      <div className="student-booking-header">
        <div>
          <h3>
            {
              item.simulator_name
            }
          </h3>

          <p>
            {isStudent
              ? formatDateTime(
                  item.approved_start
                )
              : `${item.student_name || item.student_email} · ${formatDateTime(
                  item.approved_start
                )}`}
          </p>
        </div>

        <PreflightBadge
          item={item}
        />
      </div>

      <div className="booking-details-grid instructor-booking-details">
        {!isStudent && (
          <Detail
            label="Student"
            value={
              item.student_name ||
              "—"
            }
          />
        )}

        <Detail
          label="Training resource"
          value={
            item.simulator_identifier ||
            item.simulator_name
          }
        />

        <Detail
          label="Session"
          value={formatDateTime(
            item.approved_start
          )}
        />

        <Detail
          label="Current version"
          value={
            item.current_version
              ? `Version ${item.current_version}`
              : "Not submitted"
          }
        />
      </div>

      {item.review_status ===
        "CHANGES_REQUESTED" &&
        item.review_reason && (
          <div className="booking-rejection">
            <strong>
              Changes requested
            </strong>

            <p>
              {
                item.review_reason
              }
            </p>
          </div>
        )}

      {editable ? (
        <div className="instructor-approval-panel preflight-form-panel">
          <div className="eyebrow">
            PREFLIGHT PREPARATION
          </div>

          <h4>
            {item.current_version
              ? `Prepare Version ${
                  item.current_version +
                  1
                }`
              : "Prepare submission"}
          </h4>

          <div className="booking-time-grid">
            <Field
              label="Departure ICAO *"
              value={
                form.departure
              }
              onChange={(value) =>
                onChange(
                  "departure",
                  value
                )
              }
              placeholder="WSSS"
            />

            <Field
              label="Arrival ICAO *"
              value={
                form.arrival
              }
              onChange={(value) =>
                onChange(
                  "arrival",
                  value
                )
              }
              placeholder="WSSL"
            />
          </div>

          <Field
            label="Alternate ICAO"
            value={
              form.alternate
            }
            onChange={(value) =>
              onChange(
                "alternate",
                value
              )
            }
            placeholder="Optional"
          />

          <TextAreaField
            label="METAR / TAF / Weather briefing"
            value={
              form.weather
            }
            onChange={(value) =>
              onChange(
                "weather",
                value
              )
            }
          />

          <TextAreaField
            label="NOTAM briefing"
            value={
              form.notams
            }
            onChange={(value) =>
              onChange(
                "notams",
                value
              )
            }
          />

          <TextAreaField
            label="Fuel planning"
            value={
              form.fuel
            }
            onChange={(value) =>
              onChange(
                "fuel",
                value
              )
            }
            placeholder="Trip fuel, contingency, reserve, total fuel..."
          />

          <TextAreaField
            label="Mass & balance"
            value={
              form.massBalance
            }
            onChange={(value) =>
              onChange(
                "massBalance",
                value
              )
            }
          />

          <TextAreaField
            label="Performance"
            value={
              form.performance
            }
            onChange={(value) =>
              onChange(
                "performance",
                value
              )
            }
            placeholder="TORA, TODR, TORR, LDA, landing distance..."
          />

          <div className="booking-time-grid">
            <TimeField
              label="Sunrise"
              value={
                form.sunrise
              }
              onChange={(value) =>
                onChange(
                  "sunrise",
                  value
                )
              }
            />

            <TimeField
              label="Sunset"
              value={
                form.sunset
              }
              onChange={(value) =>
                onChange(
                  "sunset",
                  value
                )
              }
            />
          </div>

          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={onSubmit}
          >
            {busy
              ? "Submitting..."
              : "Submit pre-flight"}
          </button>
        </div>
      ) : item.submission_id ? (
        <ReadOnlyPreflight
          item={item}
        />
      ) : (
        <div className="booking-lock-note">
          No pre-flight submission
          has been received yet.
        </div>
      )}

      {!isStudent &&
        item.review_status ===
          "SUBMITTED" && (
          <div className="instructor-action-grid">
            <button
              className="primary"
              type="button"
              disabled={busy}
              onClick={
                onAccept
              }
            >
              {busy
                ? "Processing..."
                : "Accept pre-flight"}
            </button>

            <button
              className="danger-button"
              type="button"
              disabled={busy}
              onClick={
                onRequestChanges
              }
            >
              Request changes
            </button>
          </div>
        )}
    </article>
  );
}

function ReadOnlyPreflight({
  item,
}) {
  return (
        <div className="instructor-approval-panel preflight-readonly-panel">
      <div className="eyebrow">
        PREFLIGHT SENT
      </div>

      <h4>
        Version{" "}
        {
          item.current_version
        }
      </h4>

      <div className="booking-details-grid">
        <Detail
          label="Departure"
          value={
            item.departure ||
            "—"
          }
        />

        <Detail
          label="Arrival"
          value={
            item.arrival ||
            "—"
          }
        />

        <Detail
          label="Alternate"
          value={
            item.alternate ||
            "—"
          }
        />

        <Detail
          label="Sunrise"
          value={
            normaliseTime(
              item.sunrise_time
            ) || "—"
          }
        />

        <Detail
          label="Sunset"
          value={
            normaliseTime(
              item.sunset_time
            ) || "—"
          }
        />
      </div>

      <ReadOnlySection
        title="Weather"
        value={
          item.weather_briefing
        }
      />

      <ReadOnlySection
        title="NOTAM"
        value={
          item.notam_briefing
        }
      />

      <ReadOnlySection
        title="Fuel"
        value={
          item.fuel_data?.notes
        }
      />

      <ReadOnlySection
        title="Mass & balance"
        value={
          item.mass_balance_data
            ?.notes
        }
      />

      <ReadOnlySection
        title="Performance"
        value={
          item.performance_data
            ?.notes
        }
      />

      <div className="booking-lock-note">
        {item.review_status ===
        "ACCEPTED"
          ? "Accepted by an instructor. This version is locked."
          : "Pre-flight sent! This version is read-only until an instructor requests changes."}
      </div>
    </div>
  );
}

function ReadOnlySection({
  title,
  value,
}) {
  if (!value) {
    return null;
  }

  return (
    <div className="booking-note">
      <strong>
        {title}
      </strong>

      <p>{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}) {
  return (
    <div className="booking-field">
      <label>{label}</label>

      <input
        value={value}
        placeholder={
          placeholder
        }
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
      />
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}) {
  return (
    <div className="booking-field">
      <label>{label}</label>

      <input
        type="text" inputMode="numeric" placeholder="HH:mm"
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}) {
  return (
    <div className="booking-field">
      <label>{label}</label>

      <textarea
        value={value}
        placeholder={
          placeholder
        }
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
      />
    </div>
  );
}

function PreflightBadge({
  item,
}) {
  if (!item.submission_id) {
    return (
      <span className="booking-status requested">
        NOT SUBMITTED
      </span>
    );
  }

  switch (
    item.review_status
  ) {
    case "ACCEPTED":
      return (
        <span className="booking-status approved">
          ACCEPTED
        </span>
      );

    case "CHANGES_REQUESTED":
      return (
        <span className="booking-status rejected">
          CHANGES REQUESTED
        </span>
      );

    default:
      return (
        <span className="booking-status requested">
          SUBMITTED
        </span>
      );
  }
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
        active
          ? "booking-filter-card active"
          : "booking-filter-card"
      }
      type="button"
      onClick={onClick}
    >
      <strong>{count}</strong>
      <span>{label}</span>
    </button>
  );
}

function Detail({
  label,
  value,
}) {
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
      <div className="brand-name">
        AEROPATH
      </div>

      <div className="brand-by">
        by AEROVIATION
      </div>
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
    default:
      return role ?? "Unknown";
  }
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
    }
  ).format(
    new Date(value)
  );
}

function normaliseTime(
  value
) {
  if (!value) {
    return "";
  }

  return String(value).slice(
    0,
    5
  );
}
