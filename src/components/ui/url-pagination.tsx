"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { Pagination } from "./pagination";

/**
 * Pagers that own their own URL param.
 *
 * The lists that page already each carry their own copy of "build a
 * URLSearchParams, set one key, push" because they were already Client
 * Components with a filter bar. A Server Component has no such place to put it
 * — it cannot pass an `onGo` callback across the boundary — so these wrap the
 * push and take a param name instead.
 *
 * Two of them, because one page can hold two independent lists: naming the
 * param at the call site is what keeps `?vpage=` and `?cpage=` from colliding.
 */

function usePager(param: string) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(page: number) {
    startTransition(() => {
      const next = new URLSearchParams(params.toString());
      // Page 1 is the default, so it stays out of the URL.
      if (page <= 1) next.delete(param);
      else next.set(param, String(page));
      const query = next.toString();
      // scroll:false — paging a list halfway down a long page should not throw
      // the reader back to the top of it.
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return { go, pending };
}

/** Numbered pager for a list where jumping to a specific page is useful. */
export function UrlPagination({
  page,
  totalPages,
  param,
}: {
  page: number;
  totalPages: number;
  param: string;
}) {
  const t = useT();
  const { go, pending } = usePager(param);
  if (totalPages <= 1) return null;
  return (
    <div className="transition-opacity" style={{ opacity: pending ? 0.6 : 1 }}>
      <Pagination page={page} totalPages={totalPages} onGo={go} t={t} />
    </div>
  );
}

/**
 * Prev/next arrows with a position readout, for stepping through a grid of
 * cards where page numbers would say less than "31–60 of 214" does.
 */
export function ArrowPager({
  page,
  totalPages,
  total,
  pageSize,
  param,
  unit,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  param: string;
  /** Plural noun for the readout, e.g. "counters". Already translated. */
  unit: string;
}) {
  const t = useT();
  const { go, pending } = usePager(param);
  if (totalPages <= 1) return null;

  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div
      className="flex items-center justify-end gap-2 transition-opacity"
      style={{ opacity: pending ? 0.6 : 1 }}
    >
      <span className="text-[11.5px] tabular-nums" style={{ color: "var(--ink-3)" }}>
        {first}–{last} {t("of")} {total} {unit}
      </span>
      <Arrow
        dir="prev"
        label={t("Previous")}
        disabled={page <= 1}
        onClick={() => go(page - 1)}
      />
      <Arrow
        dir="next"
        label={t("Next")}
        disabled={page >= totalPages}
        onClick={() => go(page + 1)}
      />
    </div>
  );
}

function Arrow({
  dir,
  label,
  disabled,
  onClick,
}: {
  dir: "prev" | "next";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-lg border transition-colors disabled:opacity-35"
      style={{
        borderColor: "var(--hairline)",
        background: "var(--surface)",
        color: "var(--ink-2)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={dir === "prev" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}
