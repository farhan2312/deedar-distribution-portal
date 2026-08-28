"use client";

import { useActionState, useState } from "react";
import {
  addArea,
  addStockist,
  deleteArea,
  deleteCnf,
  deleteState,
  deleteStockist,
  getDeleteImpact,
  type HierarchyResult,
} from "@/lib/admin/actions";
import type { StockistKind } from "@/db/schema";
import { useT } from "@/lib/i18n/provider";
import { ConfirmDelete } from "@/components/ui/confirm-delete";

export type AreaNode = { id: string; name: string; counters: number };

export type StockistNode = {
  id: string;
  name: string;
  cnfId: string;
  kind: StockistKind;
  counters: number;
  reps: number;
  areas: AreaNode[];
  /** Populated on dealers only — the one optional tier beneath them. */
  subDealers: StockistNode[];
};

/** Top-level stockists only: depots and dealers. Sub-dealers hang off their
 * dealer in `subDealers`, never here. */
export type CnfNode = { id: string; name: string; stockists: StockistNode[] };
export type StateNode = { id: string; name: string; country: string; cnfs: CnfNode[] };

const KIND_STYLE: Record<StockistKind, { label: string; bg: string; color: string }> = {
  depot: { label: "Depot", bg: "rgba(18,138,130,.12)", color: "#0A6660" },
  dealer: { label: "Dealer", bg: "rgba(185,129,46,.14)", color: "#8F611D" },
  sub_dealer: { label: "Sub-Dealer", bg: "rgba(185,129,46,.08)", color: "#B9812E" },
};

const nameCls = "text-[15px] font-semibold";
const nameStyle: React.CSSProperties = { fontFamily: "var(--font-display)", color: "var(--ink-1)" };
const subCls = "mt-0.5 text-[12px]";
const subStyle: React.CSSProperties = { color: "var(--ink-3)" };

