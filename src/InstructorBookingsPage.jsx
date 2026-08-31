import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "./lib/supabase";
import ActionSuccessModal from "./ActionSuccessModal";
import ActionConfirmModal from "./ActionConfirmModal";
import ActionErrorModal from "./ActionErrorModal";
import { indexResources, resourceBadge, resourceLabel } from "./lib/resources";
import ModuleEmblem from "./ModuleEmblem";


async function rpc(name, args = {}) {
  const { data, error } =
    await supabase.rpc(name, args);

  if (error) {
    throw error;
  }

  return data;
}


async function recordDeniedAttempt(
  action,
  entityType,
  entityId,
  error,
  metadata = {}
) {
  if (!isPermissionDenied(error)) {
    return;
  }

  try {
    await supabase.rpc(
      "record_restricted_action_attempt_v2",
      {
        attempted_action: action,
        attempted_entity_type:
          entityType,
        attempted_entity_id:
          entityId ?? null,
        denial_reason:
          error?.message ||
          "Restricted action denied.",
        attempt_metadata: metadata,
      }
    );
  } catch (auditError) {
    console.error(
      "Unable to record restricted action attempt:",
      auditError
    );
  }
}


function isPermissionDenied(error) {
  const message =
    String(
      error?.message ?? ""
    ).toLowerCase();

  return (
    error?.code === "42501" ||
    message.includes(
      "access required"
    ) ||
    message.includes(
      "only admin"
    ) ||
    message.includes(
      "only instructors"
    ) ||
    message.includes(
      "not authorised"
    ) ||
    message.includes(
      "not authorized"
    ) ||
    message.includes(
      "permission"
    )
  );
}


