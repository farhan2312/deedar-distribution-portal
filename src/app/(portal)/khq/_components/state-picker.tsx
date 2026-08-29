"use client";

import { useOptimistic, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/provider";

/**
 * State scope for the company dashboard, writing `?state=<id>`.
 *
 * "All states" is the default and clears the param, so the plain
 * `/khq/dashboard` URL is the company-wide view. Every other param is
 * preserved, so it composes with the period filter.
 *
 * Selecting is optimistic, for the same reason as the period pills: `value` is
 * the server's answer and only arrives once the whole dashboard has re-queried,
 * so painting the select from it made the choice snap back to the old state
 * first. `useOptimistic` defers back to the server's value on settle.
 */
export function StatePicker({
  options,
  value,
}: {
  options: { id: string; name: string }[];
  /** Selected state id, or "all". */
  value: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [shown, showOptimistic] = useOptimistic(value);

  function select(next: string) {
    startTransition(() => {
      showOptimistic(next);
      const q = new URLSearchParams(params.toString());
      if (next === "all") q.delete("state");
      else q.set("state", next);
      const query = q.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <select
      className="inp transition-opacity"
      style={{
        width: "auto",
        padding: "6px 10px",
        fontSize: 12,
        opacity: pending ? 0.72 : 1,
      }}
      value={shown}
      onChange={(e) => select(e.target.value)}
      aria-label={t("State")}
    >
      <option value="all">{t("All states")}</option>
      {options.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
