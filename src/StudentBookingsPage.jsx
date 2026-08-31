import {
  useEffect,
  useState,
} from "react";

import {
  listActiveSimulators,
  listApprovedInstructors,
  studentCancelRequestedBooking,
  studentListBookings,
  studentRequestBooking,
} from "./lib/bookings";

import ActionSuccessModal from "./ActionSuccessModal";
import ActionConfirmModal from "./ActionConfirmModal";
import ActionErrorModal from "./ActionErrorModal";
import { resourceBadge, resourceLabel } from "./lib/resources";
import ModuleEmblem from "./ModuleEmblem";

export default function StudentBookingsPage({
  role = "STUDENT",
  onBack,
  onSignOut,
}) {
  const roleLabel =
    role === "INSTRUCTOR"
      ? "Instructor"
      : "Student";

  const [simulators, setSimulators] =
    useState([]);

  const [instructors, setInstructors] =
    useState([]);

  const [bookings, setBookings] =
    useState([]);

  const [simulatorId, setSimulatorId] =
    useState("");

  const [instructorId, setInstructorId] =
    useState("");

  const [startTime, setStartTime] =
    useState("");

  const [endTime, setEndTime] =
    useState("");

  const [purpose, setPurpose] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [busyBookingId, setBusyBookingId] =
    useState(null);

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

  async function loadPage() {
    try {
      setLoading(true);
      setError("");

      const [
        simulatorData,
        instructorData,
        bookingData,
      ] = await Promise.all([
        listActiveSimulators(),
        listApprovedInstructors(),
        studentListBookings(),
      ]);

      setSimulators(simulatorData);
      setInstructors(instructorData);
      setBookings(bookingData);

      if (
        !simulatorId &&
        simulatorData.length > 0
      ) {
        setSimulatorId(
          simulatorData[0].id
        );
      }
    } catch (err) {
      console.error(
        "Failed to load Student Bookings:",
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
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });

    loadPage();
  }, []);

  async function handleRequest(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!simulatorId) {
      setError(
        "Select a training resource."
      );
      return;
    }

    if (!startTime || !endTime) {
      setError(
        "Select a requested start and end time."
      );
      return;
    }

    const start =
      new Date(startTime);

    const end =
      new Date(endTime);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      setError(
        "Enter valid booking times."
      );
      return;
    }

    if (end <= start) {
      setError(
        "End time must be after start time."
      );
      return;
    }

    if (start <= new Date()) {
      setError(
        "Booking must be requested for a future time."
      );
      return;
    }

    try {
      setSubmitting(true);

      await studentRequestBooking({
        simulatorId,
        instructorId,
        startTime:
          start.toISOString(),
        endTime:
          end.toISOString(),
        purpose,
      });

      setSuccess("");

      setStartTime("");
      setEndTime("");
      setPurpose("");

      await loadPage();

      setSuccessModal({
        eyebrow: "BOOKING REQUEST SENT",
        title: "Booking request submitted",
        message:
          "Your training booking request has been sent successfully.",
        nextText:
          "Await Instructor/Admin approval. AeroPath will show the request under Waiting On in your Flight Deck.",
      });
    } catch (err) {
      console.error(
        "Booking request failed:",
        err
      );

      setError(
        err?.message ||
          "Unable to submit booking request."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel(
    booking
  ) {
    setConfirmAction({
      booking,
      eyebrow:
        "CANCEL REQUEST",
      title:
        "Cancel this booking request?",
      message:
        "Only your REQUESTED booking is being cancelled. Approved bookings remain protected.",
      confirmLabel:
        "Cancel request",
      danger: true,
      inputLabel:
        "Cancellation reason",
      inputPlaceholder:
        "Optional reason for cancelling this request.",
      inputRequired: false,
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

      await studentCancelRequestedBooking(
        booking.id,
        reason
      );

      await loadPage();

      setSuccessModal({
        eyebrow:
          "REQUEST CANCELLED",
        title:
          "Booking request cancelled",
        message:
          "Your requested training booking has been cancelled.",
        nextText:
          "Return to the Flight Deck to see the updated operational picture.",
      });
    } catch (err) {
      console.error(
        "Booking cancellation failed:",
        err
      );

      setError(
        err?.message ||
          "Unable to cancel booking."
      );
    } finally {
      setBusyBookingId(null);
    }
  }


  return (
    <main className="app training-bookings-page">
      <header className="topbar">
        <BookingBrand />

        <div className="topbar-right">
          <span className="role">
            {roleLabel}
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
        <header className="aero-page-heading">
          <div>
            <div className="eyebrow">
              {role === "INSTRUCTOR"
                ? "INSTRUCTOR SELF-SERVICE"
                : "STUDENT OPERATIONS"}
            </div>

            <h1>Training Bookings</h1>

            <p className="muted">
              Request simulator or aircraft training and track its approval status.
            </p>
          </div>

          <div className="aero-heading-aside">
            <ModuleEmblem name="bookings" />
            <span className="aero-page-role">{roleLabel}</span>
          </div>
        </header>

        <section className="booking-form-card">
          <div className="booking-section-heading">
            <div>
              <div className="eyebrow">
                NEW REQUEST
              </div>

              <h2>
                Request a training booking
              </h2>
            </div>

            <span className="status">
              {role}
            </span>
          </div>

          <form
            className="booking-form"
            onSubmit={handleRequest}
          >
            <div className="booking-field">
              <label htmlFor="simulator">
                Training resource
              </label>

              <select
                id="simulator"
                value={simulatorId}
                onChange={(event) =>
                  setSimulatorId(
                    event.target.value
                  )
                }
              >
                {simulators.length ===
                  0 && (
                  <option value="">
                    No active training resources
                  </option>
                )}

                {simulators.map(
                  (simulator) => (
                    <option
                      key={
                        simulator.id
                      }
                      value={
                        simulator.id
                      }
                    >
                      {resourceBadge(simulator)} · {resourceLabel(simulator)}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="booking-field">
              <label htmlFor="instructor">
                Preferred instructor
              </label>

              <select
                id="instructor"
                value={instructorId}
                onChange={(event) =>
                  setInstructorId(
                    event.target.value
                  )
                }
              >
                <option value="">
                  No preference
                </option>

                {instructors.map(
                  (instructor) => (
                    <option
                      key={
                        instructor.id
                      }
                      value={
                        instructor.id
                      }
                    >
                      {instructor.full_name ||
                        instructor.email}
                    </option>
                  )
                )}
              </select>

              {instructors.length ===
                0 && (
                <p className="field-note">
                  No approved instructors
                  are currently available.
                  You may still submit the
                  request without a
                  preferred instructor.
                </p>
              )}
            </div>

            <div className="booking-time-grid">
              <div className="booking-field">
                <label htmlFor="start-time">
                  Requested start
                </label>

                <input
                  id="start-time"
                  type="datetime-local"
                  value={startTime}
                  onChange={(event) =>
                    setStartTime(
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="booking-field">
                <label htmlFor="end-time">
                  Requested end
                </label>

                <input
                  id="end-time"
                  type="datetime-local"
                  value={endTime}
                  onChange={(event) =>
                    setEndTime(
                      event.target.value
                    )
                  }
                />
              </div>
            </div>

            <div className="booking-field">
              <label htmlFor="purpose">
                Purpose / remarks
              </label>

              <textarea
                id="purpose"
                value={purpose}
                onChange={(event) =>
                  setPurpose(
                    event.target.value
                  )
                }
                placeholder="Optional training purpose or remarks."
              />
            </div>

            <button
              className="primary booking-submit"
              type="submit"
              disabled={
                submitting ||
                simulators.length === 0
              }
            >
              {submitting
                ? "Submitting..."
                : "Request booking"}
            </button>
          </form>
        </section>

        <section className="booking-history-section">
          <div className="booking-section-heading">
            <div>
              <div className="eyebrow">
                YOUR BOOKINGS
              </div>

              <h2>
                Booking history
              </h2>
            </div>

            <span className="booking-count">
              {bookings.length}
            </span>
          </div>

          {loading ? (
            <div className="admin-empty">
              Loading bookings...
            </div>
          ) : bookings.length === 0 ? (
            <div className="admin-empty">
              You have not requested any
                  training bookings yet.
            </div>
          ) : (
            <div className="student-booking-list">
              {bookings.map(
                (booking) => (
                  <article
                    className="student-booking-card"
                    key={booking.id}
                  >
                    <div className="student-booking-header">
                      <div>
                        <h3>
                          {
                            resourceLabel(booking)
                          }
                        </h3>

                        <span className="status">
                          {resourceBadge(booking)}
                        </span>

                        <p>
                          {booking.instructor_name
                            ? `Preferred instructor: ${booking.instructor_name}`
                            : "No preferred instructor"}
                        </p>
                      </div>

                      <span
                        className={`booking-status ${booking.status.toLowerCase()}`}
                      >
                        {booking.status}
                      </span>
                    </div>

                    <div className="booking-details-grid">
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

                      {booking.approved_start && (
                        <BookingDetail
                          label="Approved start"
                          value={formatDateTime(
                            booking.approved_start
                          )}
                        />
                      )}

                      {booking.approved_end && (
                        <BookingDetail
                          label="Approved end"
                          value={formatDateTime(
                            booking.approved_end
                          )}
                        />
                      )}
                    </div>

                    {booking.purpose && (
                      <div className="booking-note">
                        <strong>
                          Purpose
                        </strong>

                        <p>
                          {
                            booking.purpose
                          }
                        </p>
                      </div>
                    )}

                    {booking.rejection_reason && (
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

                    {booking.cancellation_reason && (
                      <div className="booking-note">
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

                    {booking.status ===
                      "REQUESTED" && (
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
                        {busyBookingId ===
                        booking.id
                          ? "Cancelling..."
                          : "Cancel request"}
                      </button>
                    )}

                    {booking.status ===
                      "APPROVED" && (
                      <div className="booking-lock-note">
                        Approved bookings
                        cannot be cancelled
                        through self-service.
                      </div>
                    )}
                  </article>
                )
              )}
            </div>
          )}
        </section>
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
        onConfirm={(inputValue) =>
          executeCancel(
            confirmAction.booking,
            inputValue
          )
        }
      />

      <ActionErrorModal
        open={Boolean(error)}
        title="Training booking unavailable"
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
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

function BookingBrand() {
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
    }
  ).format(new Date(value));
}
