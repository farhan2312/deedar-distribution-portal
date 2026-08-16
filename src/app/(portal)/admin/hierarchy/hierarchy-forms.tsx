"use client";

import { useActionState } from "react";
import { addCnf, addState, type HierarchyResult } from "@/lib/admin/actions";
import { useT } from "@/lib/i18n/provider";
import { FormResult } from "@/components/ui/form-result";

export function AddStateForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState<HierarchyResult | null, FormData>(
    async (_prev, fd) => addState(fd),
    null,
  );
  return (
    <>
      <form action={formAction} key={state?.ok ? "done" : "editing"}>
        <div className="field mb-3">
          <label>{t("State name")}</label>
          <input className="inp" type="text" name="name" placeholder={t("e.g. Madhya Pradesh")} required disabled={pending} />
        </div>
        <div className="field mb-3.5">
          <label>{t("Country")}</label>
          <input className="inp" type="text" name="country" defaultValue={t("India")} disabled={pending} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? t("Adding…") : t("Add state")}
        </button>
      </form>
      <FormResult state={state} successText={t("State added.")} />
    </>
  );
}

export function AddCnfForm({ states }: { states: { id: string; name: string }[] }) {
  const t = useT();
  // `addCnf` takes the state id separately, so read it from the form here rather
  // than wrapping the action on the server.
  const [state, formAction, pending] = useActionState<HierarchyResult | null, FormData>(
    async (_prev, fd) => addCnf(String(fd.get("stateId") ?? ""), fd),
    null,
  );
  return (
    <>
      <form action={formAction} key={state?.ok ? "done" : "editing"}>
        <div className="field mb-3">
          <label>{t("State")}</label>
          <select className="inp" name="stateId" defaultValue={states[0]?.id} disabled={pending}>
            {states.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field mb-3.5">
          <label>{t("C&F HQ name")}</label>
          <input className="inp" type="text" name="name" placeholder={t("e.g. BHOPAL CNF HQ")} required disabled={pending} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? t("Adding…") : t("Add C&F HQ")}
        </button>
      </form>
      <FormResult state={state} successText={t("C&F HQ added.")} />
    </>
  );
}
