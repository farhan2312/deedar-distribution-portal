import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { LogoutButton } from "./logout-button";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#faf6ef] p-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl shadow-black/5">
        <p className="text-xs font-semibold tracking-widest text-emerald-700">
          SIGNED IN
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[#0d3b2e]">{user.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {user.phone} · {user.role}
        </p>
        <LogoutButton />
      </div>
    </div>
  );
}
