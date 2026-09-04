"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A search box that searches as you type.
 *
 * Every list on the site paginates and filters in SQL, so a keystroke is a
 * round-trip — which is exactly why it needs debouncing rather than an
 * onChange push. The value is applied `delay` ms after typing stops, so a
 * ten-character query costs one query instead of ten.
 *
 * The box owns its text; the URL only seeds it. Re-syncing on every render
 * would let a slow response overwrite characters typed while it was in flight,
 * so `initial` is adopted only when it changes to something this box did not
 * push — an external clear, or the back button. `pushed` is what tells those
 * apart, and also stops the timer re-sending a value the URL already carries.
 */
export function SearchInput({
  param,
  initial,
  placeholder,
  resetParam,
  delay = 350,
  className = "inp",
  style,
  "aria-label": ariaLabel,
}: {
  /** Query-string key to write. */
  param: string;
  /** Server's current value for `param`. */
  initial: string;
  placeholder: string;
  /** Cleared alongside the search — pagination, in practice, since page 7 of
   * the old result is meaningless in the new one. */
  resetParam?: string;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [value, setValue] = useState(initial);
  /** The last value this box put in the URL. State, not a ref: it is read
   * during render to decide whether an incoming `initial` is our own echo. */
  const [pushed, setPushed] = useState(initial.trim());
  const [seen, setSeen] = useState(initial);

  // Adjusting state during render rather than in an effect, so an external
  // clear lands in the same commit as the prop that caused it instead of
  // painting one frame of stale text.
  if (initial !== seen) {
    setSeen(initial);
    if (initial.trim() !== pushed) {
      setPushed(initial.trim());
      setValue(initial);
    }
  }

  function commit(next: string) {
    if (next === pushed) return;
    setPushed(next);
    startTransition(() => {
      const q = new URLSearchParams(params.toString());
      if (next) q.set(param, next);
      else q.delete(param);
      if (resetParam) q.delete(resetParam);
      const query = q.toString();
      // scroll:false — searching a list halfway down a page should not throw
      // the reader back to the top of it.
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  // The timer fires long after the render that scheduled it, so it reaches
  // `commit` through a ref. Written in an effect, never during render: a ref
  // write during render is a compiler error, and would also mean a discarded
  // render could leave the wrong closure behind.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  useEffect(() => {
    const next = value.trim();
    if (next === pushed) return;
    const id = setTimeout(() => commitRef.current(next), delay);
    // Cleared on the next keystroke, which is what makes this a debounce
    // rather than one request per character.
    return () => clearTimeout(id);
  }, [value, pushed, delay]);

  return (
    <span className="relative inline-flex items-center">
      <input
        className={className}
        style={style}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Enter skips the wait rather than doing nothing, which is what a
          // hand that learned the old Search button will expect.
          if (e.key === "Enter") {
            e.preventDefault();
            commit(value.trim());
          }
        }}
      />
      {/* Inside the field, so the row's layout doesn't shift as it appears and
          disappears between keystrokes. */}
      {pending && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2.5 h-3 w-3 rounded-full border-2"
          style={{
            borderColor: "var(--ink-3)",
            borderTopColor: "transparent",
            animation: "spin .6s linear infinite",
          }}
        />
      )}
    </span>
  );
}
