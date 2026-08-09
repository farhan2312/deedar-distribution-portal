type ServerAction = () => Promise<void>;

/** Small "×" submit button bound to a server action — no client JS needed. */
export function DeleteButton({
  action,
  label,
  size = "md",
}: {
  action: ServerAction;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <form action={action}>
      <button
        type="submit"
        aria-label={`Delete ${label}`}
        className={
          size === "sm"
            ? "text-zinc-400 hover:text-red-600"
            : "rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-red-50 hover:text-red-600"
        }
      >
        {size === "sm" ? "×" : "Delete"}
      </button>
    </form>
  );
}

/** Pill-style toggle button (checkbox UX, no checkbox element) bound to a server action. */
export function ToggleChip({
  action,
  label,
  active,
  color,
  bg,
}: {
  action: ServerAction;
  label: string;
  active: boolean;
  color: string;
  bg: string;
}) {
  return (
    <form action={action}>
      <button
        type="submit"
        className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
        style={{
          background: active ? bg : "transparent",
          borderColor: active ? color : "#e5e7eb",
          color: active ? color : "#6b7280",
        }}
      >
        {label}
      </button>
    </form>
  );
}

/** Inline "name + submit" form for adding a child node under a parent. */
export function AddInlineForm({
  action,
  placeholder,
  buttonLabel = "Add",
}: {
  action: (formData: FormData) => Promise<void>;
  placeholder: string;
  buttonLabel?: string;
}) {
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input
        type="text"
        name="name"
        placeholder={placeholder}
        required
        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs outline-none focus:border-[#0d3b2e]"
      />
      <button
        type="submit"
        className="rounded-md bg-[#0d3b2e] px-2.5 py-1 text-xs font-semibold text-white"
      >
        {buttonLabel}
      </button>
    </form>
  );
}

/** Select + Save form for a single-value scope field (e.g. depot, C&F HQ). */
export function SaveSelectForm({
  action,
  fieldName,
  value,
  options,
  placeholder,
}: {
  action: (formData: FormData) => Promise<void>;
  fieldName: string;
  value: string | null;
  options: { id: string; name: string }[];
  placeholder: string;
}) {
  return (
    <form action={action} className="flex items-center gap-1.5">
      <select
        name={fieldName}
        defaultValue={value ?? ""}
        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs outline-none focus:border-[#0d3b2e]"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <button type="submit" className="text-xs font-semibold text-emerald-700">
        Save
      </button>
    </form>
  );
}
