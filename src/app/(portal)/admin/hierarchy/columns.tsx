"use client";

import { useActionState, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { StockistKind } from "@/db/schema";
import {
  addArea,
  addCnf,
  addState,
  addStockist,
  deleteArea,
  deleteCnf,
  deleteState,
  deleteStockist,
  getDeleteImpact,
  type HierarchyResult,
} from "@/lib/admin/actions";
import { useT } from "@/lib/i18n/provider";
import { ConfirmDelete } from "@/components/ui/confirm-delete";

// ── Data ─────────────────────────────────────────────────────────────────

export type HierarchyData = {
  states: { id: string; name: string; country: string; cnfCount: number }[];
  cnfs: { id: string; name: string; stateId: string; stockistCount: number }[];
  stockists: {
    id: string;
    name: string;
    cnfId: string;
    kind: StockistKind;
    parentId: string | null;
    counters: number;
    reps: number;
    subDealers: number;
    areas: number;
  }[];
  areas: { id: string; name: string; stockistId: string; counters: number }[];
};

export type Selection = {
  state: string | null;
  cnf: string | null;
  stockist: string | null;
  sub: string | null;
};

// ── Palette ──────────────────────────────────────────────────────────────

/** One accent per level, so a column's header, icon and selected row all agree
 * and you can tell depth at a glance without reading the labels. */
const LEVEL = {
  state: { tint: "#2E9E5A", soft: "rgba(46,158,90,.12)" },
  cnf: { tint: "#2E5FA3", soft: "rgba(46,95,163,.12)" },
  depot: { tint: "#128A82", soft: "rgba(18,138,130,.12)" },
  dealer: { tint: "#B9812E", soft: "rgba(185,129,46,.14)" },
  sub_dealer: { tint: "#8A6FBF", soft: "rgba(138,111,191,.14)" },
  area: { tint: "#7B2FA0", soft: "rgba(123,47,160,.10)" },
} as const;

const KIND_LABEL: Record<StockistKind, string> = {
  depot: "Depot",
  dealer: "Dealer",
  sub_dealer: "Sub-Dealer",
};

// ── Screen ───────────────────────────────────────────────────────────────

export function HierarchyColumns({
  data,
  selection,
}: {
  data: HierarchyData;
  selection: Selection;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  /**
   * Selection lives in the URL so the view is linkable and the back button
   * works. Picking a level clears everything below it — keeping a stale
   * sub-dealer selected while its dealer changes would show a column of
   * children that belong to something else.
   */
  function select(level: keyof Selection, id: string | null) {
    const order: (keyof Selection)[] = ["state", "cnf", "stockist", "sub"];
    const q = new URLSearchParams(params.toString());
    const from = order.indexOf(level);
    for (const k of order.slice(from)) q.delete(k);
    if (id) q.set(level, id);
    const s = q.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  const state = data.states.find((s) => s.id === selection.state) ?? null;
  const cnfList = state ? data.cnfs.filter((c) => c.stateId === state.id) : [];
  const cnf = cnfList.find((c) => c.id === selection.cnf) ?? null;

  const stockistList = cnf
    ? data.stockists.filter((d) => d.cnfId === cnf.id && d.parentId === null)
    : [];
  const stockist = stockistList.find((d) => d.id === selection.stockist) ?? null;

  const subList = stockist ? data.stockists.filter((d) => d.parentId === stockist.id) : [];
  const sub = subList.find((d) => d.id === selection.sub) ?? null;

  // Areas belong to whichever stockist is deepest in the selection.
  const areaOwner = sub ?? stockist;
  const areaList = areaOwner ? data.areas.filter((a) => a.stockistId === areaOwner.id) : [];

  // On a phone the columns can't sit side by side, so only the deepest one with
  // a selection is shown and a breadcrumb walks back up.
  const trail = [
    state && { level: "state" as const, name: state.name },
    cnf && { level: "cnf" as const, name: cnf.name },
    stockist && { level: "stockist" as const, name: stockist.name },
    sub && { level: "sub" as const, name: sub.name },
  ].filter(Boolean) as { level: keyof Selection; name: string }[];

  const deepest = sub ? 4 : stockist ? 3 : cnf ? 2 : state ? 1 : 0;

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Legend — the page title itself lives in the top bar. */}
      <div className="card mb-4 px-5 py-3">
        <div className="flex flex-wrap items-center gap-3 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          <Legend tint={LEVEL.state.tint} label={t("State")} />
          <Legend tint={LEVEL.cnf.tint} label={t("C&F HQ")} />
          <Legend tint={LEVEL.depot.tint} label={t("Depot")} />
          <Legend tint={LEVEL.dealer.tint} label={t("Dealer")} />
          <Legend tint={LEVEL.sub_dealer.tint} label={t("Sub-Dealer")} />
          <Legend tint={LEVEL.area.tint} label={t("Area")} />
        </div>
      </div>

      {/* Breadcrumb — the phone's navigation, redundant on wide screens */}
      {trail.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] lg:hidden">
          <button type="button" className="link" onClick={() => select("state", null)}>
            {t("All states")}
          </button>
          {trail.map((c) => (
            <span key={c.level} className="flex items-center gap-1.5">
              <span style={{ color: "var(--ink-3)" }}>›</span>
              <button type="button" className="link" onClick={() => select(c.level, null)}>
                {c.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Columns. Horizontal scroll is the point of this layout — five columns
          will not fit a laptop, and squeezing them makes every one unreadable. */}
      <div className="flex gap-3.5 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
        <Column
          index={0}
          deepest={deepest}
          label={t("States")}
          tint={LEVEL.state.tint}
          icon={<GlobeIcon />}
          count={data.states.length}
          add={
            <AddControl
              action={addState}
              label={t("Add state")}
              fields={[
                { name: "name", placeholder: t("State name") },
                { name: "country", placeholder: t("Country"), defaultValue: "India" },
              ]}
            />
          }
        >
          {data.states.map((s) => (
            <Row
              key={s.id}
              name={s.name}
              meta={`${s.country} · ${s.cnfCount} ${t(s.cnfCount === 1 ? "C&F HQ" : "C&F HQs")}`}
              selected={state?.id === s.id}
              tint={LEVEL.state.tint}
              soft={LEVEL.state.soft}
              hasChildren
              onSelect={() => select("state", s.id)}
              action={
                <ConfirmDelete
                  action={deleteState.bind(null, s.id)}
                  itemLabel="state"
                  itemName={s.name}
                  loadImpact={() => getDeleteImpact("state", s.id)}
                  trigger="icon"
                />
              }
            />
          ))}
        </Column>

        <Column
          index={1}
          deepest={deepest}
          label={t("C&F HQ")}
          tint={LEVEL.cnf.tint}
          icon={<BuildingIcon />}
          count={cnfList.length}
          empty={!state ? t("Pick a state") : undefined}
          parentName={state?.name}
          add={
            state ? (
              <AddControl
                action={addCnf.bind(null, state.id)}
                label={t("Add C&F HQ")}
                fields={[{ name: "name", placeholder: t("C&F HQ name") }]}
              />
            ) : null
          }
        >
          {cnfList.map((c) => (
            <Row
              key={c.id}
              name={c.name}
              meta={`${t("One per state")} · ${c.stockistCount} ${t(c.stockistCount === 1 ? "stockist" : "stockists")}`}
              selected={cnf?.id === c.id}
              tint={LEVEL.cnf.tint}
              soft={LEVEL.cnf.soft}
              hasChildren
              onSelect={() => select("cnf", c.id)}
              action={
                <ConfirmDelete
                  action={deleteCnf.bind(null, c.id)}
                  itemLabel="C&F HQ"
                  itemName={c.name}
                  loadImpact={() => getDeleteImpact("cnf", c.id)}
                  trigger="icon"
                />
              }
            />
          ))}
        </Column>

        <Column
          index={2}
          deepest={deepest}
          label={t("Stockists")}
          tint={LEVEL.depot.tint}
          icon={<StoreIcon />}
          count={stockistList.length}
          empty={!cnf ? t("Pick a C&F HQ") : undefined}
          parentName={cnf?.name}
          add={
            cnf ? (
              <AddControl
                action={addStockist.bind(null, cnf.id)}
                label={t("Add stockist")}
                kinds={[
                  { value: "depot", label: t("Depot"), hint: t("C&F-managed stock") },
                  { value: "dealer", label: t("Dealer"), hint: t("Third-party stock") },
                ]}
                fields={[{ name: "name", placeholder: t("Stockist name") }]}
              />
            ) : null
          }
        >
          {stockistList.map((d) => (
            <Row
              key={d.id}
              name={d.name}
              badge={{ label: t(KIND_LABEL[d.kind]), ...LEVEL[d.kind] }}
              meta={stockistMeta(d, t)}
              selected={stockist?.id === d.id}
              tint={LEVEL[d.kind].tint}
              soft={LEVEL[d.kind].soft}
              hasChildren={d.areas > 0 || d.subDealers > 0}
              onSelect={() => select("stockist", d.id)}
              action={
                <ConfirmDelete
                  action={deleteStockist.bind(null, d.id)}
                  itemLabel={t(KIND_LABEL[d.kind]).toLowerCase()}
                  itemName={d.name}
                  loadImpact={() => getDeleteImpact("depot", d.id)}
                  warning={d.subDealers > 0 ? t("Its sub-dealers and everything under them go too.") : undefined}
                  trigger="icon"
                />
              }
            />
          ))}
        </Column>

        {/* Only a dealer has this tier, so the column appears only for one. */}
        {(!stockist || stockist.kind === "dealer") && (
          <Column
            index={3}
            deepest={deepest}
            label={t("Sub-Dealers")}
            tint={LEVEL.sub_dealer.tint}
            icon={<UsersIcon />}
            count={subList.length}
            empty={!stockist ? t("Pick a dealer") : undefined}
            parentName={stockist?.name}
            add={
              stockist ? (
                <AddControl
                  action={addStockist.bind(null, stockist.cnfId)}
                  label={t("Add sub-dealer")}
                  hidden={{ kind: "sub_dealer", parentId: stockist.id }}
                  fields={[{ name: "name", placeholder: t("Sub-dealer name") }]}
                />
              ) : null
            }
          >
            {subList.map((d) => (
              <Row
                key={d.id}
                name={d.name}
                badge={{ label: t("Sub-Dealer"), ...LEVEL.sub_dealer }}
                meta={stockistMeta(d, t)}
                selected={sub?.id === d.id}
                tint={LEVEL.sub_dealer.tint}
                soft={LEVEL.sub_dealer.soft}
                hasChildren={d.areas > 0}
                onSelect={() => select("sub", d.id)}
                action={
                  <ConfirmDelete
                    action={deleteStockist.bind(null, d.id)}
                    itemLabel="sub-dealer"
                    itemName={d.name}
                    loadImpact={() => getDeleteImpact("depot", d.id)}
                    trigger="icon"
                  />
                }
              />
            ))}
          </Column>
        )}

        <Column
          index={4}
          deepest={deepest}
          label={t("Areas")}
          tint={LEVEL.area.tint}
          icon={<PinIcon />}
          count={areaList.length}
          empty={!areaOwner ? t("Pick a stockist") : undefined}
          parentName={areaOwner?.name}
          add={
            areaOwner ? (
              <AddControl
                action={addArea.bind(null, areaOwner.id)}
                label={t("Add area")}
                fields={[{ name: "name", placeholder: t("Area name") }]}
              />
            ) : null
          }
        >
          {areaList.map((a) => (
            <Row
              key={a.id}
              name={a.name}
              meta={`${a.counters} ${t(a.counters === 1 ? "counter" : "counters")}`}
              tint={LEVEL.area.tint}
              soft={LEVEL.area.soft}
              action={
                <ConfirmDelete
                  action={deleteArea.bind(null, a.id)}
                  itemLabel="area"
                  itemName={a.name}
                  loadImpact={() => getDeleteImpact("area", a.id)}
                  trigger="icon"
                />
              }
            />
          ))}
        </Column>
      </div>
    </div>
  );
}

function stockistMeta(
  d: HierarchyData["stockists"][number],
  t: (k: string) => string,
): string {
  const parts = [
    `${d.counters} ${t(d.counters === 1 ? "counter" : "counters")}`,
    `${d.reps} ${t(d.reps === 1 ? "rep" : "reps")}`,
  ];
  if (d.subDealers > 0) {
    parts.push(`${d.subDealers} ${t(d.subDealers === 1 ? "sub-dealer" : "sub-dealers")}`);
  }
  return parts.join(" · ");
}

// ── Pieces ───────────────────────────────────────────────────────────────

function Legend({ tint, label }: { tint: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: tint }} />
      {label}
    </span>
  );
}

function Column({
  index,
  deepest,
  label,
  tint,
  icon,
  count,
  empty,
  parentName,
  add,
  children,
}: {
  /** Position, used only to decide what a phone shows. */
  index: number;
  deepest: number;
  label: string;
  tint: string;
  icon: React.ReactNode;
  count: number;
  /** Shown instead of rows when there is no parent selected yet. */
  empty?: string;
  parentName?: string;
  add: React.ReactNode;
  children: React.ReactNode;
}) {
  // Phone: only the column you are looking at. Desktop: all of them.
  const phoneVisible = index === deepest;
  return (
    <section
      className={`card flex w-[290px] flex-none flex-col overflow-hidden p-0 ${phoneVisible ? "flex" : "hidden lg:flex"}`}
      style={{ maxHeight: "calc(100dvh - 230px)" }}
    >
      <div
        className="flex flex-none items-center gap-2.5 border-b px-4 py-3"
        style={{ borderColor: "var(--hairline-soft)" }}
      >
        <span
          className="flex h-7 w-7 flex-none items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: "var(--ink-3)" }}
          >
            {label}
          </div>
          {parentName && (
            <div className="truncate text-[11.5px]" style={{ color: "var(--ink-2)" }} title={parentName}>
              {parentName}
            </div>
          )}
        </div>
        <span
          className="flex-none rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
          style={{ background: "var(--bg-soft)", color: "var(--ink-3)" }}
        >
          {count}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {empty ? (
          <p className="px-2 py-6 text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            {empty}
          </p>
        ) : count === 0 ? (
          <p className="px-2 py-6 text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            —
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">{children}</div>
        )}
      </div>

      {add && (
        <div className="flex-none border-t p-2" style={{ borderColor: "var(--hairline-soft)" }}>
          {add}
        </div>
      )}
    </section>
  );
}

function Row({
  name,
  meta,
  badge,
  selected,
  tint,
  soft,
  hasChildren,
  onSelect,
  action,
}: {
  name: string;
  meta: string;
  badge?: { label: string; tint: string; soft: string };
  selected?: boolean;
  tint: string;
  soft: string;
  hasChildren?: boolean;
  onSelect?: () => void;
  action: React.ReactNode;
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold" style={{ color: "var(--ink-1)" }}>
            {name}
          </span>
          {badge && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: badge.soft, color: badge.tint }}
            >
              {badge.label}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          {meta}
        </div>
      </div>
      {hasChildren && <ChevronIcon />}
    </>
  );

  return (
    <div
      className="group flex items-center gap-1.5 rounded-xl border transition-colors"
      style={{
        borderColor: selected ? tint : "var(--hairline-soft)",
        background: selected ? soft : "var(--surface)",
        // A left bar rather than a heavy fill: it marks the selected row without
        // fighting the badge and counts for attention.
        boxShadow: selected ? `inset 3px 0 0 ${tint}` : undefined,
      }}
    >
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left"
        >
          {inner}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5">{inner}</div>
      )}
      {/* Delete stays out of the way until the row is hovered or focused, so a
          column of rows reads as content rather than a wall of red. */}
      <span className="flex-none pr-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {action}
      </span>
    </div>
  );
}