export default function InstructorBookingsPage({
  role = "INSTRUCTOR",
  onBack,
  onSignOut,
}) {
  const isAdmin =
    role === "ADMIN" ||
    role === "SAFETY_MANAGER";

  const [bookings, setBookings] =
    useState([]);

  const [filter, setFilter] =
    useState("REQUESTED");

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

  const [
    busyBookingId,
    setBusyBookingId,
  ] = useState(null);

  const [
    approvedTimes,
    setApprovedTimes,
  ] = useState({});

  const [
    filterOptions,
    setFilterOptions,
  ] = useState({
    instructors: [],
    simulators: [],
  });

  const [
    overrideBookingId,
    setOverrideBookingId,
  ] = useState(null);

  const [
    overrideForm,
    setOverrideForm,
  ] = useState({
    simulatorId: "",
    instructorId: "",
    start: "",
    end: "",
    purpose: "",
    reason: "",
  });


  async function loadBookings() {
    try {
      setLoading(true);
      setError("");

      const [bookingData, resourceData] =
        await Promise.all([
          rpc(
            "operational_list_bookings_v2",
            {
              include_deleted:
                isAdmin,
            }
          ),
          rpc(
            "list_training_resource_catalog_v1"
          ),
        ]);

      const resourceIndex =
        indexResources(resourceData);

      const enrichedBookings =
        (bookingData ?? []).map(
          (booking) => ({
            ...booking,
            ...(resourceIndex.get(
              booking.simulator_id
            ) ?? {}),
          })
        );

      setBookings(
        enrichedBookings
      );

      setApprovedTimes(
        (current) => {
          const next = {
            ...current,
          };

          for (
            const booking of
            enrichedBookings
          ) {
            if (!next[booking.id]) {
              next[booking.id] = {
                start:
                  toDateTimeLocalValue(
                    booking.approved_start ||
                      booking.requested_start
                  ),
                end:
                  toDateTimeLocalValue(
                    booking.approved_end ||
                      booking.requested_end
                  ),
              };
            }
          }

          return next;
        }
      );

      try {
        const options =
          await rpc(
            "list_timetable_filter_options_v2"
          );

        setFilterOptions({
          instructors:
            options?.instructors ??
            [],
          simulators:
            (resourceData ?? []).map(
              (resource) => ({
                ...resource,
                id:
                  resource.resource_id,
              })
            ),
        });
      } catch (optionError) {
        console.error(
          "Unable to load booking override options:",
          optionError
        );
      }
    } catch (err) {
      console.error(
        "Failed to load operational bookings:",
        err
      );

      setError(
        err?.message ||
          "Unable to load bookings."
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    loadBookings();
  }, [isAdmin]);


  const counts = useMemo(() => {
    const result = {
      REQUESTED: 0,
      APPROVED: 0,
      COMPLETED: 0,
      REJECTED: 0,
      CANCELLED: 0,
      DELETED: 0,
    };

    for (const booking of bookings) {
      if (booking.deleted_at) {
        result.DELETED += 1;
        continue;
      }

      if (
        Object.prototype
          .hasOwnProperty.call(
            result,
            booking.status
          )
      ) {
        result[
          booking.status
        ] += 1;
      }
    }

    return result;
  }, [bookings]);


  const filterStatuses =
    isAdmin
      ? [
          "REQUESTED",
          "APPROVED",
          "COMPLETED",
          "REJECTED",
          "CANCELLED",
          "DELETED",
        ]
      : [
          "REQUESTED",
          "APPROVED",
          "COMPLETED",
          "REJECTED",
          "CANCELLED",
        ];


  const visibleBookings =
    bookings.filter(
      (booking) => {
        if (
          filter === "DELETED"
        ) {
          return Boolean(
            booking.deleted_at
          );
        }

        return (
          !booking.deleted_at &&
          booking.status === filter
        );
      }
    );


  function updateApprovedTime(
    bookingId,
    field,
    value
  ) {
    setApprovedTimes(
      (current) => ({
        ...current,
        [bookingId]: {
          ...current[bookingId],
          [field]: value,
        },
      })
    );
  }


  function handleApprove(
    booking
  ) {
    const values =
      approvedTimes[
        booking.id
      ];

    if (
      !values?.start ||
      !values?.end
    ) {
      setError(
        "Enter an approved start and end time."
      );
      return;
    }

    const start =
      new Date(values.start);

    const end =
      new Date(values.end);

    if (
      Number.isNaN(
        start.getTime()
      ) ||
      Number.isNaN(
        end.getTime()
      )
    ) {
      setError(
        "Enter valid approval times."
      );
      return;
    }

    if (end <= start) {
      setError(
        "Approved end time must be after approved start time."
      );
      return;
    }

    setError("");

    setConfirmAction({
      kind: "APPROVE",
      booking,
      start,
      end,
      eyebrow:
        "APPROVE BOOKING",
      title:
        "Approve this training booking?",
      message:
        `${booking.student_name || booking.student_email || "User"} · ${resourceLabel(booking)}\n${formatDateTime(start.toISOString())} → ${formatDateTime(end.toISOString())}`,
      confirmLabel:
        "Approve booking",
    });
  }


  async function executeApprove(
    booking,
    start,
    end
  ) {
    try {
      setConfirmAction(null);

      setBusyBookingId(
        booking.id
      );
      setError("");
      setSuccess("");

      await rpc(
        "operational_approve_booking",
        {
          target_booking_id:
            booking.id,
          approved_start_time:
            start.toISOString(),
          approved_end_time:
            end.toISOString(),
        }
      );

      await loadBookings();
      setFilter("APPROVED");

      setSuccessModal({
        eyebrow:
          "BOOKING APPROVED",
        title:
          "Booking approved successfully",
        message:
          `${booking.student_name || booking.student_email || "User"} · ${resourceLabel(booking)}`,
        nextText:
          "The approved booking is now part of the operational schedule. The Flight Deck will recalculate the next action for the relevant users.",
      });
    } catch (err) {
      console.error(
        "Booking approval failed:",
        err
      );

      await recordDeniedAttempt(
        "BOOKING_APPROVE",
        "booking",
        booking.id,
        err,
        {
          page:
            "Booking Operations",
        }
      );

      setError(
        err?.message ||
          "Unable to approve booking."
      );
    } finally {
      setBusyBookingId(
        null
      );
    }
  }


  function handleReject(
    booking
  ) {
    setConfirmAction({
      kind: "REJECT",
      booking,
      eyebrow:
        "REJECT BOOKING",
      title:
        "Reject this booking request?",
      message:
        "A rejection reason is required and will be recorded with the booking.",
      confirmLabel:
        "Reject booking",
      danger: true,
      inputLabel:
        "Rejection reason",
      inputPlaceholder:
        "Explain why the booking request is being rejected.",
      inputRequired: true,
    });
  }


  async function executeReject(
    booking,
    reason
  ) {
    try {
      setConfirmAction(null);

      setBusyBookingId(
        booking.id
      );
      setError("");
      setSuccess("");

      await rpc(
        "operational_reject_booking",
        {
          target_booking_id:
            booking.id,
          reason:
            reason.trim(),
        }
      );

      await loadBookings();
      setFilter("REJECTED");

      setSuccessModal({
        eyebrow:
          "BOOKING REJECTED",
        title:
          "Booking request rejected",
        message:
          `${booking.student_name || booking.student_email || "User"} · ${resourceLabel(booking)}`,
        nextText:
          "The rejection reason has been recorded and the operational queue has been updated.",
      });
    } catch (err) {
      console.error(
        "Booking rejection failed:",
        err
      );

      await recordDeniedAttempt(
        "BOOKING_REJECT",
        "booking",
        booking.id,
        err,
        {
          page:
            "Booking Operations",
        }
      );

      setError(
        err?.message ||
          "Unable to reject booking."
      );
    } finally {
      setBusyBookingId(
        null
      );
    }
  }


  function handleCancel(
    booking
  ) {
    setConfirmAction({
      kind: "CANCEL",
      booking,
      eyebrow:
        "CANCEL BOOKING",
      title:
        "Cancel this booking?",
      message:
        "A cancellation reason is required and will remain in the operational history.",
      confirmLabel:
        "Cancel booking",
      danger: true,
      inputLabel:
        "Cancellation reason",
      inputPlaceholder:
        "Explain why this booking is being cancelled.",
      inputRequired: true,
    });
  }


  async function executeCancel(
    booking,
    reason
  ) {
    try {
      setConfirmAction(null);

      setBusyBookingId(
        booking.id
      );
      setError("");
      setSuccess("");

      await rpc(
        "operational_cancel_booking",
        {
          target_booking_id:
            booking.id,
          reason:
            reason.trim(),
        }
      );

      await loadBookings();
      setFilter("CANCELLED");

      setSuccessModal({
        eyebrow:
          "BOOKING CANCELLED",
        title:
          "Booking cancelled",
        message:
          `${booking.student_name || booking.student_email || "User"} · ${resourceLabel(booking)}`,
        nextText:
          "The cancellation has been recorded and the Flight Deck will recalculate the operational queue.",
      });
    } catch (err) {
      console.error(
        "Booking cancellation failed:",
        err
      );

      await recordDeniedAttempt(
        "BOOKING_CANCEL",
        "booking",
        booking.id,
        err,
        {
          page:
            "Booking Operations",
        }
      );

      setError(
        err?.message ||
          "Unable to cancel booking."
      );
    } finally {
      setBusyBookingId(
        null
      );
    }
  }


  function openOverride(
    booking
  ) {
    const usingApprovedTime =
      booking.status ===
      "APPROVED";

    setOverrideBookingId(
      booking.id
    );

    setOverrideForm({
      simulatorId:
        booking.simulator_id ||
        "",
      instructorId:
        booking.assigned_instructor_id ||
        "",
      start:
        toDateTimeLocalValue(
          usingApprovedTime
            ? booking.approved_start
            : booking.requested_start
        ),
      end:
        toDateTimeLocalValue(
          usingApprovedTime
            ? booking.approved_end
            : booking.requested_end
        ),
      purpose:
        booking.purpose || "",
      reason: "",
    });
  }


  function submitOverride(
    booking
  ) {
    if (!isAdmin) {
      setError(
        "Admin access is required for booking override."
      );
      return;
    }

    if (
      !overrideForm
        .simulatorId
    ) {
      setError(
        "Select a training resource."
      );
      return;
    }

    if (
      !overrideForm.start ||
      !overrideForm.end
    ) {
      setError(
        "Enter the new start and end time."
      );
      return;
    }

    if (
      !overrideForm.reason
        .trim()
    ) {
      setError(
        "An Admin override reason is required."
      );
      return;
    }

    const start =
      new Date(
        overrideForm.start
      );

    const end =
      new Date(
        overrideForm.end
      );

    if (
      Number.isNaN(
        start.getTime()
      ) ||
      Number.isNaN(
        end.getTime()
      ) ||
      end <= start
    ) {
      setError(
        "Enter a valid operational time window."
      );
      return;
    }

    setError("");

    setConfirmAction({
      kind: "OVERRIDE",
      booking,
      start,
      end,
      eyebrow:
        "ADMIN AUTHORISED OVERRIDE",
      title:
        "Apply this booking override?",
      message:
        "This change will be audited. Resource/instructor conflict protection remains active and cannot be bypassed.",
      confirmLabel:
        "Apply audited override",
    });
  }


  async function executeOverride(
    booking,
    start,
    end
  ) {
    try {
      setConfirmAction(null);

      setBusyBookingId(
        booking.id
      );
      setError("");
      setSuccess("");

      await rpc(
        "admin_override_booking_v2",
        {
          target_booking_id:
            booking.id,
          new_simulator_id:
            overrideForm
              .simulatorId,
          new_assigned_instructor_id:
            overrideForm
              .instructorId ||
            null,
          new_start_time:
            start.toISOString(),
          new_end_time:
            end.toISOString(),
          new_purpose:
            overrideForm
              .purpose
              .trim() ||
            null,
          override_reason:
            overrideForm
              .reason
              .trim(),
        }
      );

      setOverrideBookingId(
        null
      );

      await loadBookings();

      setSuccessModal({
        eyebrow:
          "OVERRIDE APPLIED",
        title:
          "Admin booking override completed",
        message:
          "The booking was modified successfully and the override was written to the audit trail.",
        nextText:
          "The Flight Deck and timetable will use the updated booking data.",
      });
    } catch (err) {
      console.error(
        "Admin booking override failed:",
        err
      );

      await recordDeniedAttempt(
        "BOOKING_ADMIN_OVERRIDE",
        "booking",
        booking.id,
        err,
        {
          page:
            "Booking Operations",
        }
      );

      setError(
        err?.message ||
          "Unable to apply Admin override."
      );
    } finally {
      setBusyBookingId(
        null
      );
    }
  }


  function handleSoftDelete(
    booking
  ) {
    setConfirmAction({
      kind: "SOFT_DELETE",
      booking,
      eyebrow:
        "SOFT-DELETE BOOKING",
      title:
        "Remove this booking from normal operational views?",
      message:
        "The booking will not be hard-deleted. Its history remains preserved and an Admin can restore it.",
      confirmLabel:
        "Soft-delete booking",
      danger: true,
      inputLabel:
        "Soft-delete reason",
      inputPlaceholder:
        "Explain why this booking should be hidden from normal operational views.",
      inputRequired: true,
    });
  }


  async function executeSoftDelete(
    booking,
    reason
  ) {
    try {
      setConfirmAction(null);

      setBusyBookingId(
        booking.id
      );
      setError("");
      setSuccess("");

      await rpc(
        "admin_soft_delete_booking_v2",
        {
          target_booking_id:
            booking.id,
          reason:
            reason.trim(),
        }
      );

      await loadBookings();
      setFilter("DELETED");

      setSuccessModal({
        eyebrow:
          "BOOKING SOFT-DELETED",
        title:
          "Booking removed from normal operational views",
        message:
          "Operational history has been preserved.",
        nextText:
          "The booking can be restored from the Soft Deleted tab.",
      });
    } catch (err) {
      await recordDeniedAttempt(
        "BOOKING_SOFT_DELETE",
        "booking",
        booking.id,
        err,
        {
          page:
            "Booking Operations",
        }
      );

      setError(
        err?.message ||
          "Unable to soft-delete booking."
      );
    } finally {
      setBusyBookingId(
        null
      );
    }
  }


  function handleRestore(
    booking
  ) {
    setConfirmAction({
      kind: "RESTORE",
      booking,
      eyebrow:
        "RESTORE BOOKING",
      title:
        "Restore this booking?",
      message:
        "The booking will return to normal operational views with its existing status and history.",
      confirmLabel:
        "Restore booking",
      inputLabel:
        "Restore reason",
      inputPlaceholder:
        "Explain why this booking is being restored.",
      inputRequired: true,
    });
  }


  async function executeRestore(
    booking,
    reason
  ) {
    try {
      setConfirmAction(null);

      setBusyBookingId(
        booking.id
      );
      setError("");
      setSuccess("");

      await rpc(
        "admin_restore_booking_v2",
        {
          target_booking_id:
            booking.id,
          reason:
            reason.trim(),
        }
      );

      await loadBookings();
      setFilter(
        booking.status
      );

      setSuccessModal({
        eyebrow:
          "BOOKING RESTORED",
        title:
          "Booking restored",
        message:
          "The booking has returned to normal operational views.",
        nextText:
          "The Flight Deck and timetable will include the restored booking where relevant.",
      });
    } catch (err) {
      await recordDeniedAttempt(
        "BOOKING_RESTORE",
        "booking",
        booking.id,
        err,
        {
          page:
            "Booking Operations",
        }
      );

      setError(
        err?.message ||
          "Unable to restore booking."
      );
    } finally {
      setBusyBookingId(
        null
      );
    }
  }


  return (
    <main className="app booking-operations-redesign-page">
      <header className="topbar">
        <InstructorBrand />

        <div className="topbar-right">
          <span className="role">
            {role === "SAFETY_MANAGER"
              ? "Safety Manager"
              : isAdmin
                ? "Admin"
                : "Instructor"}
          </span>

          <button
            className="secondary"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="bookings-page">
        <button
          className="secondary back-button"
          onClick={onBack}
        >
          ← Back to dashboard
        </button>

        <div className="aero-page-heading">
          <div>
            <div className="eyebrow">
              {isAdmin ? "ADMIN OPERATIONS" : "INSTRUCTOR OPERATIONS"}
            </div>
            <h1>Booking Operations</h1>
            <p className="muted">
              {isAdmin
                ? "Review booking states, apply explicit audited overrides, and manage soft-deleted operational history."
                : "Review AeroPath simulator and aircraft requests and manage authorised operational booking states."}
            </p>
          </div>
          <ModuleEmblem name="bookings" />
        </div>

        <div className="booking-filter-grid">
          {filterStatuses.map(
            (status) => (
              <button
                key={status}
                className={
                  filter === status
                    ? "booking-filter-card active"
                    : "booking-filter-card"
                }
                onClick={() =>
                  setFilter(
                    status
                  )
                }
              >
                <strong>
                  {
                    counts[
                      status
                    ]
                  }
                </strong>

                <span>
                  {formatStatus(
                    status
                  )}
                </span>
              </button>
            )
          )}
        </div>

        {loading ? (
          <div className="admin-empty">
            Loading bookings...
          </div>
        ) : visibleBookings
            .length === 0 ? (
          <div className="admin-empty">
            No{" "}
            {formatStatus(
              filter
            ).toLowerCase()}{" "}
            bookings.
          </div>
        ) : (
          <div className="student-booking-list">
            {visibleBookings.map(
              (booking) => (
                <article
                  className="student-booking-card"
                  key={booking.id}
                >
                  <div className="student-booking-header">
                    <div>
                      <h3>
                        {resourceLabel(booking)}
                      </h3>

                      <p>
                        Student:{" "}
                        {booking.student_name ||
                          booking.student_email}
                      </p>

                      <span className="status">
                        {resourceBadge(booking)}
                      </span>
                    </div>

                    <span
                      className={`booking-status ${
                        booking.deleted_at
                          ? "cancelled"
                          : booking.status.toLowerCase()
                      }`}
                    >
                      {booking.deleted_at
                        ? "DELETED"
                        : booking.status}
                    </span>
                  </div>

                  <div className="booking-details-grid instructor-booking-details">
                    <BookingDetail
                      label="Student"
                      value={
                        booking.student_name ||
                        "—"
                      }
                    />

                    <BookingDetail
                      label="Student email"
                      value={
                        booking.student_email ||
                        "—"
                      }
                    />

                    <BookingDetail
                      label="Training resource"
                      value={
                        resourceLabel(booking) ||
                        "—"
                      }
                    />

                    <BookingDetail
                      label={booking.resource_type === "AIRCRAFT" ? "Registration" : "Resource ID"}
                      value={
                        booking.identifier ||
                        booking.simulator_identifier ||
                        "—"
                      }
                    />

                    <BookingDetail
                      label="Requested start"
                      value={formatDateTime(
                        booking.requested_start
                      )}
                    />

                    <BookingDetail
                      label="Requested end"
                      value={formatDateTime(
                        booking.requested_end
                      )}
                    />

                    <BookingDetail
                      label="Assigned instructor"
                      value={
                        booking.instructor_name ||
                        "No instructor assigned"
                      }
                    />

                    <BookingDetail
                      label="Requested"
                      value={formatDateTime(
                        booking.requested_at
                      )}
                    />
                  </div>

                  {booking.purpose && (
                    <div className="booking-note">
                      <strong>
                        Purpose / remarks
                      </strong>

                      <p>
                        {
                          booking.purpose
                        }
                      </p>
                    </div>
                  )}

                  {booking.deleted_at && (
                    <div className="booking-rejection">
                      <strong>
                        Soft-deleted
                      </strong>

                      <p>
                        {formatDateTime(
                          booking.deleted_at
                        )}
                        {booking.delete_reason
                          ? ` · ${booking.delete_reason}`
                          : ""}
                      </p>
                    </div>
                  )}

                  {!booking.deleted_at &&
                    booking.status ===
                      "REQUESTED" && (
                      <div className="instructor-approval-panel">
                        <div className="eyebrow">
                          APPROVAL
                        </div>

                        <h4>
                          Confirm operational
                          time
                        </h4>

                        <div className="booking-time-grid">
                          <div className="booking-field">
                            <label>
                              Approved start
                            </label>

                            <input
                              type="text" inputMode="numeric" placeholder="YYYY-MM-DDTHH:mm"
                              value={
                                approvedTimes[
                                  booking.id
                                ]?.start ||
                                ""
                              }
                              onChange={(
                                event
                              ) =>
                                updateApprovedTime(
                                  booking.id,
                                  "start",
                                  event
                                    .target
                                    .value
                                )
                              }
                            />
                          </div>

                          <div className="booking-field">
                            <label>
                              Approved end
                            </label>

                            <input
                              type="text" inputMode="numeric" placeholder="YYYY-MM-DDTHH:mm"
                              value={
                                approvedTimes[
                                  booking.id
                                ]?.end ||
                                ""
                              }
                              onChange={(
                                event
                              ) =>
                                updateApprovedTime(
                                  booking.id,
                                  "end",
                                  event
                                    .target
                                    .value
                                )
                              }
                            />
                          </div>
                        </div>

                        <div className="instructor-action-grid">
                          <button
                            className="primary"
                            disabled={
                              busyBookingId ===
                              booking.id
                            }
                            onClick={() =>
                              handleApprove(
                                booking
                              )
                            }
                          >
                            {busyBookingId ===
                            booking.id
                              ? "Processing..."
                              : "Approve booking"}
                          </button>

                          <button
                            className="danger-button"
                            disabled={
                              busyBookingId ===
                              booking.id
                            }
                            onClick={() =>
                              handleReject(
                                booking
                              )
                            }
                          >
                            Reject booking
                          </button>
                        </div>
                      </div>
                    )}

                  {!booking.deleted_at &&
                    booking.status ===
                      "APPROVED" && (
                      <>
                        <div className="booking-details-grid approved-details">
                          <BookingDetail
                            label="Approved start"
                            value={formatDateTime(
                              booking.approved_start
                            )}
                          />

                          <BookingDetail
                            label="Approved end"
                            value={formatDateTime(
                              booking.approved_end
                            )}
                          />
                        </div>

                        <button
                          className="danger-button"
                          disabled={
                            busyBookingId ===
                            booking.id
                          }
                          onClick={() =>
                            handleCancel(
                              booking
                            )
                          }
                        >
                          Cancel approved booking
                        </button>
                      </>
                    )}

                  {!booking.deleted_at &&
                    booking.status ===
                      "REJECTED" &&
                    booking.rejection_reason && (
                      <div className="booking-rejection">
                        <strong>
                          Rejection reason
                        </strong>

                        <p>
                          {
                            booking.rejection_reason
                          }
                        </p>
                      </div>
                    )}

                  {!booking.deleted_at &&
                    booking.status ===
                      "CANCELLED" &&
                    booking.cancellation_reason && (
                      <div className="booking-rejection">
                        <strong>
                          Cancellation reason
                        </strong>

                        <p>
                          {
                            booking.cancellation_reason
                          }
                        </p>
                      </div>
                    )}

                  {isAdmin &&
                    !booking.deleted_at &&
                    [
                      "REQUESTED",
                      "APPROVED",
                    ].includes(
                      booking.status
                    ) && (
                      <div
                        className="instructor-approval-panel"
                        style={{
                          marginTop:
                            "16px",
                        }}
                      >
                        <div className="eyebrow">
                          ADMIN AUTHORISED
                          OVERRIDE
                        </div>

                        {overrideBookingId !==
                        booking.id ? (
                          <>
                            <p className="muted">
                              Modify resource,
                              instructor,
                              operational time
                              or purpose. Every
                              override requires
                              a reason and is
                              audited. Approved
                              booking conflict
                              protection remains
                              active.
                            </p>

                            <button
                              className="secondary"
                              onClick={() =>
                                openOverride(
                                  booking
                                )
                              }
                            >
                              Modify / Authorised
                              Override
                            </button>
                          </>
                        ) : (
                          <>
                            <label>
                              Training resource
                            </label>

                            <select
                              value={
                                overrideForm
                                  .simulatorId
                              }
                              onChange={(
                                event
                              ) =>
                                setOverrideForm(
                                  {
                                    ...overrideForm,
                                    simulatorId:
                                      event
                                        .target
                                        .value,
                                  }
                                )
                              }
                            >
                              <option value="">
                                Choose training resource
                              </option>

                              {filterOptions.simulators
                                .filter(
                                  (
                                    simulator
                                  ) =>
                                    simulator.active
                                )
                                .map(
                                  (
                                    simulator
                                  ) => (
                                    <option
                                      key={
                                        simulator.id
                                      }
                                      value={
                                        simulator.id
                                      }
                                    >
                                      {resourceBadge(simulator)} · {simulator.name}{" "}
                                      (
                                      {
                                        simulator.identifier
                                      }
                                      )
                                    </option>
                                  )
                                )}
                            </select>

                            <label>
                              Assigned
                              instructor
                            </label>

                            <select
                              value={
                                overrideForm
                                  .instructorId
                              }
                              onChange={(
                                event
                              ) =>
                                setOverrideForm(
                                  {
                                    ...overrideForm,
                                    instructorId:
                                      event
                                        .target
                                        .value,
                                  }
                                )
                              }
                            >
                              <option value="">
                                No instructor
                                assigned
                              </option>

                              {filterOptions.instructors.map(
                                (
                                  instructor
                                ) => (
                                  <option
                                    key={
                                      instructor.id
                                    }
                                    value={
                                      instructor.id
                                    }
                                  >
                                    {instructor.name ||
                                      instructor.email}
                                  </option>
                                )
                              )}
                            </select>

                            <label>
                              Operational start
                            </label>

                            <input
                              type="text" inputMode="numeric" placeholder="YYYY-MM-DDTHH:mm"
                              value={
                                overrideForm.start
                              }
                              onChange={(
                                event
                              ) =>
                                setOverrideForm(
                                  {
                                    ...overrideForm,
                                    start:
                                      event
                                        .target
                                        .value,
                                  }
                                )
                              }
                            />

                            <label>
                              Operational end
                            </label>

                            <input
                              type="text" inputMode="numeric" placeholder="YYYY-MM-DDTHH:mm"
                              value={
                                overrideForm.end
                              }
                              onChange={(
                                event
                              ) =>
                                setOverrideForm(
                                  {
                                    ...overrideForm,
                                    end:
                                      event
                                        .target
                                        .value,
                                  }
                                )
                              }
                            />

                            <label>
                              Purpose / remarks
                            </label>

                            <textarea
                              value={
                                overrideForm.purpose
                              }
                              onChange={(
                                event
                              ) =>
                                setOverrideForm(
                                  {
                                    ...overrideForm,
                                    purpose:
                                      event
                                        .target
                                        .value,
                                  }
                                )
                              }
                            />

                            <label>
                              Override reason *
                            </label>

                            <textarea
                              value={
                                overrideForm.reason
                              }
                              placeholder="Explain why this Admin override is required."
                              onChange={(
                                event
                              ) =>
                                setOverrideForm(
                                  {
                                    ...overrideForm,
                                    reason:
                                      event
                                        .target
                                        .value,
                                  }
                                )
                              }
                            />

                            <div className="booking-actions">
                              <button
                                className="primary"
                                disabled={
                                  busyBookingId ===
                                  booking.id
                                }
                                onClick={() =>
                                  submitOverride(
                                    booking
                                  )
                                }
                              >
                                Apply audited
                                override
                              </button>

                              <button
                                className="secondary"
                                type="button"
                                onClick={() =>
                                  setOverrideBookingId(
                                    null
                                  )
                                }
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                  {isAdmin &&
                    !booking.deleted_at &&
                    [
                      "COMPLETED",
                      "REJECTED",
                      "CANCELLED",
                    ].includes(
                      booking.status
                    ) && (
                      <div
                        className="booking-actions"
                        style={{
                          marginTop:
                            "16px",
                        }}
                      >
                        <button
                          className="danger-button"
                          disabled={
                            busyBookingId ===
                            booking.id
                          }
                          onClick={() =>
                            handleSoftDelete(
                              booking
                            )
                          }
                        >
                          Soft-delete booking
                        </button>
                      </div>
                    )}

                  {isAdmin &&
                    booking.deleted_at && (
                      <div
                        className="booking-actions"
                        style={{
                          marginTop:
                            "16px",
                        }}
                      >
                        <button
                          className="primary"
                          disabled={
                            busyBookingId ===
                            booking.id
                          }
                          onClick={() =>
                            handleRestore(
                              booking
                            )
                          }
                        >
                          Restore booking
                        </button>
                      </div>
                    )}
                </article>
              )
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
            "APPROVE"
          ) {
            executeApprove(
              confirmAction.booking,
              confirmAction.start,
              confirmAction.end
            );
            return;
          }

          if (
            confirmAction?.kind ===
            "REJECT"
          ) {
            executeReject(
              confirmAction.booking,
              inputValue
            );
            return;
          }

          if (
            confirmAction?.kind ===
            "CANCEL"
          ) {
            executeCancel(
              confirmAction.booking,
              inputValue
            );
            return;
          }

          if (
            confirmAction?.kind ===
            "OVERRIDE"
          ) {
            executeOverride(
              confirmAction.booking,
              confirmAction.start,
              confirmAction.end
            );
            return;
          }

          if (
            confirmAction?.kind ===
            "SOFT_DELETE"
          ) {
            executeSoftDelete(
              confirmAction.booking,
              inputValue
            );
            return;
          }

          if (
            confirmAction?.kind ===
            "RESTORE"
          ) {
            executeRestore(
              confirmAction.booking,
              inputValue
            );
          }
        }}
      />

      <ActionErrorModal
        open={Boolean(error)}
        title="Booking operation blocked"
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


function BookingDetail({
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


function InstructorBrand() {
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
  ).format(new Date(value));
}


function toDateTimeLocalValue(
  value
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Singapore",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }
    ).formatToParts(date);

  const map =
    Object.fromEntries(
      parts.map((part) => [
        part.type,
        part.value,
      ])
    );

  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}


function formatStatus(status) {
  switch (status) {
    case "REQUESTED":
      return "Requested";
    case "APPROVED":
      return "Approved";
    case "COMPLETED":
      return "Completed";
    case "REJECTED":
      return "Rejected";
    case "CANCELLED":
      return "Cancelled";
    case "DELETED":
      return "Soft Deleted";
    default:
      return status;
  }
}
