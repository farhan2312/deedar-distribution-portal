import type { WriteResult } from "@/lib/db-errors";

/**
 * Inline outcome line for an add/edit form — success in green, the failure
 * reason in red. Shared by the admin hierarchy and C&F depot forms so both
 * report the same way.
 *
 * No "use client": pure markup, safe to render from either side.
 */
export function FormResult({
  state,
  successText = "Added.",
}: {
  state: WriteResult | null;
  successText?: string;
}) {
  if (!state) return null;
  return (
    <p
      role="status"
      className="mt-2 text-[12px] font-medium"
      style={{ color: state.ok ? "var(--success)" : "var(--danger)" }}
    >
      {state.ok ? successText : state.error}
    </p>
  );
}
