import Link from "next/link";
import { getT } from "@/lib/i18n/server";

/** Shown in place of the new-counter and visit forms when the rep hasn't
 * clocked in yet. `createCounter` / `createVisit` enforce the same rule, so
 * this is the friendly face of a check that also holds on the server. */
export async function StartDayRequired({ title }: { title: string }) {
  const t = await getT();
  return (
    <div className="mx-auto max-w-md">
      <div className="card p-8 text-center">
        <h2 className="text-[20px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          {title}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {t("Start your day log before adding counters or visits.")}
        </p>
        <Link href="/field/day-log" className="btn btn-primary mt-5 inline-flex">
          {t("Go to Day Log")}
        </Link>
      </div>
    </div>
  );
}
