"use client";

import { useOptimistic, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { LEVEL, Legend } from "./hierarchy-shared";
import type { HierarchyView } from "./view";

/**
 * Shared header for Territory Management: the level legend, and the switch
 * between the two layouts.
 *
 * The two views answer different questions. Columns is for drilling — one path
 * at a time, wide rows, room for the counts. Tree is for shape — how many
 * sub-dealers hang off which dealer, where the areas cluster, all at once.
 * Neither replaces the other, so the choice lives in `?view=` and survives a
 * reload and a shared link.
 */
export function HierarchyHeader({ view }: { view: HierarchyView }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [shown, showOptimistic] = useOptimistic(view);

  function switchTo(next: HierarchyView) {
    if (next === shown) return;
    startTransition(() => {
      showOptimistic(next);
      const q = new URLSearchParams(params.toString());
      // Columns is the default, so it needs no param — and the drill-down
      // selection is meaningless to the tree, which expands rather than picks.
      if (next === "columns") q.delete("view");
      else q.set("view", next);
      const s = q.toString();
      router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div
        className="flex flex-wrap items-center gap-3 text-[11.5px]"
        style={{ color: "var(--ink-3)" }}
      >
        <Legend tint={LEVEL.state.tint} label={t("State")} />
        <Legend tint={LEVEL.cnf.tint} label={t("C&F HQ")} />
        <Legend tint={LEVEL.depot.tint} label={t("Depot")} />
        <Legend tint={LEVEL.dealer.tint} label={t("Dealer")} />
        <Legend tint={LEVEL.sub_dealer.tint} label={t("Sub-Dealer")} />
        <Legend tint={LEVEL.area.tint} label={t("Area")} />
      </div>

      <div
        className="flex flex-none items-center gap-0.5 rounded-full p-[3px] transition-opacity"
        style={{ background: "var(--bg-soft)", opacity: pending ? 0.72 : 1 }}
        role="group"
        aria-label={t("View mode")}
      >
        <ViewButton
          active={shown === "columns"}
          onClick={() => switchTo("columns")}
          icon={<ColumnsIcon />}
          label={t("Columns")}
        />
        <ViewButton
          active={shown === "tree"}
          onClick={() => switchTo("tree")}
          icon={<TreeIcon />}
          label={t("Tree")}
        />
      </div>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
      style={{
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#fff" : "var(--ink-2)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const ico = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ColumnsIcon() {
  return (
    <svg {...ico}>
      <rect x="3" y="4" width="5.5" height="16" rx="1.5" />
      <rect x="9.25" y="4" width="5.5" height="16" rx="1.5" />
      <rect x="15.5" y="4" width="5.5" height="16" rx="1.5" />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg {...ico}>
      <path d="M5 4v11a2 2 0 0 0 2 2h3M5 9h5" />
      <rect x="10" y="6.5" width="9" height="5" rx="1.5" />
      <rect x="10" y="14.5" width="9" height="5" rx="1.5" />
    </svg>
  );
}
