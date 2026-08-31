import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "./lib/supabase";
import ModuleEmblem from "./ModuleEmblem";


const PAGE_SIZE = 50;


async function listAuditFilterOptions() {
  const { data, error } = await supabase.rpc(
    "list_audit_filter_options"
  );

  if (error) throw error;
  return data ?? [];
}


async function listAuditTrail({
  actionFilter,
  entityTypeFilter,
  actorFilter,
  fromTime,
  toTime,
  limit,
  offset,
}) {
  const { data, error } = await supabase.rpc(
    "list_audit_trail",
    {
      action_filter:
        actionFilter || null,
      entity_type_filter:
        entityTypeFilter || null,
      actor_filter:
        actorFilter || null,
      from_time:
        fromTime || null,
      to_time:
        toTime || null,
      result_limit:
        limit,
      result_offset:
        offset,
    }
  );

  if (error) throw error;
  return data ?? [];
}


export default function AuditTrailPage({
  role,
  onBack,
  onSignOut,
}) {
  const [rows, setRows] =
    useState([]);

  const [filterOptions, setFilterOptions] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [actionFilter, setActionFilter] =
    useState("");

  const [
    entityTypeFilter,
    setEntityTypeFilter,
  ] = useState("");

  const [actorFilter, setActorFilter] =
    useState("");

  const [fromDate, setFromDate] =
    useState("");

  const [toDate, setToDate] =
    useState("");

  const [offset, setOffset] =
    useState(0);

  const [totalCount, setTotalCount] =
    useState(0);


  const actionOptions =
    useMemo(
      () =>
        filterOptions.filter(
          (item) =>
            item.option_type ===
            "ACTION"
        ),
      [filterOptions]
    );


  const entityOptions =
    useMemo(
      () =>
        filterOptions.filter(
          (item) =>
            item.option_type ===
            "ENTITY_TYPE"
        ),
      [filterOptions]
    );


  const actorOptions =
    useMemo(
      () =>
        filterOptions.filter(
          (item) =>
            item.option_type ===
            "ACTOR"
        ),
      [filterOptions]
    );


  async function loadFilterOptions() {
    try {
      const data =
        await listAuditFilterOptions();

      setFilterOptions(data);
    } catch (err) {
      console.error(
        "Failed to load audit filter options:",
        err
      );

      throw err;
    }
  }


  async function loadAudit({
    nextOffset = offset,
  } = {}) {
    try {
      setLoading(true);
      setError("");

      const fromTime =
        fromDate
          ? singaporeDateStartToIso(
              fromDate
            )
          : null;

      const toTime =
        toDate
          ? singaporeDateEndToIso(
              toDate
            )
          : null;

      const data =
        await listAuditTrail({
          actionFilter,
          entityTypeFilter,
          actorFilter,
          fromTime,
          toTime,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });

      setRows(data);

      setTotalCount(
        data.length > 0
          ? Number(
              data[0].total_count ??
                0
            )
          : 0
      );

      setOffset(nextOffset);
    } catch (err) {
      console.error(
        "Failed to load audit trail:",
        err
      );

      setError(
        err?.message ||
          "Unable to load the audit trail."
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    async function initialise() {
      try {
        setLoading(true);
        setError("");

        await loadFilterOptions();

        const data =
          await listAuditTrail({
            actionFilter: "",
            entityTypeFilter: "",
            actorFilter: "",
            fromTime: null,
            toTime: null,
            limit: PAGE_SIZE,
            offset: 0,
          });

        setRows(data);

        setTotalCount(
          data.length > 0
            ? Number(
                data[0].total_count ??
                  0
              )
            : 0
        );

        setOffset(0);
      } catch (err) {
        console.error(
          "Failed to initialise audit trail:",
          err
        );

        setError(
          err?.message ||
            "Unable to load the audit trail."
        );
      } finally {
        setLoading(false);
      }
    }

    initialise();
  }, []);


  function handleApplyFilters(event) {
    event.preventDefault();
    loadAudit({
      nextOffset: 0,
    });
  }


  async function handleResetFilters() {
    setActionFilter("");
    setEntityTypeFilter("");
    setActorFilter("");
    setFromDate("");
    setToDate("");
    setOffset(0);

    try {
      setLoading(true);
      setError("");

      const data =
        await listAuditTrail({
          actionFilter: "",
          entityTypeFilter: "",
          actorFilter: "",
          fromTime: null,
          toTime: null,
          limit: PAGE_SIZE,
          offset: 0,
        });

      setRows(data);

      setTotalCount(
        data.length > 0
          ? Number(
              data[0].total_count ??
                0
            )
          : 0
      );
    } catch (err) {
      console.error(
        "Failed to reset audit trail:",
        err
      );

      setError(
        err?.message ||
          "Unable to reset the audit trail."
      );
    } finally {
      setLoading(false);
    }
  }


  const pageNumber =
    Math.floor(
      offset / PAGE_SIZE
    ) + 1;

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        totalCount / PAGE_SIZE
      )
    );

  const canGoPrevious =
    offset > 0;

  const canGoNext =
    offset + PAGE_SIZE <
    totalCount;


  return (
    <main className="app audit-redesign-page">
      <header className="topbar">
        <Brand compact />

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
          GOVERNANCE & OVERSIGHT
        </div>


        <div className="student-booking-header aero-page-heading">
          <div>
            <h1>
              Audit Trail
            </h1>

            <p className="muted">
              {role ===
              "SAFETY_MANAGER"
                ? "Review authorised safety-related audit activity. Audit records are read-only."
                : "Review AeroPath operational and privileged actions. Audit records are read-only."}
            </p>
          </div>

          <div className="aero-heading-aside">
            <ModuleEmblem name="audit" />
            <button
              className="secondary"
              type="button"
              disabled={loading}
              onClick={() => loadAudit({ nextOffset: offset })}
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


        <form
          onSubmit={
            handleApplyFilters
          }
          className="student-booking-card"
          style={{
            marginBottom:
              "18px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
            }}
          >
            <div>
              <label>
                Action
              </label>

              <select
                value={actionFilter}
                onChange={(event) =>
                  setActionFilter(
                    event.target.value
                  )
                }
              >
                <option value="">
                  All actions
                </option>

                {actionOptions.map(
                  (item) => (
                    <option
                      key={
                        item.option_value
                      }
                      value={
                        item.option_value
                      }
                    >
                      {
                        item.option_label
                      }
                    </option>
                  )
                )}
              </select>
            </div>


            <div>
              <label>
                Entity type
              </label>

              <select
                value={
                  entityTypeFilter
                }
                onChange={(event) =>
                  setEntityTypeFilter(
                    event.target.value
                  )
                }
              >
                <option value="">
                  All entity types
                </option>

                {entityOptions.map(
                  (item) => (
                    <option
                      key={
                        item.option_value
                      }
                      value={
                        item.option_value
                      }
                    >
                      {
                        item.option_label
                      }
                    </option>
                  )
                )}
              </select>
            </div>


            <div>
              <label>
                Actor
              </label>

              <select
                value={actorFilter}
                onChange={(event) =>
                  setActorFilter(
                    event.target.value
                  )
                }
              >
                <option value="">
                  All actors
                </option>

                {actorOptions.map(
                  (item) => (
                    <option
                      key={
                        item.option_value
                      }
                      value={
                        item.option_value
                      }
                    >
                      {
                        item.option_label
                      }
                    </option>
                  )
                )}
              </select>
            </div>


            <div>
              <label>
                From date
              </label>

              <input
                type="text" inputMode="numeric" placeholder="YYYY-MM-DD"
                value={fromDate}
                onChange={(event) =>
                  setFromDate(
                    event.target.value
                  )
                }
              />
            </div>


            <div>
              <label>
                To date
              </label>

              <input
                type="text" inputMode="numeric" placeholder="YYYY-MM-DD"
                value={toDate}
                onChange={(event) =>
                  setToDate(
                    event.target.value
                  )
                }
              />
            </div>
          </div>


          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              marginTop: "16px",
            }}
          >
            <button
              className="primary"
              type="submit"
              disabled={loading}
            >
              Apply filters
            </button>

            <button
              className="secondary"
              type="button"
              disabled={loading}
              onClick={
                handleResetFilters
              }
            >
              Reset
            </button>
          </div>
        </form>


        <div className="admin-stats">
          <div className="stat-card active">
            <strong>
              {totalCount}
            </strong>

            <span>
              Matching records
            </span>
          </div>

          <div className="stat-card">
            <strong>
              {pageNumber}
            </strong>

            <span>
              Page of {totalPages}
            </span>
          </div>

          <div className="stat-card">
            <strong>
              {rows.length}
            </strong>

            <span>
              Records shown
            </span>
          </div>
        </div>


        {loading ? (
          <div className="admin-empty">
            Loading audit trail...
          </div>
        ) : rows.length === 0 ? (
          <div className="admin-empty">
            No audit records match
            the current filters.
          </div>
        ) : (
          <div className="student-booking-list">
            {rows.map((row) => (
              <article
                className="student-booking-card"
                key={row.audit_id}
              >
                <div className="student-booking-header">
                  <div>
                    <div className="eyebrow">
                      {formatLabel(
                        row.entity_type
                      )}
                    </div>

                    <h3>
                      {formatLabel(
                        row.action
                      )}
                    </h3>

                    <p className="muted">
                      {formatDateTime(
                        row.created_at
                      )}
                    </p>
                  </div>

                  <span className="booking-status approved">
                    READ ONLY
                  </span>
                </div>


                <div className="booking-details-grid instructor-booking-details">
                  <Detail
                    label="Actor"
                    value={
                      row.actor_name ||
                      "System / Unknown"
                    }
                  />

                  <Detail
                    label="Actor email"
                    value={
                      row.actor_email ||
                      "—"
                    }
                  />

                  <Detail
                    label="Entity type"
                    value={
                      row.entity_type ||
                      "—"
                    }
                  />

                  <Detail
                    label="Entity ID"
                    value={
                      row.entity_id ||
                      "—"
                    }
                  />
                </div>


                <JsonSection
                  title="Previous data"
                  value={row.old_data}
                />

                <JsonSection
                  title="New data"
                  value={row.new_data}
                />

                <JsonSection
                  title="Metadata"
                  value={row.metadata}
                />
              </article>
            ))}
          </div>
        )}


        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginTop: "20px",
            marginBottom:
              "30px",
          }}
        >
          <button
            className="secondary"
            type="button"
            disabled={
              loading ||
              !canGoPrevious
            }
            onClick={() =>
              loadAudit({
                nextOffset:
                  Math.max(
                    0,
                    offset -
                      PAGE_SIZE
                  ),
              })
            }
          >
            ← Previous
          </button>


          <span className="muted">
            Page {pageNumber} of{" "}
            {totalPages}
          </span>


          <button
            className="secondary"
            type="button"
            disabled={
              loading ||
              !canGoNext
            }
            onClick={() =>
              loadAudit({
                nextOffset:
                  offset +
                  PAGE_SIZE,
              })
            }
          >
            Next →
          </button>
        </div>
      </section>
    </main>
  );
}


