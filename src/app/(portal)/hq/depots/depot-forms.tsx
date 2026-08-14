"use client";

import { useActionState } from "react";
import { addArea, addDepot } from "@/lib/hq/actions";
import type { WriteResult } from "@/lib/db-errors";
import { FormResult } from "@/components/ui/form-result";

/**
 * Client wrappers for the two "add" forms on the C&F Depots & Areas page.
 * They exist so the result of the server action can be shown inline: as plain
 * server-rendered <form action={…}> elements, a duplicate name silently did
 * nothing and the admin got no feedback at all.
 */
export function AddDepotForm({ cnfId }: { cnfId: string }) {
  const [state, formAction, pending] = useActionState<WriteResult | null, FormData>(
    async (_prev, fd) => addDepot(cnfId, fd),
    null,
  );
  return (
    <>
      {/* Remount on success so the field clears; keep the text on failure so a
          rejected name can be corrected rather than retyped. */}
      <form action={formAction} key={state?.ok ? "done" : "editing"}>
        <div className="field mb-3.5">
          <label>Depot name</label>
          <input
            className="inp"
            type="text"
            name="name"
            placeholder="e.g. Ramganj Mandi Depot"
            required
            disabled={pending}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add depot"}
        </button>
      </form>
      <FormResult state={state} successText="Depot added." />
    </>
  );
}

export function AddAreaForm({
  cnfId,
  depots,
}: {
  cnfId: string;
  depots: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<WriteResult | null, FormData>(
    async (_prev, fd) => addArea(cnfId, fd),
    null,
  );
  return (
    <>
      <form action={formAction} key={state?.ok ? "done" : "editing"}>
        <div className="field mb-3">
          <label>Depot</label>
          <select className="inp" name="depotId" defaultValue={depots[0]?.id} disabled={pending}>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field mb-3.5">
          <label>Area name</label>
          <input
            className="inp"
            type="text"
            name="name"
            placeholder="e.g. Ramganj Town"
            required
            disabled={pending}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add area"}
        </button>
      </form>
      <FormResult state={state} successText="Area added." />
    </>
  );
}
