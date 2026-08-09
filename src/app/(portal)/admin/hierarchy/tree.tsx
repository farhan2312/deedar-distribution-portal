"use client";

import { useState } from "react";
import { addArea, addDepot, deleteArea, deleteCnf, deleteDepot, deleteState } from "@/lib/admin/actions";

export type AreaNode = { id: string; name: string; counters: number };
export type DepotNode = { id: string; name: string; counters: number; reps: number; areas: AreaNode[] };
export type CnfNode = { id: string; name: string; depots: DepotNode[] };
export type StateNode = { id: string; name: string; country: string; cnfs: CnfNode[] };

const nameCls = "text-[15px] font-semibold";
const nameStyle: React.CSSProperties = { fontFamily: "var(--font-display)", color: "var(--ink-1)" };
const subCls = "mt-0.5 text-[12px]";
const subStyle: React.CSSProperties = { color: "var(--ink-3)" };

export function HierarchyTree({ tree }: { tree: StateNode[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (tree.length === 0) {
    return <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>No states yet — add one above.</p>;
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
              action={<DeleteLink action={deleteState.bind(null, st.id)} />}
            >
              <div className={nameCls} style={nameStyle}>{st.name}</div>
              <div className={subCls} style={subStyle}>
                {st.country} · {st.cnfs.length} C&amp;F HQ{st.cnfs.length === 1 ? "" : "s"}
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
                      action={<DeleteLink action={deleteCnf.bind(null, cf.id)} />}
                    >
                      <div className={nameCls} style={nameStyle}>{cf.name}</div>
                      <div className={subCls} style={subStyle}>One per state · {cf.depots.length} depots</div>
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
                                action={<DeleteLink action={deleteDepot.bind(null, d.id)} />}
                              >
                                <div className={nameCls} style={nameStyle}>{d.name}</div>
                                <div className={subCls} style={subStyle}>
                                  Reports to {cf.name} · {d.counters} counters · {d.reps} reps
                                </div>
                              </Row>

                              {dOpen && (
                                <>
                                  {d.areas.map((a) => (
                                    <div key={a.id} className="card mb-1.5 p-3.5" style={{ marginLeft: 72 }}>
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <div className="text-[14px] font-semibold" style={nameStyle}>{a.name}</div>
                                          <div className={subCls} style={subStyle}>Reports to {d.name} · {a.counters} counters</div>
                                        </div>
                                        <DeleteLink action={deleteArea.bind(null, a.id)} />
                                      </div>
                                    </div>
                                  ))}
                                  <InlineAdd action={addArea.bind(null, d.id)} placeholder="New area" indent={72} />
                                </>
                              )}
                            </div>
                          );
                        })}
                        <InlineAdd action={addDepot.bind(null, cf.id)} placeholder="New depot" indent={48} />
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

function DeleteLink({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button className="link link-danger" type="submit">
        Delete
      </button>
    </form>
  );
}

function InlineAdd({
  action,
  placeholder,
  indent,
}: {
  action: (formData: FormData) => Promise<void>;
  placeholder: string;
  indent: number;
}) {
  return (
    <form action={action} className="mb-2.5 flex gap-1.5" style={{ marginLeft: indent + 24 }}>
      <input
        className="inp"
        type="text"
        name="name"
        placeholder={placeholder}
        required
        style={{ maxWidth: 200, padding: "6px 10px", fontSize: 12 }}
      />
      <button className="btn btn-primary btn-sm" type="submit">Add</button>
    </form>
  );
}
