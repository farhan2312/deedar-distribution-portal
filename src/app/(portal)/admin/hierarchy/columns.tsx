"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
} from "@/lib/admin/actions";
import { useT } from "@/lib/i18n/provider";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import {
  AddControl,
  BuildingIcon,
  ChevronIcon,
  GlobeIcon,
  KIND_LABEL,
  LEVEL,
  PinIcon,
  StoreIcon,
  UsersIcon,
  stockistMeta,
  type HierarchyData,
  type Selection,
} from "./hierarchy-shared";

// Re-exported so `page.tsx` and the tree keep importing the shape from one
// place while the definitions live in the shared module.
export type { HierarchyData, Selection };

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

// ── Pieces ───────────────────────────────────────────────────────────────

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