/**
 * Collapsed add control at the foot of a column.
 *
 * Opens into a small labelled form rather than sitting open: five always-open
 * inputs across five columns is what made the previous screen hard to read.
 */
function AddControl({
  action,
  label,
  fields,
  hidden,
  kinds,
}: {
  action: (formData: FormData) => Promise<HierarchyResult>;
  label: string;
  fields: { name: string; placeholder: string; defaultValue?: string }[];
  hidden?: Record<string, string>;
  kinds?: { value: string; label: string; hint: string }[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(kinds?.[0]?.value ?? "");
  const [state, formAction, pending] = useActionState<HierarchyResult | null, FormData>(
    async (_prev, fd) => {
      const res = await action(fd);
      if (res.ok) setOpen(false);
      return res;
    },
    null,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-[12px] font-semibold transition-colors"
        style={{ borderColor: "var(--hairline)", color: "var(--ink-3)" }}
      >
        <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
          +
        </span>
        {label}
      </button>
    );
  }

  return (
    <form action={formAction} key={state?.ok ? "done" : "editing"} className="flex flex-col gap-2">
      {hidden &&
        Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} readOnly />
        ))}

      {kinds && (
        <>
          <input type="hidden" name="kind" value={kind} readOnly />
          <div className="flex flex-wrap gap-1.5">
            {kinds.map((k) => {
              const active = kind === k.value;
              return (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  disabled={pending}
                  className="flex-1 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold transition-colors"
                  style={{
                    background: active ? "var(--accent)" : "var(--bg-soft)",
                    color: active ? "#fff" : "var(--ink-2)",
                  }}
                >
                  {k.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
            {kinds.find((k) => k.value === kind)?.hint}
          </p>
        </>
      )}

      {fields.map((f, i) => (
        <input
          key={f.name}
          className="inp"
          type="text"
          name={f.name}
          placeholder={f.placeholder}
          defaultValue={f.defaultValue}
          required={i === 0}
          autoFocus={i === 0}
          style={{ padding: "6px 9px", fontSize: 12 }}
          disabled={pending}
        />
      ))}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary btn-sm flex-1 justify-center" type="submit" disabled={pending}>
          {pending ? t("Adding…") : t("Add")}
        </button>
        <button type="button" className="link text-[12px]" onClick={() => setOpen(false)} disabled={pending}>
          {t("Cancel")}
        </button>
      </div>

      {state && !state.ok && (
        <p className="text-[11px] font-medium" style={{ color: "var(--danger)" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────

const ico = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function GlobeIcon() {
  return (
    <svg {...ico}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18-2.5-2.7-2.5-15.3 0-18Z" />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg {...ico}>
      <path d="M4 21V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15M15 21V10h3a2 2 0 0 1 2 2v9M4 21h17M8 8h3M8 12h3M8 16h3" />
    </svg>
  );
}
function StoreIcon() {
  return (
    <svg {...ico}>
      <path d="M3 9h18l-1-4H4L3 9ZM5 9v11h14V9M9 20v-6h6v6" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg {...ico}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5M18 20a5 5 0 0 0-2-4" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg {...ico}>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg {...ico} width="14" height="14" style={{ color: "var(--ink-3)", flex: "none" }}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
