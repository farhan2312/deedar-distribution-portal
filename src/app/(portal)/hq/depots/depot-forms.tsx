"use client";

import { useActionState, useState } from "react";
import { addArea, addStockist } from "@/lib/hq/actions";
import type { WriteResult } from "@/lib/db-errors";
import { useT } from "@/lib/i18n/provider";
import { FormResult } from "@/components/ui/form-result";

/**
 * Client wrappers for the two "add" forms on the C&F Depots & Areas page.
 * They exist so the result of the server action can be shown inline: as plain
 * server-rendered <form action={…}> elements, a duplicate name silently did
 * nothing and the admin got no feedback at all.
 */
/**
 * Add a depot, dealer or sub-dealer.
 *
 * The kind is picked first because it decides the rest of the form: only a
 * sub-dealer needs a parent, and it can only sit under a dealer — so the
 * parent select appears for that kind alone, listing dealers only.
 */
export function AddStockistForm({
  cnfId,
  dealers,
}: {
  cnfId: string;
  /** Dealers in this C&F — the only valid parents for a sub-dealer. */
  dealers: { id: string; name: string }[];
}) {
  const t = useT();
  const [kind, setKind] = useState<"depot" | "dealer" | "sub_dealer">("depot");
  const [state, formAction, pending] = useActionState<WriteResult | null, FormData>(
    async (_prev, fd) => addStockist(cnfId, fd),
    null,
  );

  const KINDS = [
    { value: "depot", label: "Depot", hint: "C&F-managed stock" },
    { value: "dealer", label: "Dealer", hint: "Third-party stock" },
    { value: "sub_dealer", label: "Sub-Dealer", hint: "Under a dealer" },
  ] as const;

  return (
    <>
      {/* Remount on success so the field clears; keep the text on failure so a
          rejected name can be corrected rather than retyped. */}
      <form action={formAction} key={state?.ok ? "done" : "editing"}>
        <input type="hidden" name="kind" value={kind} readOnly />

        <div className="field mb-3">
          <label>{t("Type")}</label>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => {
              const active = kind === k.value;
              const disabled = k.value === "sub_dealer" && dealers.length === 0;
              return (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  disabled={pending || disabled}
                  title={disabled ? t("Add a dealer first.") : t(k.hint)}
                  className="chip"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--hairline)",
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "#fff" : "var(--ink-1)",
                    padding: "6px 12px",
                    fontSize: 12.5,
                    opacity: disabled ? 0.45 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  {t(k.label)}
                </button>
              );
            })}
          </div>
        </div>

        {kind === "sub_dealer" && (
          <div className="field mb-3">
            <label>{t("Under dealer")}</label>
            <select className="inp" name="parentId" defaultValue={dealers[0]?.id} disabled={pending}>
              {dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field mb-3.5">
          <label>{t("Stockist name")}</label>
          <input
            className="inp"
            type="text"
            name="name"
            placeholder={t("e.g. Ramganj Mandi")}
            required
            disabled={pending}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? t("Adding…") : t("Add stockist")}
        </button>
      </form>
      <FormResult state={state} successText={t("Stockist added.")} />
    </>
  );
}

export function AddAreaForm({
  cnfId,
  stockists,
}: {
  cnfId: string;
  stockists: { id: string; name: string }[];
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState<WriteResult | null, FormData>(
    async (_prev, fd) => addArea(cnfId, fd),
    null,
  );
  return (
    <>
      <form action={formAction} key={state?.ok ? "done" : "editing"}>
        <div className="field mb-3">
          <label>{t("Stockist")}</label>
          <select className="inp" name="depotId" defaultValue={stockists[0]?.id} disabled={pending}>
            {stockists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field mb-3.5">
          <label>{t("Area name")}</label>
          <input
            className="inp"
            type="text"
            name="name"
            placeholder={t("e.g. Ramganj Town")}
            required
            disabled={pending}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? t("Adding…") : t("Add area")}
        </button>
      </form>
      <FormResult state={state} successText={t("Area added.")} />
    </>
  );
}