export function HierarchyTree({ tree }: { tree: StateNode[] }) {
  const t = useT();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (tree.length === 0) {
    return <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{t("No states yet — add one above.")}</p>;
  }

  return (
    <div>
      {tree.map((st) => {
        const sKey = `s:${st.id}`;
        const sOpen = open.has(sKey);
        return (
          <div key={st.id}>
            <Row
              indent={0}
              onToggle={() => toggle(sKey)}
              chevron={sOpen}
              action={<ConfirmDelete action={deleteState.bind(null, st.id)} itemLabel="state" itemName={st.name} loadImpact={() => getDeleteImpact("state", st.id)} />}
            >
              <div className={nameCls} style={nameStyle}>{st.name}</div>
              <div className={subCls} style={subStyle}>
                {st.country} · {st.cnfs.length} {t(st.cnfs.length === 1 ? "C&F HQ" : "C&F HQs")}
              </div>
            </Row>

            {sOpen &&
              st.cnfs.map((cf) => {
                const cKey = `c:${cf.id}`;
                const cOpen = open.has(cKey);
                return (
                  <div key={cf.id}>
                    <Row
                      indent={24}
                      onToggle={() => toggle(cKey)}
                      chevron={cOpen}
                      action={<ConfirmDelete action={deleteCnf.bind(null, cf.id)} itemLabel="C&F HQ" itemName={cf.name} loadImpact={() => getDeleteImpact("cnf", cf.id)} />}
                    >
                      <div className={nameCls} style={nameStyle}>{cf.name}</div>
                      <div className={subCls} style={subStyle}>{t("One per state ·")} {cf.stockists.length} {t("stockists")}</div>
                    </Row>

                    {cOpen && (
                      <>
                        {/* Depots and dealers are siblings under the C&F; only
                            their label and (for dealers) their sub-tier differ. */}
                        {cf.stockists.map((d) => (
                          <StockistBranch
                            key={d.id}
                            node={d}
                            parentName={cf.name}
                            indent={48}
                            open={open}
                            toggle={toggle}
                            t={t}
                          />
                        ))}
                        <AddControl
                          action={addStockist.bind(null, cf.id)}
                          label="Add stockist"
                          parentName={cf.name}
                          placeholder={t("Name")}
                          indent={48}
                          kinds={[
                            { value: "depot", label: "Depot", hint: "C&F-managed stock" },
                            { value: "dealer", label: "Dealer", hint: "Third-party stock" },
                          ]}
                        />
                      </>
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One stockist row and everything under it.
 *
 * Renders a depot, a dealer, or a sub-dealer — they are the same shape, so
 * this is one component rather than three. A dealer additionally lists its
 * sub-dealers and offers an "add" for them; a sub-dealer never does, which is
 * what holds the tier to exactly one level.
 */
function StockistBranch({
  node,
  parentName,
  indent,
  open,
  toggle,
  t,
}: {
  node: StockistNode;
  parentName: string;
  indent: number;
  open: Set<string>;
  toggle: (key: string) => void;
  t: (key: string) => string;
}) {
  const key = `d:${node.id}`;
  const isOpen = open.has(key);
  const badge = KIND_STYLE[node.kind];

  return (
    <div>
      <Row
        indent={indent}
        onToggle={() => toggle(key)}
        chevron={isOpen}
        action={
          <ConfirmDelete
            action={deleteStockist.bind(null, node.id)}
            itemLabel={t(badge.label).toLowerCase()}
            itemName={node.name}
            loadImpact={() => getDeleteImpact("depot", node.id)}
            warning={
              node.subDealers.length > 0
                ? t("Its sub-dealers and everything under them go too.")
                : undefined
            }
          />
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={nameCls} style={nameStyle}>{node.name}</span>
          <span
            className="chip"
            style={{ background: badge.bg, color: badge.color, borderColor: "transparent" }}
          >
            {t(badge.label)}
          </span>
        </div>
        <div className={subCls} style={subStyle}>
          {t("Reports to")} {parentName} · {node.counters} {t("counters")} · {node.reps} {t("reps")}
          {node.kind === "dealer" && node.subDealers.length > 0 && (
            <> · {node.subDealers.length} {t(node.subDealers.length === 1 ? "sub-dealer" : "sub-dealers")}</>
          )}
        </div>
      </Row>

      {isOpen && (
        <>
          {node.areas.map((a) => (
            <div key={a.id} className="card mb-1.5 p-3.5" style={{ marginLeft: indent + 24 }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-semibold" style={nameStyle}>{a.name}</div>
                  <div className={subCls} style={subStyle}>
                    {t("Reports to")} {node.name} · {a.counters} {t("counters")}
                  </div>
                </div>
                <ConfirmDelete
                  action={deleteArea.bind(null, a.id)}
                  itemLabel="area"
                  itemName={a.name}
                  loadImpact={() => getDeleteImpact("area", a.id)}
                />
              </div>
            </div>
          ))}
          <AddControl
            action={addArea.bind(null, node.id)}
            label="Add area"
            parentName={node.name}
            placeholder={t("Area name")}
            indent={indent + 24}
          />

          {/* Exactly one optional tier: only a dealer nests, and what it nests
              never nests again. */}
          {node.kind === "dealer" && (
            <>
              {node.subDealers.map((sd) => (
                <StockistBranch
                  key={sd.id}
                  node={sd}
                  parentName={node.name}
                  indent={indent + 24}
                  open={open}
                  toggle={toggle}
                  t={t}
                />
              ))}
              <AddControl
                action={addStockist.bind(null, node.cnfId)}
                label="Add sub-dealer"
                parentName={node.name}
                placeholder={t("Sub-dealer name")}
                indent={indent + 24}
                hidden={{ kind: "sub_dealer", parentId: node.id }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Row({
  indent,
  chevron,
  onToggle,
  action,
  children,
}: {
  indent: number;
  chevron: boolean;
  onToggle: () => void;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card card-hover mb-2 p-4" style={{ marginLeft: indent }}>
      <div className="flex items-center justify-between">
        <div className="flex cursor-pointer items-center gap-2" onClick={onToggle}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink-2)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-none transition-transform"
            style={{ transform: `rotate(${chevron ? 90 : 0}deg)` }}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
          <div>{children}</div>
        </div>
        {action}
      </div>
    </div>
  );
}

/**
 * Collapsed "add" control: a quiet button that opens a small labelled form.
 *
 * Replaces a row of always-visible bare inputs. With four of them stacked at
 * different indents and nothing but a placeholder to go on, it was genuinely
 * unclear which parent each one attached to — the "New area" box under an area
 * card looked like it belonged to that area rather than to the stockist above
 * it. Naming the parent in the form removes the guesswork, and keeping them
 * shut until needed leaves the tree readable.
 */
function AddControl({
  action,
  label,
  parentName,
  placeholder,
  indent,
  hidden,
  kinds,
}: {
  action: (formData: FormData) => Promise<HierarchyResult>;
  /** Button text, e.g. "Add area". */
  label: string;
  /** What it will be added to — shown so the target is never in doubt. */
  parentName: string;
  placeholder: string;
  indent: number;
  /** Extra fields the action needs, e.g. `parentId` for a sub-dealer. */
  hidden?: Record<string, string>;
  /** When set, the form asks which kind first and posts it as `kind`. */
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
      <div className="mb-2.5" style={{ marginLeft: indent + 24 }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-[12px] font-semibold transition-colors"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-3)", background: "transparent" }}
        >
          <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>+</span>
          {t(label)}
        </button>
      </div>
    );
  }

  return (
    <div
      className="mb-2.5 rounded-xl border p-3"
      style={{ marginLeft: indent + 24, borderColor: "var(--accent)", background: "var(--bg-soft)", maxWidth: 360 }}
    >
      <div className="mb-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
        {t(label)} {t("under")} <strong style={{ color: "var(--ink-1)" }}>{parentName}</strong>
      </div>

      <form action={formAction} key={state?.ok ? "done" : "editing"} className="flex flex-col gap-2">
        {hidden &&
          Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} readOnly />)}

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
                    title={t(k.hint)}
                    className="chip"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--hairline)",
                      background: active ? "var(--accent)" : "var(--surface)",
                      color: active ? "#fff" : "var(--ink-1)",
                      padding: "5px 11px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {t(k.label)}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
              {t(kinds.find((k) => k.value === kind)?.hint ?? "")}
            </p>
          </>
        )}

        <input
          className="inp"
          type="text"
          name="name"
          placeholder={placeholder}
          required
          autoFocus
          style={{ padding: "7px 10px", fontSize: 12.5 }}
          disabled={pending}
        />

        <div className="flex items-center gap-2">
          <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
            {pending ? t("Adding…") : t("Add")}
          </button>
          <button type="button" className="link" onClick={() => setOpen(false)} disabled={pending}>
            {t("Cancel")}
          </button>
        </div>
      </form>

      {state && !state.ok && (
        <p className="mt-1.5 text-[11.5px] font-medium" style={{ color: "var(--danger)" }}>
          {state.error}
        </p>
      )}
    </div>
  );
}
