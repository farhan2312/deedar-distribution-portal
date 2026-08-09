import { requireAdmin } from "@/lib/admin/guard";
import { SchemeCodes } from "./scheme-codes";

export default async function AdminSchemesPage() {
  await requireAdmin();
  return <SchemeCodes initialCount={128000} />;
}
