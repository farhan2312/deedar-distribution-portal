/**
 * Messages for the one-visit-per-counter-per-day rule.
 *
 * In their own module, with no DB import, so the visit FORM can import them
 * too — `visit-day.ts` pulls in `@/db`, which is `server-only` and would break
 * the client bundle. The server action returns these strings; the form looks
 * the same string up in the dictionary to render it in the current language.
 */

/** Blocked because the rep already logged this counter today — theirs to fix,
 * so the caller offers an edit link. Also a dictionary key. */
export const ALREADY_VISITED_TODAY =
  "You've already visited this counter today. Edit that visit instead of adding a new one.";

/**
 * Blocked because a DIFFERENT rep got there first.
 *
 * A template rather than a finished sentence: `t()` takes a key and returns a
 * translation, with no interpolation, so a name spliced in on the server could
 * never be looked up. The form translates this key and substitutes afterwards,
 * which also lets Hindi put the name where its grammar wants it.
 */
export const VISITED_BY_OTHER =
  "{name} already visited this counter today. A counter is visited once a day.";

/** The finished English sentence — what the server action returns, and what a
 * caller with no dictionary (a log, an API consumer) reads. */
export function visitedByOther(name: string): string {
  return fillName(VISITED_BY_OTHER, name);
}

/** Substitute the rep's name into a translated template. */
export function fillName(template: string, name: string): string {
  return template.replace("{name}", name);
}
