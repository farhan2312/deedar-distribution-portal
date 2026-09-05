"use client";

import { useState } from "react";

/**
 * A packet-count box: whole numbers, never negative, prefilled with 0.
 *
 * It exists because the obvious version is broken in a way that only shows up
 * under a thumb. The count upstream is a number, and a number cannot be empty
 * — so backspacing the prefilled 0 re-rendered a 0 immediately, and the next
 * keystroke landed after it: typing 98 produced 098. This keeps a string draft
 * of what is being typed, so the box can sit empty mid-edit, and hands the
 * parent a clean number the whole time.
 *
 * Shared by the day log's stock panels and the visit form's stock boxes, which
 * had two copies of the same input and the same bug.
 */
export function QtyInput({
  value,
  onChange,
  width = 72,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  width?: number;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      className="inp text-center"
      // Text, not number: a number input returns "" for anything it considers
      // invalid, which hides what was actually typed, and it accepts "e" and
      // "-" in a box counting packets.
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      style={{ width, padding: "8px 6px" }}
      disabled={disabled}
      aria-label={ariaLabel}
      value={draft ?? String(value)}
      onChange={(e) => {
        // Digits only, and no leading zeros, so typing over the prefilled 0
        // gives 98 rather than 098 even without clearing it first.
        const digits = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        setDraft(digits);
        onChange(digits === "" ? 0 : Number(digits));
      }}
      // Tapping the box selects the 0, so the first digit replaces it.
      onFocus={(e) => e.currentTarget.select()}
      // Drop the draft on the way out: an empty box settles back to the 0 that
      // was stored for it anyway.
      onBlur={() => setDraft(null)}
    />
  );
}
