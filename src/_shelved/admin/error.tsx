"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-lg rounded-2xl bg-white p-6 shadow-sm">
      <h1 className="text-lg font-bold text-red-700">Couldn&apos;t complete that</h1>
      <p className="mt-2 text-sm text-zinc-600">
        {error.message || "Something went wrong."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-lg bg-[#0d3b2e] px-4 py-2 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
