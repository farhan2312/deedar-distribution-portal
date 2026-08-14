"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeOwnPassword } from "@/lib/auth/password-actions";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/password-policy";

export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    start(async () => {
      const res = await changeOwnPassword({ currentPassword, newPassword, confirmPassword });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // Forced users have nowhere to go "back" to (they were bounced here), and
      // the flag is now cleared — drop them into the app. `refresh()` re-runs the
      // layout so the shell stops pinning them here.
      if (forced) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="card p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--ink-1)" }}>
          Password updated.
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--ink-3)" }}>
          Use your new password next time you log in.
        </p>
        <div className="mt-4 flex gap-3">
          <button className="btn btn-secondary" onClick={() => setDone(false)}>
            Change again
          </button>
          <button className="btn btn-primary" onClick={() => router.back()}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="card p-5" onSubmit={submit}>
      <div className="field mb-3.5">
        <label>Current password</label>
        <input
          className="inp"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div className="field mb-3.5">
        <label>New password</label>
        <input
          className="inp"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          {PASSWORD_MIN}–{PASSWORD_MAX} characters.
        </span>
      </div>
      <div className="field mb-4">
        <label>Confirm new password</label>
        <input
          className="inp"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      {error && (
        <p className="mb-3 text-[13px] font-semibold" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <button className="btn btn-primary w-full justify-center" type="submit" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
