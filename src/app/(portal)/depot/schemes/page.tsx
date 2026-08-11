import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { depotScope, getDepotSchemesData, pickDepot, type SchemeClaimRow } from "@/lib/depot/data";
import { Notice } from "@/components/ui/notice";
import { DepotSelect } from "../_components/depot-select";

const STATUS_STYLE: Record<SchemeClaimRow["status"], { label: string; bg: string; color: string }> = {
  paid: { label: "Paid", bg: "rgba(30,158,90,.1)", color: "var(--success)" },
  processing: { label: "Processing", bg: "rgba(178,94,0,.1)", color: "var(--warning)" },
  rejected: { label: "Rejected", bg: "rgba(199,38,59,.1)", color: "var(--danger)" },
};

export default async function DepotSchemesPage({
  searchParams,
}: {
  searchParams: Promise<{ depot?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user, "dealer")) {
    return <Notice title="Schemes">You don&apos;t have Depot access.</Notice>;
  }

  const scope = await depotScope(user);
  if (scope.length === 0) {
    return <Notice title="Schemes">You aren&apos;t mapped to a depot yet — ask Central Admin.</Notice>;
  }
  const { depot: requested } = await searchParams;
  const depot = pickDepot(scope, requested)!;
  const { payoutToday, claims } = await getDepotSchemesData(depot.id);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
            Schemes — {depot.name}
          </h4>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
            Retailer scheme payouts, settled via UPI.
          </p>
        </div>
        {scope.length > 1 && <DepotSelect options={scope} value={depot.id} />}
      </div>

      <div className="card mb-6 p-5" style={{ maxWidth: 340 }}>
        <div className="eyebrow" style={{ fontSize: 11 }}>Scheme payouts today</div>
        <div className="mt-1 text-[28px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          ₹{payoutToday.toLocaleString("en-IN")}
        </div>
        <div className="mt-1 text-[13px]" style={{ color: "var(--ink-2)" }}>
          100% via UPI, zero cash through salesmen
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {["Retailer", "Code", "Value", "Status", "When"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {claims.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: "var(--ink-3)" }}>No scheme claims yet.</td>
              </tr>
            ) : (
              claims.map((c) => {
                const st = STATUS_STYLE[c.status];
                return (
                  <tr key={c.id}>
                    <td className="font-semibold">{c.retailer}</td>
                    <td>{c.code}</td>
                    <td>₹{c.value.toLocaleString("en-IN")}</td>
                    <td>
                      <span className="chip" style={{ background: st.bg, color: st.color, borderColor: "transparent" }}>
                        {st.label}
                      </span>
                    </td>
                    <td>{c.whenLabel}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
