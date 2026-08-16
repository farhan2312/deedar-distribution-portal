"use client";

import { useActionState, useState } from "react";
import {
  addArea,
  addDepot,
  deleteArea,
  deleteCnf,
  deleteDepot,
  deleteState,
  getDeleteImpact,
  type HierarchyResult,
} from "@/lib/admin/actions";
import { useT } from "@/lib/i18n/provider";
import { ConfirmDelete } from "@/components/ui/confirm-delete";

export type AreaNode = { id: string; name: string; counters: number };
export type DepotNode = { id: string; name: string; counters: number; reps: number; areas: AreaNode[] };
export type CnfNode = { id: string; name: string; depots: DepotNode[] };
export type StateNode = { id: string; name: string; country: string; cnfs: CnfNode[] };

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
                      <div className={subCls} style={subStyle}>{t("One per state ·")} {cf.depots.length} {t("depots")}</div>
                    </Row>

                    {cOpen && (
                      <>
                        {cf.depots.map((d) => {
                          const dKey = `d:${d.id}`;
                          const dOpen = open.has(dKey);
                          return (
                            <div key={d.id}>
                              <Row
                                indent={48}
                                onToggle={() => toggle(dKey)}
                                chevron={dOpen}
                                action={<ConfirmDelete action={deleteDepot.bind(null, d.id)} itemLabel="depot" itemName={d.name} loadImpact={() => getDeleteImpact("depot", d.id)} />}
                              >
                                <div className={nameCls} style={nameStyle}>{d.name}</div>
                                <div className={subCls} style={subStyle}>
                                  {t("Reports to")} {cf.name} · {d.counters} {t("counters")} · {d.reps} {t("reps")}
                                </div>
                              </Row>

                              {dOpen && (
                                <>
                                  {d.areas.map((a) => (
                                    <div key={a.id} className="card mb-1.5 p-3.5" style={{ marginLeft: 72 }}>
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <div className="text-[14px] font-semibold" style={nameStyle}>{a.name}</div>
                                          <div className={subCls} style={subStyle}>{t("Reports to")} {d.name} · {a.counters} {t("counters")}</div>
                                        </div>
                                        <ConfirmDelete action={deleteArea.bind(null, a.id)} itemLabel="area" itemName={a.name} loadImpact={() => getDeleteImpact("area", a.id)} />
                                      </div>
                                    </div>
                                  ))}
                                  <InlineAdd action={addArea.bind(null, d.id)} placeholder={t("New area")} indent={72} />
                                </>
                              )}
                            </div>
                          );
                        })}
                        <InlineAdd action={addDepot.bind(null, cf.id)} placeholder={t("New depot")} indent={48} />
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

function InlineAdd({
  action,
  placeholder,
  indent,
}: {
  action: (formData: FormData) => Promise<HierarchyResult>;
  placeholder: string;
  indent: number;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState<HierarchyResult | null, FormData>(
    async (_prev, fd) => action(fd),
    null,
  );
  return (
    <div className="mb-2.5" style={{ marginLeft: indent + 24 }}>
      {/* Remount on success so the input clears; keep the text on failure so a
          rejected name can be edited rather than retyped. */}
      <form action={formAction} className="flex gap-1.5" key={state?.ok ? "done" : "editing"}>
        <input
          className="inp"
          type="text"
          name="name"
          placeholder={placeholder}
          required
          style={{ maxWidth: 200, padding: "6px 10px", fontSize: 12 }}
          disabled={pending}
        />
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
          {pending ? t("Adding…") : t("Add")}
        </button>
      </form>
      {state && !state.ok && (
        <p className="mt-1 text-[11.5px] font-medium" style={{ color: "var(--danger)" }}>
          {state.error}
        </p>
      )}
    </div>
  );
}
