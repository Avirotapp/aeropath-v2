import {
  useEffect,
} from "react";


export default function ActionToast({
  open,
  message,
  onClose,
  duration = 3500,
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const timer =
      window.setTimeout(
        () => {
          onClose?.();
        },
        duration
      );

    return () =>
      window.clearTimeout(
        timer
      );
  }, [
    open,
    duration,
    onClose,
    message,
  ]);


  if (!open) {
    return null;
  }


  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: "22px",
        bottom: "22px",
        zIndex: 9500,
        width:
          "min(420px, calc(100vw - 44px))",
        borderRadius: "16px",
        border:
          "1px solid rgba(255,255,255,.16)",
        background:
          "rgba(10, 35, 29, .97)",
        boxShadow:
          "0 20px 55px rgba(0,0,0,.35)",
        padding:
          "16px 18px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems:
            "flex-start",
          justifyContent:
            "space-between",
          gap: "16px",
        }}
      >
        <div>
          <div className="eyebrow">
            UPDATED
          </div>

          <strong
            style={{
              display: "block",
              marginTop: "4px",
            }}
          >
            {message}
          </strong>
        </div>

        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onClose}
          style={{
            border: 0,
            background:
              "transparent",
            color: "inherit",
            cursor: "pointer",
            fontSize: "18px",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
