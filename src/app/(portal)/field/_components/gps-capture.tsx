"use client";

import { useState } from "react";

/** Captures the device's real GPS via the browser Geolocation API. */
export function GpsCapture({
  value,
  onCapture,
}: {
  value: string;
  onCapture: (coords: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function capture() {
    setError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location isn't available on this device.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onCapture(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        setBusy(false);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — allow it and try again."
            : "Couldn't get your location. Try again.",
        );
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-primary w-full justify-center py-3"
        onClick={capture}
        disabled={busy}
      >
        {busy ? "Locating…" : value ? `Captured · ${value}` : "Capture Current Location"}
      </button>
      {error && <p className="mt-2 text-[12px]" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
