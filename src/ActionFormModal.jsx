import {
  useEffect,
  useMemo,
  useState,
} from "react";


export default function ActionFormModal({
  open,
  eyebrow = "CONFIRM ACTION",
  title,
  message,
  fields = [],
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onClose,
}) {
  const initialValues =
    useMemo(() => {
      const values = {};

      for (const field of fields) {
        values[field.name] =
          field.defaultValue ?? "";
      }

      return values;
    }, [fields]);

  const [values, setValues] =
    useState(initialValues);

  const [validationError, setValidationError] =
    useState("");


  useEffect(() => {
    if (!open) {
      return undefined;
    }

    setValues(initialValues);
    setValidationError("");

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    open,
    initialValues,
    onClose,
  ]);


  if (!open) {
    return null;
  }


  function updateValue(name, value) {
    setValues(
      (current) => ({
        ...current,
        [name]: value,
      })
    );

    setValidationError("");
  }


  function submit() {
    for (const field of fields) {
      const value =
        values[field.name];

      if (
        field.required &&
        String(value ?? "")
          .trim() === ""
      ) {
        setValidationError(
          `${field.label} is required.`
        );
        return;
      }

      if (
        field.type === "number" &&
        String(value ?? "")
          .trim() !== ""
      ) {
        const number =
          Number(value);

        if (
          !Number.isFinite(number)
        ) {
          setValidationError(
            `${field.label} must be a valid number.`
          );
          return;
        }

        if (
          field.min != null &&
          number < field.min
        ) {
          setValidationError(
            `${field.label} must be ${field.min} or greater.`
          );
          return;
        }
      }
    }

    setValidationError("");
    onConfirm?.(values);
  }


  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose?.();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "rgba(3, 10, 24, 0.62)",
        backdropFilter:
          "blur(7px)",
        WebkitBackdropFilter:
          "blur(7px)",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="aeropath-form-modal-title"
        style={{
          width:
            "min(560px, 100%)",
          maxHeight:
            "min(760px, calc(100vh - 48px))",
          overflowY: "auto",
          borderRadius: "22px",
          border:
            "1px solid rgba(255,255,255,.16)",
          background:
            "rgba(10, 22, 42, .97)",
          boxShadow:
            "0 28px 90px rgba(0,0,0,.48)",
          padding: "28px",
        }}
      >
        <div className="eyebrow">
          {eyebrow}
        </div>

        <h2
          id="aeropath-form-modal-title"
          style={{
            marginTop: "8px",
            marginBottom: "10px",
          }}
        >
          {title}
        </h2>

        {message && (
          <p
            className="muted"
            style={{
              marginTop: 0,
              lineHeight: 1.65,
              whiteSpace: "pre-wrap",
            }}
          >
            {message}
          </p>
        )}

        <div
          style={{
            display: "grid",
            gap: "14px",
            marginTop: "18px",
          }}
        >
          {fields.map((field) => (
            <div
              className="booking-field"
              key={field.name}
            >
              <label>
                {field.label}
                {field.required
                  ? " *"
                  : ""}
              </label>

              {field.type === "select" ? (
                <select
                  value={
                    values[field.name] ??
                    ""
                  }
                  onChange={(event) =>
                    updateValue(
                      field.name,
                      event.target.value
                    )
                  }
                >
                  {field.options?.map(
                    (option) => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                      >
                        {option.label}
                      </option>
                    )
                  )}
                </select>
              ) : field.type ===
                "textarea" ? (
                <textarea
                  autoFocus={
                    field.autoFocus
                  }
                  value={
                    values[field.name] ??
                    ""
                  }
                  placeholder={
                    field.placeholder
                  }
                  onChange={(event) =>
                    updateValue(
                      field.name,
                      event.target.value
                    )
                  }
                  style={{
                    minHeight: "100px",
                  }}
                />
              ) : (
                <input
                  autoFocus={
                    field.autoFocus
                  }
                  type={
                    ["date", "time", "datetime-local"].includes(field.type)
                      ? "text"
                      : field.type || "text"
                  }
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  inputMode={
                    ["date", "time", "datetime-local"].includes(field.type)
                      ? "numeric"
                      : undefined
                  }
                  value={
                    values[field.name] ??
                    ""
                  }
                  placeholder={
                    field.placeholder ||
                    (field.type === "datetime-local"
                      ? "YYYY-MM-DDTHH:mm"
                      : field.type === "date"
                        ? "YYYY-MM-DD"
                        : field.type === "time"
                          ? "HH:mm"
                          : undefined)
                  }
                  onChange={(event) =>
                    updateValue(
                      field.name,
                      event.target.value
                    )
                  }
                />
              )}
            </div>
          ))}
        </div>

        {validationError && (
          <div
            className="login-error booking-message"
            style={{
              marginTop: "14px",
            }}
          >
            {validationError}
          </div>
        )}

        <div
          className="booking-actions"
          style={{
            marginTop: "22px",
          }}
        >
          <button
            className={
              danger
                ? "danger-button"
                : "primary"
            }
            type="button"
            onClick={submit}
          >
            {confirmLabel}
          </button>

          <button
            className="secondary"
            type="button"
            onClick={onClose}
          >
            {cancelLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
