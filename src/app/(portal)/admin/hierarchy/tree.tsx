"use client";

import { useMemo, useState } from "react";
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
  CaretIcon,
  GlobeIcon,
  KIND_LABEL,
  LEVEL,
  PinIcon,
  StoreIcon,
  UsersIcon,
  stockistMeta,
  type HierarchyData,
} from "./hierarchy-shared";

/**
 * Territory Management as an outline tree — the whole shape at once.
 *
 * Where the columns view walks one path at a time, this answers "what does
 * this C&F actually look like" without clicking through five panes: how many
 * sub-dealers hang off which dealer, which stockists carry the areas, where
 * the counters concentrate.
 *
 * Expansion is component state, not a URL param. It isn't a selection — half
 * a dozen branches can be open at once — and encoding that set in the query
 * string would make every disclosure a navigation and every shared link carry
 * somebody else's reading position. States and C&Fs open by default so the
 * screen is useful on arrival without dumping every area on it.
 */
export function HierarchyTree({ data }: { data: HierarchyData }) {
  const t = useT();

  // Children looked up by parent, so a node doesn't scan the whole array.
  const index = useMemo(() => {
    const cnfsByState = new Map<string, HierarchyData["cnfs"]>();
    for (const c of data.cnfs) {
      const list = cnfsByState.get(c.stateId) ?? [];
      list.push(c);
      cnfsByState.set(c.stateId, list);
    }
    const topByCnf = new Map<string, HierarchyData["stockists"]>();
    const subsByParent = new Map<string, HierarchyData["stockists"]>();
    for (const s of data.stockists) {
      if (s.parentId === null) {
        const list = topByCnf.get(s.cnfId) ?? [];
        list.push(s);
        topByCnf.set(s.cnfId, list);
      } else {
        const list = subsByParent.get(s.parentId) ?? [];
        list.push(s);
        subsByParent.set(s.parentId, list);
      }
    }
    const areasByStockist = new Map<string, HierarchyData["areas"]>();
    for (const a of data.areas) {
      const list = areasByStockist.get(a.stockistId) ?? [];
      list.push(a);
      areasByStockist.set(a.stockistId, list);
    }
    return { cnfsByState, topByCnf, subsByParent, areasByStockist };
  }, [data]);

  // Open by default: every state and every C&F, so arriving shows the
  // stockists without a click but stops short of listing 114 areas.
  const defaultOpen = useMemo(
    () => new Set([...data.states.map((s) => s.id), ...data.cnfs.map((c) => c.id)]),
    [data],
  );
  const [open, setOpen] = useState<Set<string>>(defaultOpen);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const everyId = useMemo(
    () => [
      ...data.states.map((s) => s.id),
      ...data.cnfs.map((c) => c.id),
      ...data.stockists.map((s) => s.id),
    ],
    [data],
  );

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setOpen(new Set(everyId))}
        >
          {t("Expand all")}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setOpen(new Set())}
        >
          {t("Collapse all")}
        </button>
        <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
          {data.states.length} {t(data.states.length === 1 ? "state" : "states")} ·{" "}
          {data.cnfs.length} {t("C&F")} · {data.stockists.length} {t("stockists")} ·{" "}
          {data.areas.length} {t("areas")}
        </span>
      </div>

      <div className="card p-2 md:p-3">
        {data.states.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            {t("No states yet.")}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {data.states.map((s) => {
              const cnfs = index.cnfsByState.get(s.id) ?? [];
              return (
                <Node
                  key={s.id}
                  id={s.id}
                  open={open.has(s.id)}
                  onToggle={() => toggle(s.id)}
                  hasChildren={cnfs.length > 0}
                  tint={LEVEL.state.tint}
                  soft={LEVEL.state.soft}
                  icon={<GlobeIcon />}
                  name={s.name}
                  meta={`${s.country} · ${s.cnfCount} ${t(s.cnfCount === 1 ? "C&F HQ" : "C&F HQs")}`}
                  action={
                    <ConfirmDelete
                      action={deleteState.bind(null, s.id)}
                      itemLabel="state"
                      itemName={s.name}
                      loadImpact={() => getDeleteImpact("state", s.id)}
                      trigger="icon"
                    />
                  }
                  add={
                    <AddControl
                      compact
                      action={addCnf.bind(null, s.id)}
                      label={t("Add C&F HQ")}
                      fields={[{ name: "name", placeholder: t("C&F HQ name") }]}
                    />
                  }
                >
                  {cnfs.map((c) => {
                    const tops = index.topByCnf.get(c.id) ?? [];
                    return (
                      <Node
                        key={c.id}
                        id={c.id}
                        open={open.has(c.id)}
                        onToggle={() => toggle(c.id)}
                        hasChildren={tops.length > 0}
                        tint={LEVEL.cnf.tint}
                        soft={LEVEL.cnf.soft}
                        icon={<BuildingIcon />}
                        name={c.name}
                        meta={`${c.stockistCount} ${t(c.stockistCount === 1 ? "stockist" : "stockists")}`}
                        action={
                          <ConfirmDelete
                            action={deleteCnf.bind(null, c.id)}
                            itemLabel="C&F HQ"
                            itemName={c.name}
                            loadImpact={() => getDeleteImpact("cnf", c.id)}
                            trigger="icon"
                          />
                        }
                        add={
                          <AddControl
                            compact
                            action={addStockist.bind(null, c.id)}
                            label={t("Add stockist")}
                            kinds={[
                              { value: "depot", label: t("Depot"), hint: t("C&F-managed stock") },
                              { value: "dealer", label: t("Dealer"), hint: t("Third-party stock") },
                            ]}
                            fields={[{ name: "name", placeholder: t("Stockist name") }]}
                          />
                        }
                      >
                        {tops.map((d) => (
                          <StockistNode
                            key={d.id}
                            stockist={d}
                            index={index}
                            open={open}
                            onToggle={toggle}
                            t={t}
                          />
                        ))}
                      </Node>
                    );
                  })}
                </Node>
              );
            })}
          </ul>
        )}

        <div className="mt-1 pl-1">
          <AddControl
            compact
            action={addState}
            label={t("Add state")}
            fields={[
              { name: "name", placeholder: t("State name") },
              { name: "country", placeholder: t("Country"), defaultValue: "India" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

/** A stockist and everything under it: sub-dealers first, then its own areas. */
function StockistNode({
  stockist: d,
  index,
  open,
  onToggle,
  t,
}: {
  stockist: HierarchyData["stockists"][number];
  index: {
    subsByParent: Map<string, HierarchyData["stockists"]>;
    areasByStockist: Map<string, HierarchyData["areas"]>;
  };
  open: Set<string>;
  onToggle: (id: string) => void;
  t: (k: string) => string;
}) {
  const subs = index.subsByParent.get(d.id) ?? [];
  const areas = index.areasByStockist.get(d.id) ?? [];
  const level = LEVEL[d.kind];

  return (
    <Node
      id={d.id}
      open={open.has(d.id)}
      onToggle={() => onToggle(d.id)}
      hasChildren={subs.length > 0 || areas.length > 0}
      tint={level.tint}
      soft={level.soft}
      icon={d.kind === "sub_dealer" ? <UsersIcon /> : <StoreIcon />}
      name={d.name}
      badge={{ label: t(KIND_LABEL[d.kind]), ...level }}
      meta={stockistMeta(d, t)}
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
      add={
        <div className="flex flex-wrap items-center gap-1.5">
          <AddControl
            compact
            action={addArea.bind(null, d.id)}
            label={t("Add area")}
            fields={[{ name: "name", placeholder: t("Area name") }]}
          />
          {/* Only a dealer has the sub-dealer tier — exactly one optional level. */}
          {d.kind === "dealer" && (
            <AddControl
              compact
              action={addStockist.bind(null, d.cnfId)}
              label={t("Add sub-dealer")}
              hidden={{ kind: "sub_dealer", parentId: d.id }}
              fields={[{ name: "name", placeholder: t("Sub-dealer name") }]}
            />
          )}
        </div>
      }
    >
      {subs.map((sd) => (
        <StockistNode key={sd.id} stockist={sd} index={index} open={open} onToggle={onToggle} t={t} />
      ))}
      {areas.map((a) => (
        <Node
          key={a.id}
          id={a.id}
          tint={LEVEL.area.tint}
          soft={LEVEL.area.soft}
          icon={<PinIcon />}
          name={a.name}
          meta={`${a.counters} ${t(a.counters === 1 ? "counter" : "counters")}`}
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
    </Node>
  );
}

/**
 * One row plus its indented children.
 *
 * A leaf (an area) passes no `onToggle` and renders a spacer where the caret
 * would be, so names stay on one vertical line rather than stepping in and out
 * by 13px depending on whether a row happens to have children.
 */
function Node({
  open,
  onToggle,
  hasChildren,
  tint,
  soft,
  icon,
  name,
  badge,
  meta,
  action,
  add,
  children,
}: {
  id: string;
  open?: boolean;
  onToggle?: () => void;
  hasChildren?: boolean;
  tint: string;
  soft: string;
  icon: React.ReactNode;
  name: string;
  badge?: { label: string; tint: string; soft: string };
  meta: string;
  action: React.ReactNode;
  add?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const expandable = !!onToggle && !!hasChildren;
  return (
    <li>
      <div className="group flex items-center gap-1.5 rounded-lg pr-1.5 transition-colors hover:bg-[var(--bg-soft)]">
        {expandable ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex h-6 w-6 flex-none items-center justify-center rounded"
          >
            <CaretIcon open={!!open} />
          </button>
        ) : (
          <span className="h-6 w-6 flex-none" aria-hidden />
        )}

        <span
          className="flex h-6 w-6 flex-none items-center justify-center rounded-md"
          style={{ background: soft, color: tint }}
        >
          {icon}
        </span>

        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
          <span className="truncate text-[13.5px] font-semibold" style={{ color: "var(--ink-1)" }}>
            {name}
          </span>
          {badge && (
            <span
              className="flex-none rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: badge.soft, color: badge.tint }}
            >
              {badge.label}
            </span>
          )}
          <span className="truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
            {meta}
          </span>
        </div>

        {/* Delete stays hidden until hover or focus, so a long tree reads as
            content rather than a column of red. */}
        <span className="flex-none opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {action}
        </span>
      </div>

      {open && (children || add) && (
        // The guide line is on the container, so it spans exactly the children
        // and stops — a border on each row would leave gaps at the seams.
        <ul
          className="ml-3 flex flex-col gap-0.5 border-l pl-3"
          style={{ borderColor: "var(--hairline-soft)" }}
        >
          {children}
          {add && <li className="py-1">{add}</li>}
        </ul>
      )}
    </li>
  );
}
