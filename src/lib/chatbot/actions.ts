"use server";

import { getCurrentUser } from "@/lib/auth/dal";
import { canAccess } from "@/lib/auth/access";
import { getT } from "@/lib/i18n/server";
import { findIntent, type AskResult } from "./catalog";
import { runIntent, type AnswerUser } from "./answers";

/**
 * Answer one predefined question.
 *
 * A server action is a public POST endpoint, so the role filter the menu
 * applies on the client is UX only — the real gate is here. Three checks, in
 * order: signed in, the id is a real intent, and the caller holds one of that
 * intent's roles.
 */
export async function askIntent(id: string): Promise<AskResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };

  const intent = findIntent(id);
  if (!intent) return { ok: false, error: "Unknown question." };

  // `canAccess` lets admin through every role, matching the sidebar and every
  // other gate in the app.
  const allowed = intent.roles.some((role) => canAccess(user, role));
  if (!allowed) return { ok: false, error: "You don't have access to that question." };

  const t = await getT();
  try {
    // `getCurrentUser()`'s shape structurally satisfies AnswerUser (which
    // extends the supervisor ScopeUser), so it passes straight through.
    const answer = await runIntent(id, user satisfies AnswerUser, t);
    if (!answer) return { ok: false, error: "Unknown question." };
    return { ok: true, answer };
  } catch {
    // A failed query shouldn't surface a stack trace in a chat bubble.
    return { ok: false, error: t("Couldn't fetch that right now. Please try again.") };
  }
}
