"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="mt-6 w-full rounded-xl bg-[#0d3b2e] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#124a3a] disabled:opacity-60"
    >
      {loading ? "Logging out…" : "Log out"}
    </button>
  );
}
