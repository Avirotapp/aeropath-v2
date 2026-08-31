export function AeroWingWordmark({ className = "" }) {
  return (
    <span className={`aero-wing-wordmark ${className}`} aria-label="Aeroviation">
      <img alt="Aeroviation" className="aero-wing-image" src="/aeroviation-logo-dark.png" />
    </span>
  );
}

export default function AeroBrandLockup({ compact = false, tagline = false }) {
  return (
    <div className={`aero-brand-lockup ${compact ? "compact" : ""}`}>
      <AeroWingWordmark />
      <strong className="aero-lockup-name">Aero<span>Path</span></strong>
      <small>by Aeroviation</small>
      {tagline && <p>Flight training. Elevated.</p>}
    </div>
  );
}
