import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "./lib/supabase";
import { indexResources, resourceBadge, resourceLabel } from "./lib/resources";
import ModuleEmblem from "./ModuleEmblem";

const VIEW_OPTIONS = [
  "DAY",
  "WEEK",
  "MONTH",
];


async function rpc(name, args = {}) {
  const { data, error } =
    await supabase.rpc(name, args);

  if (error) {
    throw error;
  }

  return data;
}


export default function TimetablePage({
  role,
  onBack,
  onSignOut,
}) {
  const [bookings, setBookings] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [view, setView] =
    useState("DAY");

  const [selectedDate, setSelectedDate] =
    useState(() =>
      toDateInputValue(new Date())
    );

  const [
    filterOptions,
    setFilterOptions,
  ] = useState({
    students: [],
    instructors: [],
    simulators: [],
    statuses: [],
  });

  const [filters, setFilters] =
    useState({
      studentId: "",
      instructorId: "",
      simulatorId: "",
      status: "",
    });


  async function loadFilterOptions() {
    try {
      const [options, resources] =
        await Promise.all([
          rpc(
            "list_timetable_filter_options_v2"
          ),
          rpc(
            "list_training_resource_catalog_v1"
          ),
        ]);

      setFilterOptions({
        students:
          options?.students ?? [],
        instructors:
          options?.instructors ??
          [],
        simulators:
          (resources ?? []).map(
            (resource) => ({
              ...resource,
              id:
                resource.resource_id,
            })
          ),
        statuses:
          options?.statuses ?? [],
      });
    } catch (err) {
      console.error(
        "Failed to load timetable filter options:",
        err
      );
    }
  }


  async function loadTimetable() {
    try {
      setLoading(true);
      setError("");

      const [data, resources] =
        await Promise.all([
          rpc(
            "list_timetable_bookings_v2",
            {
            filter_student_id:
              filters.studentId ||
              null,
            filter_instructor_id:
              filters.instructorId ||
              null,
            filter_simulator_id:
              filters.simulatorId ||
              null,
            filter_status:
              filters.status ||
              null,
            filter_start: null,
            filter_end: null,
            }
          ),
          rpc(
            "list_training_resource_catalog_v1"
          ),
        ]);

      const resourceIndex =
        indexResources(resources);

      setBookings(
        (data ?? []).map(
          (booking) => ({
            ...booking,
            ...(resourceIndex.get(
              booking.simulator_id
            ) ?? {}),
          })
        )
      );
    } catch (err) {
      console.error(
        "Failed to load timetable:",
        err
      );

      setError(
        err?.message ||
          "Unable to load timetable."
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    loadFilterOptions();
  }, []);


  useEffect(() => {
    loadTimetable();
  }, [
    filters.studentId,
    filters.instructorId,
    filters.simulatorId,
    filters.status,
  ]);


  function updateFilter(
    field,
    value
  ) {
    setFilters(
      (current) => ({
        ...current,
        [field]: value,
      })
    );
  }


  function clearFilters() {
    setFilters({
      studentId: "",
      instructorId: "",
      simulatorId: "",
      status: "",
    });
  }


  function movePeriod(direction) {
    const current =
      parseDateInputValue(
        selectedDate
      );

    if (view === "DAY") {
      current.setDate(
        current.getDate() +
          direction
      );
    }

    if (view === "WEEK") {
      current.setDate(
        current.getDate() +
          7 * direction
      );
    }

    if (view === "MONTH") {
      current.setMonth(
        current.getMonth() +
          direction
      );
    }

    setSelectedDate(
      toDateInputValue(current)
    );
  }


  function goToday() {
    setSelectedDate(
      toDateInputValue(
        new Date()
      )
    );
  }


  return (
    <main className="app timetable-redesign-page">
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

      <section className="timetable-page">
        <button
          className="secondary back-button"
          onClick={onBack}
        >
          ← Back to dashboard
        </button>

        <div className="aero-page-heading timetable-page-heading">
          <div>
            <div className="eyebrow">FLIGHT OPERATIONS</div>
            <h1>Timetable</h1>
            <p className="muted">
              {role === "STUDENT"
                ? "Your approved simulator and aircraft training schedule."
                : "Live operational planning across students, instructors and training resources."}
            </p>
          </div>
          <div className="aero-heading-aside">
            <ModuleEmblem name="departures" />
            <div className="timetable-live-status">
              <span className="aero-system-dot" />
              Schedule live
            </div>
          </div>
        </div>

        <div className="timetable-command-bar">
          <ViewSelector view={view} onChange={setView} />
          <div className="timetable-date-controls">
            <button
              aria-label="Previous period"
              className="secondary timetable-nav-button"
              onClick={() => movePeriod(-1)}
            >
              ←
            </button>
            <button className="secondary timetable-today-button" onClick={goToday}>
              Today
            </button>
            <button
              aria-label="Next period"
              className="secondary timetable-nav-button"
              onClick={() => movePeriod(1)}
            >
              →
            </button>
          </div>
          <input
            className="timetable-date-input"
            type="text"
            value={selectedDate}
            readOnly
            aria-label="Selected timetable date"
            title="Use the previous, Today and next controls to change the timetable date."
          />
        </div>

        <div className="timetable-summary-strip" aria-label="Timetable summary">
          <div><strong>{bookings.length}</strong><span>Filtered bookings</span></div>
          <div><strong>{new Set(bookings.map((item) => item.simulator_id).filter(Boolean)).size}</strong><span>Training resources</span></div>
          <div><strong>{bookingsForDate(bookings, selectedDate).length}</strong><span>Selected day</span></div>
        </div>

        <div
          className="student-booking-card timetable-filter-panel"
          style={{
            marginTop: "18px",
          }}
        >
          <div className="eyebrow">
            TIMETABLE FILTERS
          </div>

          <div className="booking-details-grid">
            {role !== "STUDENT" && (
              <div className="booking-field">
                <label>
                  Student
                </label>

                <select
                  value={
                    filters.studentId
                  }
                  onChange={(event) =>
                    updateFilter(
                      "studentId",
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    All students
                  </option>

                  {filterOptions.students.map(
                    (student) => (
                      <option
                        key={
                          student.id
                        }
                        value={
                          student.id
                        }
                      >
                        {student.name ||
                          student.email}
                      </option>
                    )
                  )}
                </select>
              </div>
            )}

            {role !== "STUDENT" && (
              <div className="booking-field">
                <label>
                  Instructor
                </label>

                <select
                  value={
                    filters.instructorId
                  }
                  onChange={(event) =>
                    updateFilter(
                      "instructorId",
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    All instructors
                  </option>

                  {filterOptions.instructors.map(
                    (instructor) => (
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
              </div>
            )}

            <div className="booking-field">
              <label>
                Training resource
              </label>

              <select
                value={
                  filters.simulatorId
                }
                onChange={(event) =>
                  updateFilter(
                    "simulatorId",
                    event.target.value
                  )
                }
              >
                <option value="">
                  All training resources
                </option>

                {filterOptions.simulators.map(
                  (simulator) => (
                    <option
                      key={
                        simulator.id
                      }
                      value={
                        simulator.id
                      }
                    >
                      {resourceBadge(simulator)} · {simulator.name}
                      {!simulator.active
                        ? " (Inactive)"
                        : ""}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="booking-field">
              <label>
                Booking status
              </label>

              <select
                value={
                  filters.status
                }
                onChange={(event) =>
                  updateFilter(
                    "status",
                    event.target.value
                  )
                }
              >
                <option value="">
                  Active timetable
                </option>

                {filterOptions.statuses.map(
                  (status) => (
                    <option
                      key={status}
                      value={status}
                    >
                      {formatStatusLabel(
                        status
                      )}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <div
            className="booking-actions"
            style={{
              marginTop: "12px",
            }}
          >
            <button
              className="secondary"
              onClick={clearFilters}
            >
              Clear filters
            </button>

            <span className="muted">
              {bookings.length} booking
              {bookings.length === 1
                ? ""
                : "s"}{" "}
              match the current filters
            </span>
          </div>
        </div>

        {error && (
          <div className="login-error booking-message">
            {error}
          </div>
        )}

        {loading ? (
          <div
            className="admin-empty"
            style={{
              marginTop: "28px",
            }}
          >
            Loading timetable...
          </div>
        ) : (
          <>
            {view === "DAY" && (
              <DayView
                bookings={bookings}
                selectedDate={
                  selectedDate
                }
                role={role}
              />
            )}

            {view === "WEEK" && (
              <WeekView
                bookings={bookings}
                selectedDate={
                  selectedDate
                }
                role={role}
                onSelectDate={(
                  date
                ) => {
                  setSelectedDate(
                    date
                  );
                  setView("DAY");
                }}
              />
            )}

            {view === "MONTH" && (
              <MonthView
                bookings={bookings}
                selectedDate={
                  selectedDate
                }
                onSelectDate={(
                  date
                ) => {
                  setSelectedDate(
                    date
                  );
                  setView("DAY");
                }}
              />
            )}
          </>
        )}
      </section>
    </main>
  );
}


function formatStatusLabel(
  status
) {
  return String(
    status ?? ""
  )
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}

function ViewSelector({
  view,
  onChange,
}) {
  return (
    <div
      className="booking-filter-grid timetable-view-selector"
      style={{
        gridTemplateColumns:
          "repeat(3, minmax(0, 1fr))",
      }}
    >
      {VIEW_OPTIONS.map(
        (option) => (
          <button
            key={option}
            className={
              view === option
                ? "booking-filter-card active"
                : "booking-filter-card"
            }
            onClick={() =>
              onChange(option)
            }
          >
            <strong>
              {option === "DAY"
                ? "01"
                : option === "WEEK"
                  ? "07"
                  : "31"}
            </strong>

            <span>
              {formatView(option)}
            </span>
          </button>
        )
      )}
    </div>
  );
}

function DayView({
  bookings,
  selectedDate,
  role,
}) {
  const visibleBookings =
    useMemo(
      () =>
        bookingsForDate(
          bookings,
          selectedDate
        ),
      [bookings, selectedDate]
    );

  return (
    <>
      <SectionHeading
        eyebrow="SELECTED DAY"
        title={formatLongDate(
          selectedDate
        )}
        count={
          visibleBookings.length
        }
        countLabel="booking"
      />

      {visibleBookings.length ===
      0 ? (
        <EmptyState text="No bookings scheduled for this date." />
      ) : (
        <BookingList
          bookings={
            visibleBookings
          }
          role={role}
        />
      )}
    </>
  );
}

function WeekView({
  bookings,
  selectedDate,
  role,
  onSelectDate,
}) {
  const days =
    getWeekDays(selectedDate);

  const totalBookings =
    days.reduce(
      (total, day) =>
        total +
        bookingsForDate(
          bookings,
          toDateInputValue(day)
        ).length,
      0
    );

  return (
    <>
      <SectionHeading
        eyebrow="SELECTED WEEK"
        title={formatWeekRange(
          days
        )}
        count={totalBookings}
        countLabel="booking"
      />

      <div className="timetable-list">
        {days.map((day) => {
          const dateValue =
            toDateInputValue(day);

          const dayBookings =
            bookingsForDate(
              bookings,
              dateValue
            );

          return (
            <article
              className="student-booking-card timetable-day-card"
              key={dateValue}
            >
              <div className="student-booking-header">
                <div>
                  <h3>
                    {formatWeekDay(
                      day
                    )}
                  </h3>

                  <p>
                    {formatShortDate(
                      day
                    )}
                  </p>
                </div>

                <span className="booking-count">
                  {
                    dayBookings.length
                  }
                </span>
              </div>

              {dayBookings.length ===
              0 ? (
                <p
                  className="muted"
                  style={{
                    marginBottom: 0,
                  }}
                >
                  No bookings.
                </p>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gap: "10px",
                      marginTop:
                        "18px",
                    }}
                  >
                    {dayBookings.map(
                      (booking) => (
                        <button
                          key={
                            booking.booking_id
                          }
                          className="secondary"
                          style={{
                            width:
                              "100%",
                            textAlign:
                              "left",
                            padding:
                              "13px 14px",
                          }}
                          onClick={() =>
                            onSelectDate(
                              dateValue
                            )
                          }
                        >
                          <strong>
                            {formatTime(
                              booking.display_start
                            )}
                          </strong>
                          {" — "}
                          {resourceBadge(booking)} · {resourceLabel(booking)}

                          {role !==
                            "STUDENT" &&
                            booking.student_name &&
                            ` · ${booking.student_name}`}
                        </button>
                      )
                    )}
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

function MonthView({
  bookings,
  selectedDate,
  onSelectDate,
}) {
  const weeks =
    getMonthCalendar(
      selectedDate
    );

  const selected =
    parseDateInputValue(
      selectedDate
    );

  const selectedMonth =
    selected.getMonth();

  const monthBookings =
    bookings.filter(
      (booking) => {
        const date = new Date(
          booking.display_start
        );

        return (
          date.getFullYear() ===
            selected.getFullYear() &&
          date.getMonth() ===
            selectedMonth
        );
      }
    );

  return (
    <>
      <SectionHeading
        eyebrow="SELECTED MONTH"
        title={new Intl.DateTimeFormat(
          "en-SG",
          {
            month: "long",
            year: "numeric",
          }
        ).format(selected)}
        count={
          monthBookings.length
        }
        countLabel="booking"
      />

      <div
        className="student-booking-card"
        style={{
          overflowX: "auto",
        }}
      >
        <div
          style={{
            minWidth: "760px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(7, minmax(0, 1fr))",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            {[
              "Mon",
              "Tue",
              "Wed",
              "Thu",
              "Fri",
              "Sat",
              "Sun",
            ].map((day) => (
              <div
                key={day}
                style={{
                  padding: "10px",
                  color:
                    "#698da9",
                  fontSize:
                    "11px",
                  fontWeight: 800,
                  textAlign:
                    "center",
                  letterSpacing:
                    "0.07em",
                }}
              >
                {day.toUpperCase()}
              </div>
            ))}
          </div>

          {weeks.map(
            (week, index) => (
              <div
                key={index}
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "repeat(7, minmax(0, 1fr))",
                  gap: "8px",
                  marginBottom:
                    "8px",
                }}
              >
                {week.map(
                  (day) => {
                    const dateValue =
                      toDateInputValue(
                        day
                      );

                    const dayBookings =
                      bookingsForDate(
                        bookings,
                        dateValue
                      );

                    const isCurrentMonth =
                      day.getMonth() ===
                      selectedMonth;

                    const isToday =
                      dateValue ===
                      toDateInputValue(
                        new Date()
                      );

                    return (
                      <button
                        key={
                          dateValue
                        }
                        onClick={() =>
                          onSelectDate(
                            dateValue
                          )
                        }
                        style={{
                          minHeight:
                            "112px",
                          padding:
                            "10px",
                          border:
                            isToday
                              ? "1px solid #3b82f6"
                              : "1px solid #274661",
                          borderRadius:
                            "10px",
                          background:
                            isCurrentMonth
                              ? "#071827"
                              : "#06111f",
                          color:
                            isCurrentMonth
                              ? "#e9f0f8"
                              : "#52677b",
                          cursor:
                            "pointer",
                          textAlign:
                            "left",
                          font:
                            "inherit",
                        }}
                      >
                        <strong>
                          {day.getDate()}
                        </strong>

                        {dayBookings.length >
                          0 && (
                          <div
                            style={{
                              marginTop:
                                "10px",
                              display:
                                "grid",
                              gap: "5px",
                            }}
                          >
                            {dayBookings
                              .slice(
                                0,
                                2
                              )
                              .map(
                                (
                                  booking
                                ) => (
                                  <div
                                    key={
                                      booking.booking_id
                                    }
                                    style={{
                                      padding:
                                        "5px 6px",
                                      border:
                                        "1px solid #315474",
                                      borderRadius:
                                        "6px",
                                      color:
                                        "#a9d3f5",
                                      fontSize:
                                        "10px",
                                      overflow:
                                        "hidden",
                                      whiteSpace:
                                        "nowrap",
                                      textOverflow:
                                        "ellipsis",
                                    }}
                                  >
                                    {formatTime(
                                      booking.display_start
                                    )}{" "}
                                    {resourceBadge(booking)} · {resourceLabel(booking)}
                                  </div>
                                )
                              )}

                            {dayBookings.length >
                              2 && (
                              <div
                                style={{
                                  color:
                                    "#789db8",
                                  fontSize:
                                    "10px",
                                  fontWeight: 800,
                                }}
                              >
                                +
                                {dayBookings.length -
                                  2}{" "}
                                more
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  }
                )}
              </div>
            )
          )}
        </div>
      </div>

      <p
        className="muted"
        style={{
          marginTop: "14px",
          fontSize: "12px",
        }}
      >
        Select any date to open
        its full Day view.
      </p>
    </>
  );
}

function BookingList({
  bookings,
  role,
}) {
  return (
    <div className="timetable-list">
      {bookings.map(
        (booking) => (
          <article
            className="timetable-card"
            key={
              booking.booking_id
            }
          >
            <div className="timetable-time-column">
              <strong>
                {formatTime(
                  booking.display_start
                )}
              </strong>

              <span>
                {formatTime(
                  booking.display_end
                )}
              </span>
            </div>

            <div className="timetable-card-main">
              <div className="timetable-card-header">
                <div>
                  <h3>
                    {resourceLabel(booking)}
                  </h3>

                  <p>
                    {resourceBadge(booking)} · {booking.resource_type === "AIRCRAFT" ? "Flight" : "Simulator"}
                  </p>
                </div>

                <span
                  className={`booking-status ${booking.booking_status.toLowerCase()}`}
                >
                  {
                    booking.booking_status
                  }
                </span>
              </div>

              <div className="timetable-detail-grid">
                {role !==
                  "STUDENT" && (
                  <>
                    <Detail
                      label="Student"
                      value={
                        booking.student_name ||
                        "—"
                      }
                    />

                    <Detail
                      label="Student email"
                      value={
                        booking.student_email ||
                        "—"
                      }
                    />
                  </>
                )}

                <Detail
                  label="Instructor"
                  value={
                    booking.instructor_name ||
                    "No instructor assigned"
                  }
                />

                <Detail
                  label="Duration"
                  value={formatDuration(
                    booking.display_start,
                    booking.display_end
                  )}
                />
              </div>

              {booking.purpose && (
                <div className="booking-note timetable-purpose">
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

              {booking.booking_status ===
                "REQUESTED" && (
                <div className="timetable-requested-note">
                  Requested times
                  shown. This booking
                  has not yet been
                  approved.
                </div>
              )}

              {booking.booking_status ===
                "APPROVED" && (
                <div className="timetable-approved-note">
                  Approved operational
                  booking.
                </div>
              )}
            </div>
          </article>
        )
      )}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  count,
  countLabel,
}) {
  return (
    <div className="timetable-date-heading">
      <div>
        <div className="eyebrow">
          {eyebrow}
        </div>

        <h2>{title}</h2>
      </div>

      <div className="timetable-count">
        {count}{" "}
        {count === 1
          ? countLabel
          : `${countLabel}s`}
      </div>
    </div>
  );
}

function EmptyState({
  text,
}) {
  return (
    <div className="admin-empty">
      {text}
    </div>
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

function bookingsForDate(
  bookings,
  dateInput
) {
  return bookings
    .filter((booking) =>
      isSameLocalDate(
        booking.display_start,
        dateInput
      )
    )
    .sort(
      (a, b) =>
        new Date(
          a.display_start
        ) -
        new Date(
          b.display_start
        )
    );
}

function getWeekDays(
  dateInput
) {
  const selected =
    parseDateInputValue(
      dateInput
    );

  const day =
    selected.getDay();

  const mondayOffset =
    day === 0
      ? -6
      : 1 - day;

  const monday =
    new Date(selected);

  monday.setDate(
    selected.getDate() +
      mondayOffset
  );

  return Array.from(
    { length: 7 },
    (_, index) => {
      const date =
        new Date(monday);

      date.setDate(
        monday.getDate() +
          index
      );

      return date;
    }
  );
}

function getMonthCalendar(
  dateInput
) {
  const selected =
    parseDateInputValue(
      dateInput
    );

  const firstDay =
    new Date(
      selected.getFullYear(),
      selected.getMonth(),
      1,
      12
    );

  const lastDay =
    new Date(
      selected.getFullYear(),
      selected.getMonth() +
        1,
      0,
      12
    );

  const start =
    new Date(firstDay);

  const firstWeekDay =
    firstDay.getDay();

  const mondayOffset =
    firstWeekDay === 0
      ? -6
      : 1 - firstWeekDay;

  start.setDate(
    firstDay.getDate() +
      mondayOffset
  );

  const end =
    new Date(lastDay);

  const lastWeekDay =
    lastDay.getDay();

  const sundayOffset =
    lastWeekDay === 0
      ? 0
      : 7 - lastWeekDay;

  end.setDate(
    lastDay.getDate() +
      sundayOffset
  );

  const weeks = [];

  let cursor =
    new Date(start);

  while (cursor <= end) {
    const week = [];

    for (
      let index = 0;
      index < 7;
      index += 1
    ) {
      week.push(
        new Date(cursor)
      );

      cursor.setDate(
        cursor.getDate() + 1
      );
    }

    weeks.push(week);
  }

  return weeks;
}

function formatView(view) {
  switch (view) {
    case "DAY":
      return "Day View";

    case "WEEK":
      return "Week View";

    case "MONTH":
      return "Month View";

    default:
      return view;
  }
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

function formatTime(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-SG",
    {
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(new Date(value));
}

function formatLongDate(
  dateInput
) {
  return new Intl.DateTimeFormat(
    "en-SG",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  ).format(
    parseDateInputValue(
      dateInput
    )
  );
}

function formatWeekDay(date) {
  return new Intl.DateTimeFormat(
    "en-SG",
    {
      weekday: "long",
    }
  ).format(date);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat(
    "en-SG",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  ).format(date);
}

function formatWeekRange(days) {
  const first = days[0];
  const last =
    days[
      days.length - 1
    ];

  const firstText =
    new Intl.DateTimeFormat(
      "en-SG",
      {
        day: "numeric",
        month: "short",
      }
    ).format(first);

  const lastText =
    new Intl.DateTimeFormat(
      "en-SG",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    ).format(last);

  return `${firstText} – ${lastText}`;
}

function toDateInputValue(date) {
  const pad = (value) =>
    String(value).padStart(
      2,
      "0"
    );

  return [
    date.getFullYear(),
    "-",
    pad(
      date.getMonth() + 1
    ),
    "-",
    pad(date.getDate()),
  ].join("");
}

function parseDateInputValue(
  value
) {
  const [
    year,
    month,
    day,
  ] = value
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0
  );
}

function isSameLocalDate(
  timestamp,
  dateInput
) {
  if (!timestamp) {
    return false;
  }

  return (
    toDateInputValue(
      new Date(timestamp)
    ) === dateInput
  );
}

function formatDuration(
  startValue,
  endValue
) {
  if (
    !startValue ||
    !endValue
  ) {
    return "—";
  }

  const start =
    new Date(startValue);

  const end =
    new Date(endValue);

  const minutes =
    Math.round(
      (end - start) /
        60000
    );

  if (minutes <= 0) {
    return "—";
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  const remaining =
    minutes % 60;

  if (
    hours > 0 &&
    remaining > 0
  ) {
    return `${hours} hr ${remaining} min`;
  }

  if (hours > 0) {
    return `${hours} hr`;
  }

  return `${remaining} min`;
}
