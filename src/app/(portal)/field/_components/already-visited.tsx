import Link from "next/link";
import { formatISTTime } from "@/lib/date";
import { getT } from "@/lib/i18n/server";

/** Shown in place of the visit form when the rep has already called on this
 * counter today. `createVisit` enforces the same rule, so this is the friendly
 * face of a check that also holds on the server — same arrangement as
 * `StartDayRequired`. */
export async function AlreadyVisited({
  title,
  counterId,
  visitId,
  visitedAt,
}: {
  title: string;
  counterId: string;
  visitId: string;
  visitedAt: Date;
}) {
  const t = await getT();
  return (
    <div className="mx-auto max-w-md">
      <div className="card p-8 text-center">
        <span
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "rgba(30,158,90,.12)", color: "var(--success)" }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h2
          className="mt-4 text-[20px] font-semibold"
          style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}
        >
          {title}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {t("You already visited this counter today at")} {formatISTTime(visitedAt)}.{" "}
          {t("Edit that visit instead of adding a new one.")}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href={`/field/counter/${counterId}/visit/${visitId}`} className="btn btn-primary">
            {t("Edit today's visit")}
          </Link>
          <Link href={`/field/counter/${counterId}`} className="btn btn-secondary">
            {t("Back to counter")}
          </Link>
        </div>
      </div>
    </div>
  );
}
