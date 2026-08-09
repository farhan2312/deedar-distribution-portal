export type CnfOption = { id: string; name: string };

/**
 * Regular hq users are locked to the one C&F on their user row. Central
 * Admin has full visibility, so they may pick any C&F via ?cnf=<id>,
 * falling back to their own assigned C&F (if any) then the first C&F.
 */
export function resolveSelectedCnf(
  allCnfs: CnfOption[],
  requestedId: string | undefined,
  userCnfId: string | null,
  isAdmin: boolean,
): CnfOption | null {
  if (allCnfs.length === 0) return null;

  if (!isAdmin) {
    return allCnfs.find((c) => c.id === userCnfId) ?? null;
  }

  if (requestedId) {
    const found = allCnfs.find((c) => c.id === requestedId);
    if (found) return found;
  }
  if (userCnfId) {
    const found = allCnfs.find((c) => c.id === userCnfId);
    if (found) return found;
  }
  return allCnfs[0];
}
