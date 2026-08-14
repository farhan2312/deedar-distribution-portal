"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import type { AccessRole } from "@/db/schema";
import { requestAccess } from "@/lib/auth/signup-actions";
import { ROLE_LABEL, SIGNUP_ROLES } from "@/lib/auth/roles";
import { useT } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/components/language-toggle";

export default function SignupPage() {
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<AccessRole>("field");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startSubmit] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startSubmit(async () => {
      const res = await requestAccess({ name, phone, password, confirmPassword, role });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
    });
  }

  // Mobile has no side image, so the card sits on the brand green (the submit
  // button colour); from `md` up the split layout uses the light canvas.
  return (
    <div className="flex flex-1 flex-col bg-[#0d3b2e] md:flex-row md:bg-[var(--bg)]">
      {/* Left branding panel */}
      <div className="relative hidden md:block md:w-[60%]">
        <Image
          src="/login-hero.png"
          alt="Deedar Drive — Field Sales & Distribution Platform"
          fill
          priority
          className="object-cover"
          sizes="60vw"
        />
      </div>

      {/* Right form panel */}
      <div className="relative flex flex-1 items-center justify-center px-6 py-15 md:py-0">
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
              {t("REQUEST ACCESS")}
            </span>
            <p className="mt-2 text-sm text-zinc-500">
              {t("Ask Central Admin to set up your account")}
            </p>
          </div>

          {done ? (
            <div className="mt-8 rounded-xl p-4 text-center" style={{ background: "var(--accent-tint)" }}>
              <p className="text-sm font-semibold text-zinc-800">{t("Request sent!")}</p>
              <p className="mt-1.5 text-sm text-zinc-500">
                {t("Central Admin will review it. Once approved, log in with your mobile number and the password you just set.")}
              </p>
              <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                {t("Back to login →")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
              <FieldInput
                icon={<UserIcon className="h-5 w-5 shrink-0 text-emerald-700" />}
                type="text"
                placeholder={t("Full name")}
                value={name}
                onChange={setName}
                autoComplete="name"
              />
              <FieldInput
                icon={<PhoneIcon className="h-5 w-5 shrink-0 text-emerald-700" />}
                type="tel"
                inputMode="tel"
                placeholder={t("Phone number")}
                maxLength={10}
                value={phone}
                onChange={setPhone}
                autoComplete="tel"
              />
              <FieldInput
                icon={<LockIcon className="h-5 w-5 shrink-0 text-emerald-700" />}
                type="password"
                revealable
                placeholder={t("Password")}
                value={password}
                onChange={setPassword}
                minLength={6}
                autoComplete="new-password"
              />
              <FieldInput
                icon={<LockIcon className="h-5 w-5 shrink-0 text-emerald-700" />}
                type="password"
                revealable
                placeholder={t("Confirm password")}
                value={confirmPassword}
                onChange={setConfirmPassword}
                minLength={6}
                autoComplete="new-password"
              />

              <label className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 focus-within:border-[#0d3b2e]">
                <BriefcaseIcon className="h-5 w-5 shrink-0 text-emerald-700" />
                <select
                  className="w-full bg-transparent text-sm text-zinc-800 outline-none"
                  value={role}
                  onChange={(e) => setRole(e.target.value as AccessRole)}
                  aria-label={t("Role you're requesting")}
                >
                  {SIGNUP_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </label>

              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#0d3b2e] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#124a3a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? t("Sending…") : t("Send request")}
              </button>
            </form>
          )}

          <div className="my-4 h-px w-full bg-zinc-100" />

          <p className="text-center text-sm text-zinc-500">
            {t("Already have an account?")}{" "}
            <Link href="/login" className="font-semibold text-emerald-700 hover:text-emerald-800">
              {t("Log in")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  icon,
  type,
  placeholder,
  value,
  onChange,
  maxLength,
  minLength,
  inputMode,
  autoComplete,
  revealable,
}: {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  minLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  revealable?: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  const inputType = revealable ? (reveal ? "text" : "password") : type;
  return (
    <label className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 focus-within:border-[#0d3b2e]">
      {icon}
      <input
        type={inputType}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        maxLength={maxLength}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        suppressHydrationWarning
        className="w-full bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
      />
      {revealable && (
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="shrink-0 text-zinc-400 hover:text-zinc-600"
          aria-label={reveal ? "Hide password" : "Show password"}
        >
          <EyeIcon className="h-5 w-5" open={reveal} />
        </button>
      )}
    </label>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function BriefcaseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="1.6" />
    </svg>
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

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 10V7a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeIcon({ className, open }: { className?: string; open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      {!open && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}
