/** The synthetic "everything in scope" selection for the stockist picker.
 *
 * In its own module because `data.ts` is `server-only` — the picker is a
 * client component and would break the build importing from there. */
export const ROLLUP_ID = "all";
