import {
  useEffect,
} from "react";


export default function ActionSuccessModal({
  open,
  eyebrow = "ACTION COMPLETE",
  title,
  message,
  nextLabel = "NEXT",
  nextText,
  primaryLabel = "Return to Flight Deck",
  secondaryLabel = "Stay on this page",
  onPrimary,
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
  }, [open, onClose]);


  if (!open) {
    return null;
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
        zIndex: 9999,
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
        aria-labelledby="aeropath-success-title"
        style={{
          width:
            "min(520px, 100%)",
          borderRadius: "22px",
          border:
            "1px solid rgba(255,255,255,.16)",
          background:
            "rgba(10, 22, 42, .96)",
          boxShadow:
            "0 28px 90px rgba(0,0,0,.48)",
          padding:
            "28px",
        }}
      >
        <div
          style={{
            width: "52px",
            height: "52px",
            borderRadius: "999px",
            display: "grid",
            placeItems: "center",
            marginBottom: "18px",
            border:
              "1px solid rgba(255,255,255,.18)",
            background:
              "rgba(255,255,255,.08)",
            fontSize: "24px",
            fontWeight: 800,
          }}
          aria-hidden="true"
        >
          ✓
        </div>

        <div className="eyebrow">
          {eyebrow}
        </div>

        <h2
          id="aeropath-success-title"
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
            }}
          >
            {message}
          </p>
        )}

        {nextText && (
          <div
            className="booking-note"
            style={{
              marginTop: "20px",
            }}
          >
            <div className="eyebrow">
              {nextLabel}
            </div>

            <strong
              style={{
                display: "block",
                marginTop: "5px",
              }}
            >
              {nextText}
            </strong>
          </div>
        )}

        <div
          className="booking-actions"
          style={{
            marginTop: "22px",
          }}
        >
          <button
            className="primary"
            type="button"
            onClick={onPrimary}
          >
            {primaryLabel}
          </button>

          <button
            className="secondary"
            type="button"
            onClick={onClose}
          >
            {secondaryLabel}
          </button>
        </div>

        <p
          className="muted"
          style={{
            marginTop: "16px",
            marginBottom: 0,
            fontSize: "12px",
          }}
        >
          Press Esc or click outside
          this panel to remain on the
          current page.
        </p>
      </section>
    </div>
  );
}
