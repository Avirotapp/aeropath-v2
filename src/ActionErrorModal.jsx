import { useEffect } from "react";

export default function ActionErrorModal({
  open,
  eyebrow = "ACTION BLOCKED",
  title = "AeroPath could not complete this action",
  message,
  closeLabel = "Return to page",
  onClose,
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="presentation"
      className="action-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10020,
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "rgba(3, 10, 24, 0.66)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="aeropath-error-title"
        aria-describedby="aeropath-error-message"
        style={{
          width: "min(540px, 100%)",
          borderRadius: "22px",
          border: "1px solid rgba(255, 107, 124, .38)",
          background: "rgba(28, 14, 27, .97)",
          boxShadow: "0 28px 90px rgba(0,0,0,.52)",
          padding: "28px",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: "52px",
            height: "52px",
            display: "grid",
            placeItems: "center",
            marginBottom: "18px",
            border: "1px solid rgba(255, 107, 124, .42)",
            borderRadius: "999px",
            background: "rgba(255, 74, 99, .12)",
            color: "#ff9ba8",
            fontSize: "25px",
            fontWeight: 900,
          }}
        >
          !
        </div>

        <div className="eyebrow" style={{ color: "#ff9ba8" }}>
          {eyebrow}
        </div>

        <h2
          id="aeropath-error-title"
          style={{ marginTop: "8px", marginBottom: "10px" }}
        >
          {title}
        </h2>

        <p
          id="aeropath-error-message"
          style={{
            margin: 0,
            color: "#ffd7dc",
            lineHeight: 1.65,
            whiteSpace: "pre-wrap",
          }}
        >
          {message || "An unexpected AeroPath error occurred."}
        </p>

        <div className="booking-actions" style={{ marginTop: "24px" }}>
          <button className="primary" type="button" onClick={onClose}>
            {closeLabel}
          </button>
        </div>

        <p
          className="muted"
          style={{ marginTop: "16px", marginBottom: 0, fontSize: "12px" }}
        >
          Press Esc or click outside this panel to close it.
        </p>
      </section>
    </div>
  );
}
