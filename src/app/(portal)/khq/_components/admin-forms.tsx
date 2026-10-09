"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  loadEditCounterForm,
  loadEditVisitForm,
  loadNewCounterForm,
  loadNewVisitForm,
} from "@/lib/admin/khq-forms";
import { useT } from "@/lib/i18n/provider";
import { Modal } from "@/components/ui/modal";
import { NewCounterWizard } from "@/app/(portal)/field/new-counter/wizard";
import { VisitForm } from "@/app/(portal)/field/counter/[id]/visit/visit-form";
import { EditCounterForm } from "@/app/(portal)/field/counter/[id]/edit/edit-form";

/**
 * Central Admin's add-and-correct forms on the Kanpur HQ pages, as pop-ups.
 *
 * These used to navigate to the ISR's own screens under /field, which put an
 * admin working through Reports inside the field app and made them find their
 * way back. Now each opens over the page it was launched from and closes back
 * onto it, with the page refreshed underneath.
 *
 * The forms are the same components the ISR screens use, so the rules and the
 * server checks are shared rather than copied — they are only told they are in
 * a pop-up. A form's data is fetched when it opens, not with the page.
 */

type Lazy<T> =
  | { status: "closed" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "failed" };

/** Open a dialog and fetch what its form needs. A later open (or a close)
 * makes an earlier, slower answer irrelevant. */
function useLazyForm<T>(load: () => Promise<T | null>) {
  const [state, setState] = useState<Lazy<T>>({ status: "closed" });
  const latest = useRef(0);

  function open() {
    const request = ++latest.current;
    setState({ status: "loading" });
    load()
      .then((data) => {
        if (latest.current === request) setState(data ? { status: "ready", data } : { status: "failed" });
      })
      .catch(() => {
        if (latest.current === request) setState({ status: "failed" });
      });
  }
  function close() {
    latest.current++;
    setState({ status: "closed" });
  }
  return { state, open, close };
}

/** Loading and failure, the same in every dialog. */
function Body<T>({ state, retry, children }: { state: Lazy<T>; retry: () => void; children: (data: T) => ReactNode }) {
  const t = useT();
  if (state.status === "ready") return <>{children(state.data)}</>;
  if (state.status === "failed") {
    return (
      <div className="py-6 text-center">
        <p className="mb-3 text-[13px]" style={{ color: "var(--danger)" }}>
          {t("Couldn't load this form.")}
        </p>
        <button type="button" className="btn btn-secondary" onClick={retry}>
          {t("Try again")}
        </button>
      </div>
    );
  }
  return (
    <p className="py-10 text-center text-[13px]" style={{ color: "var(--ink-3)" }}>
      {t("Loading…")}
    </p>
  );
}

/** Reports: add a counter for a rep. Stays on Reports; offers the new
 * counter's page once it exists, where its first visit can go in. */
export function AddCounterButton() {
  const t = useT();
  const router = useRouter();
  const form = useLazyForm(loadNewCounterForm);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);

  function close() {
    setCreated(null);
    form.close();
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={form.open}>
        {t("+ Add counter")}
      </button>
      {form.state.status !== "closed" && (
        <Modal title={created ? t("Counter added") : t("Add New Counter")} onClose={close}>
          {created ? (
            <div className="py-4 text-center">
              <div
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-[22px]"
                style={{ background: "rgba(30,158,90,.12)", color: "var(--success)" }}
              >
                ✓
              </div>
              <p className="mb-5 text-[14px]" style={{ color: "var(--ink-1)" }}>
                <strong>{created.name}</strong> {t("is now in the list.")}
              </p>
              <div className="flex gap-3">
                <button type="button" className="btn btn-secondary flex-1 justify-center py-3" onClick={close}>
                  {t("Done")}
                </button>
                <Link className="btn btn-primary flex-1 justify-center py-3" href={`/khq/counter/${created.id}`}>
                  {t("Open counter")}
                </Link>
              </div>
            </div>
          ) : (
            <Body state={form.state} retry={form.open}>
              {(data) => (
                <NewCounterWizard
                  mode="open"
                  cnfs={data.cnfs}
                  stockists={data.stockists}
                  admin={data.admin}
                  embedded
                  onCreated={(id, name) => {
                    setCreated({ id, name });
                    router.refresh();
                  }}
                />
              )}
            </Body>
          )}
        </Modal>
      )}
    </>
  );
}

/** Counter page: add a visit for a rep. */
export function AddVisitButton({ counterId, counterName }: { counterId: string; counterName: string }) {
  const t = useT();
  const router = useRouter();
  const form = useLazyForm(() => loadNewVisitForm(counterId));

  return (
    <>
      <button type="button" className="btn btn-primary flex-none" onClick={form.open}>
        {t("+ Add visit")}
      </button>
      {form.state.status !== "closed" && (
        <Modal title={t("Add visit")} eyebrow={counterName} onClose={form.close}>
          <Body state={form.state} retry={form.open}>
            {(data) => (
              <VisitForm
                counterId={data.counter.id}
                counterName={data.counter.name}
                counterArea={data.counter.area}
                admin={data.admin}
                embedded
                onCancel={form.close}
                onSaved={() => {
                  form.close();
                  router.refresh();
                }}
              />
            )}
          </Body>
        </Modal>
      )}
    </>
  );
}

/** Counter page: correct the counter's own details. */
export function EditCounterButton({ counterId, counterName }: { counterId: string; counterName: string }) {
  const t = useT();
  const router = useRouter();
  const form = useLazyForm(() => loadEditCounterForm(counterId));

  return (
    <>
      <button type="button" className="btn btn-secondary flex-none" onClick={form.open}>
        {t("Edit details")}
      </button>
      {form.state.status !== "closed" && (
        <Modal title={t("Edit counter")} eyebrow={counterName} onClose={form.close}>
          <Body state={form.state} retry={form.open}>
            {(data) => (
              <EditCounterForm
                counterId={data.counterId}
                areaOptions={data.areaOptions}
                initial={data.initial}
                admin
                embedded
                onCancel={form.close}
                onSaved={() => {
                  form.close();
                  router.refresh();
                }}
              />
            )}
          </Body>
        </Modal>
      )}
    </>
  );
}

/** A visit-history row: correct one logged visit. */
export function EditVisitButton({
  counterId,
  visitId,
  visitLabel,
}: {
  counterId: string;
  visitId: string;
  /** Shown above the form, so it's clear which of several rows is open. */
  visitLabel: string;
}) {
  const t = useT();
  const router = useRouter();
  const form = useLazyForm(() => loadEditVisitForm(counterId, visitId));

  return (
    <>
      <button type="button" className="link" onClick={form.open}>
        {t("Edit")}
      </button>
      {form.state.status !== "closed" && (
        <Modal title={t("Edit visit")} eyebrow={visitLabel} onClose={form.close}>
          <Body state={form.state} retry={form.open}>
            {(data) => (
              <VisitForm
                counterId={data.counter.id}
                counterName={data.counter.name}
                counterArea={data.counter.area}
                visitId={visitId}
                initial={data.initial}
                embedded
                onCancel={form.close}
                onSaved={() => {
                  form.close();
                  router.refresh();
                }}
              />
            )}
          </Body>
        </Modal>
      )}
    </>
  );
}
