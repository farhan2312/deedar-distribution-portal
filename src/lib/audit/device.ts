/**
 * "Chrome / Windows" from a user agent.
 *
 * Best-effort by design: this is a hint for recognising your own session in the
 * list, not device forensics. It lives in its own client-safe module because
 * two places need to agree on the answer — the Device column, rendered per row
 * in the browser, and the device breakdown, which groups the same strings on
 * the server. Two copies of these regexes would eventually disagree, and the
 * chart would stop adding up to the table.
 */
export function deviceLabel(ua: string | null): string {
  if (!ua) return "—";
  const browser =
    /edg/i.test(ua) ? "Edge"
    : /chrome|crios/i.test(ua) ? "Chrome"
    : /firefox|fxios/i.test(ua) ? "Firefox"
    : /safari/i.test(ua) ? "Safari"
    : "Browser";
  const os =
    /windows/i.test(ua) ? "Windows"
    : /android/i.test(ua) ? "Android"
    : /iphone|ipad|ios/i.test(ua) ? "iOS"
    : /mac os/i.test(ua) ? "macOS"
    : /linux/i.test(ua) ? "Linux"
    : "";
  return os ? `${browser} / ${os}` : browser;
}
