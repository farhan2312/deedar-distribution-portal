// Plain constants shared by the report dialog and the server action.
// These CANNOT live in actions.ts: every export of a "use server" module must
// be an async function, and a stray const there silently strips the module's
// exports (the build fails with "module has no exports at all").

/** Screenshots are stored inline as data URLs, so keep them small. ~1.5MB of
 * base64 ≈ a 1.1MB image, which is plenty for a screen grab. A blob store is
 * the right answer if this ever needs to hold many large attachments. */
export const MAX_SCREENSHOT_CHARS = 1_500_000;
