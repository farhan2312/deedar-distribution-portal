import { requireIsr, toMobileUser } from "@/lib/mobile/auth";

/** The signed-in ISR's profile. The app calls this on launch to check its
 * stored token is still good (not expired, account not deactivated). */
export async function GET() {
  const auth = await requireIsr();
  if (!auth.ok) return auth.response;
  return Response.json({ user: toMobileUser(auth.user) });
}
