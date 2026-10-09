"use client";

import { useRef, useState } from "react";
import { isShortMapsLink, parseLocationInput } from "@/lib/field/gps";
import { resolveMapsLink } from "@/lib/field/location-actions";
import { useT } from "@/lib/i18n/provider";

/**
 * Typed-in location, for Central Admin.
 *
 * The rep's form captures the phone's own GPS, which is right when you are
 * standing in the shop and wrong from a desk: pressed at HQ, it pins the counter
 * to the office, and nothing downstream can tell. So admin types the position
 * instead — coordinates read off the rep's phone, or a Maps link they shared.
 *
 * `onChange` only ever receives a parsed `"lat, lng"`, or "" while the box holds
 * nothing usable, so the form's existing "coordinates required" check applies
 * unchanged. The resolved point is shown back with a link to open it on a map:
 * that look is the only check a typed position gets.
 */
export function LocationInput({
  value,
  onChange,
}: {
  /** The parsed coordinates currently accepted, or "". */
  value: string;
  onChange: (coords: string) => void;
}) {
  const t = useT();
  const [raw, setRaw] = useState(value);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");
  /** Short links resolve on the server; a later edit must win over an earlier
   * reply that arrives after it. */
  const latest = useRef(0);

  function handle(next: string) {
    setRaw(next);
    setError("");
    const request = ++latest.current;

    const coords = parseLocationInput(next);
    if (coords) {
      setResolving(false);
      onChange(coords);
      return;
    }
    onChange("");
    if (!isShortMapsLink(next)) {
      setResolving(false);
      // Only complain once there is something that looks finished — not while
      // the first digits are still being typed.
      if (next.trim().length >= 8) {
        setError(t("Couldn't read a location from that — paste coordinates like 25.7716, 75.8537, or a Google Maps link."));
      }
      return;
    }

    setResolving(true);
    resolveMapsLink(next)
      .then((res) => {
        if (request !== latest.current) return;
        if (res.ok) onChange(res.coords);
        else setError(t(res.error));
      })
      .catch(() => {
        if (request === latest.current) setError(t("Couldn't open that link — check the connection, or paste the coordinates instead."));
      })
      .finally(() => {
        if (request === latest.current) setResolving(false);
      });
  }

  return (
    <div>
      <input
        className="inp"
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        placeholder={t("e.g. 25.7716, 75.8537 — or a Google Maps link")}
        value={raw}
        onChange={(e) => handle(e.target.value)}
      />
      <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        {t("On the rep's phone: open Google Maps, long-press the shop, and copy the numbers shown. A shared Maps link works too.")}
      </p>
      {resolving && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>{t("Reading the link…")}</p>
      )}
      {!resolving && value && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[12.5px]" style={{ color: "var(--success)" }}>
          <span className="font-semibold tabular-nums">✓ {value}</span>
          <a
            className="link"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value.replace(/\s/g, ""))}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Check on map ↗")}
          </a>
        </p>
      )}
      {!resolving && error && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--danger)" }}>{error}</p>
      )}
    </div>
  );
}
