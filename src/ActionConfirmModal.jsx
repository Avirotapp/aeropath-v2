import {
  useEffect,
  useState,
} from "react";


export default function ActionConfirmModal({
  open,
  eyebrow = "CONFIRM ACTION",
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  inputLabel,
  inputPlaceholder,
  inputRequired = false,
  initialInputValue = "",
  onConfirm,
  onClose,
}) {
  const [inputValue, setInputValue] =
    useState(initialInputValue);

  const [validationError, setValidationError] =
    useState("");


  useEffect(() => {
    if (!open) {
      return undefined;
    }

    setInputValue(
      initialInputValue ?? ""
    );
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
    initialInputValue,
    onClose,
  ]);


  if (!open) {
    return null;
  }


  function submit() {
    if (
      inputRequired &&
      !inputValue.trim()
    ) {
      setValidationError(
        `${inputLabel || "This field"} is required.`
      );
      return;
    }

    setValidationError("");

    onConfirm?.(
      inputValue.trim()
    );
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
        aria-labelledby="aeropath-confirm-title"
        style={{
          width:
            "min(540px, 100%)",
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
          id="aeropath-confirm-title"
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

        {inputLabel && (
          <div
            className="booking-field"
            style={{
              marginTop: "18px",
            }}
          >
            <label>
              {inputLabel}
              {inputRequired
                ? " *"
                : ""}
            </label>

            <textarea
              autoFocus
              value={inputValue}
              placeholder={
                inputPlaceholder
              }
              onChange={(event) => {
                setInputValue(
                  event.target.value
                );
                setValidationError(
                  ""
                );
              }}
              style={{
                minHeight: "110px",
              }}
            />

            {validationError && (
              <div
                className="login-error booking-message"
                style={{
                  marginTop: "10px",
                }}
              >
                {validationError}
              </div>
            )}
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
