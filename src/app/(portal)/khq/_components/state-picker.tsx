"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/provider";

/**
 * State scope for the company dashboard, writing `?state=<id>`.
 *
 * "All states" is the default and clears the param, so the plain
 * `/khq/dashboard` URL is the company-wide view. Every other param is
 * preserved, so it composes with the time slider.
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

  function select(next: string) {
    const q = new URLSearchParams(params.toString());
    if (next === "all") q.delete("state");
    else q.set("state", next);
    const query = q.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <select
      className="inp"
      style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
      value={value}
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
