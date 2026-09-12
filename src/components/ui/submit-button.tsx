"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that goes inert the moment it is pressed.
 *
 * `useFormStatus` reads the pending state of the form this button sits inside,
 * which is why it has to be its own component rather than a prop on the form:
 * the hook only sees a form from within.
 *
 * It exists because a plain submit button lets an impatient tap fire the action
 * two, six, twenty times. For a logout that meant a burst of identical POSTs a
 * second apart, one of which signed the person out and the rest of which
 * arrived with the cookie already gone. The server ignores those repeats, but
 * the button should not have sent them in the first place.
 */
export function SubmitButton({
  className,
  style,
  children,
  pendingLabel,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  /** Shown instead of `children` while the action is in flight. */
  pendingLabel?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={className}
      // Dimmed rather than restyled: the button keeps its place and its
      // colour, so a slow network reads as "working", not as a dead control.
      style={pending ? { ...style, opacity: 0.55, cursor: "default" } : style}
    >
      {pending && pendingLabel !== undefined ? pendingLabel : children}
    </button>
  );
}
