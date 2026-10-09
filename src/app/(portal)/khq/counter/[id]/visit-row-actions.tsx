"use client";

import { EditVisitButton } from "../../_components/admin-forms";
import { useRouter } from "next/navigation";
import { deleteVisit } from "@/lib/field/visit-actions";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { useT } from "@/lib/i18n/provider";

/**
 * Edit / Delete for one row of the visit history. Central Admin only — the
 * page decides that; this component just renders the pair.
 *
 * A client component because the delete needs a confirmation dialog and a
 * refresh: the row has to leave the table, and the tiles above it (packets
 * sold, visit count, last visit) all move when it does.
 */
export function VisitRowActions({
  counterId,
  visitId,
  /** Quoted back in the confirmation, so the admin can see which of several
   * same-day rows they are about to remove. */
  visitLabel,
}: {
  counterId: string;
  visitId: string;
  visitLabel: string;
}) {
  const router = useRouter();
  const t = useT();

  return (
    <span className="flex items-center justify-end gap-3 whitespace-nowrap">
      {/* A pop-up over this page, not the ISR's own edit screen. */}
      <EditVisitButton counterId={counterId} visitId={visitId} visitLabel={visitLabel} />
      <ConfirmDelete
        action={() => deleteVisit(visitId)}
        itemLabel={t("visit")}
        itemName={visitLabel}
        warning={t("The visit's packets and stock leave every total that counts them. This can't be undone.")}
        onDeleted={() => router.refresh()}
      />
    </span>
  );
}