function JsonSection({
  title,
  value,
}) {
  const hasValue =
    value !== null &&
    value !== undefined &&
    !(
      typeof value ===
        "object" &&
      Object.keys(value).length ===
        0
    );

  if (!hasValue) {
    return null;
  }

  return (
    <details
      style={{
        marginTop: "14px",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        {title}
      </summary>

      <pre
        style={{
          whiteSpace:
            "pre-wrap",
          overflowWrap:
            "anywhere",
          marginTop:
            "10px",
          padding: "12px",
          borderRadius:
            "10px",
          background:
            "rgba(0, 0, 0, 0.06)",
          fontSize:
            "0.82rem",
          lineHeight: 1.5,
        }}
      >
        {JSON.stringify(
          value,
          null,
          2
        )}
      </pre>
    </details>
  );
}


function Detail({
  label,
  value,
}) {
  return (
    <div>
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}


function singaporeDateStartToIso(
  value
) {
  if (!value) {
    return null;
  }

  return new Date(
    `${value}T00:00:00+08:00`
  ).toISOString();
}


function singaporeDateEndToIso(
  value
) {
  if (!value) {
    return null;
  }

  return new Date(
    `${value}T23:59:59.999+08:00`
  ).toISOString();
}


function Brand({
  compact = false,
}) {
  return (
    <div
      className={
        compact
          ? "brand compact"
          : "brand"
      }
    >
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
    case "ADMIN":
      return "Admin";

    case "SAFETY_MANAGER":
      return "Safety Manager";

    default:
      return role ?? "Unknown";
  }
}


function formatLabel(value) {
  if (!value) {
    return "Unknown";
  }

  return String(value)
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
