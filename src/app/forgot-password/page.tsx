"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth/reset-actions";
import { useT } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/components/language-toggle";

/**
 * "I've forgotten my password" — collects a mobile number and raises a request
 * for an admin to action from Users & Access.
 *
 * There is no email or SMS channel in this app, so there is no reset link to
 * send; the admin recognising the person is the verification step. The
 * confirmation is worded so it reads the same whether or not the number is
 * registered, matching what the action does — otherwise this page becomes a way
 * to test which mobile numbers have accounts.
 */
export default function ForgotPasswordPage() {
  const t = useT();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    const res = await requestPasswordReset(phone);
    if (!res.ok) {
      setError(t(res.error));
      setSubmitting(false);
      return;
    }
    setSent(true);
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12" style={{ background: "var(--bg)" }}>
      <div className="absolute right-6 top-6">
        <LanguageToggle />
      </div>
      <div
        className="w-full max-w-sm rounded-3xl bg-white px-10 py-8 border"
        style={{ borderColor: "var(--hairline-soft)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#0d3b2e] text-2xl font-bold text-white">
            D
          </span>
          <span className="mt-4 text-xs font-semibold tracking-widest text-emerald-700">
            {t("FORGOT PASSWORD")}
          </span>
          <p className="mt-2 text-sm text-zinc-500">
            {sent
              ? t("Your admin will reset it and tell you the new password.")
              : t("Enter your mobile number and your admin will reset your password.")}
          </p>
        </div>

        {sent ? (
          <div className="mt-8 flex flex-col gap-4">
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(30,158,90,.1)", color: "#1E6B3C" }}>
              {t("Request sent. Please contact your admin if it's urgent.")}
            </div>
            <Link
              href="/login"
              className="flex items-center justify-center rounded-xl bg-[#0d3b2e] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#124a3a]"
            >
              {t("Back to login")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <label className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 focus-within:border-[#0d3b2e]">
              <PhoneIcon className="h-5 w-5 shrink-0 text-emerald-700" />
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t("Phone number")}
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                suppressHydrationWarning
                className="w-full bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
              />
            </label>

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || phone.length !== 10}
              className="mt-2 flex items-center justify-center rounded-xl bg-[#0d3b2e] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#124a3a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? t("Sending…") : t("Request password reset")}
            </button>
          </form>
        )}

        <div className="my-4 h-px w-full bg-zinc-100" />

        <p className="text-center text-sm text-zinc-500">
          {t("Remembered it?")}{" "}
          <Link href="/login" className="font-semibold text-emerald-700 hover:text-emerald-800">
            {t("Login")}
          </Link>
        </p>
      </div>
    </div>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.5 21 3 13.5 3 4.5c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.2 1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
