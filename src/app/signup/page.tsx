"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import type { AccessRole } from "@/db/schema";
import { requestAccess } from "@/lib/auth/signup-actions";
import { ROLE_LABEL, SIGNUP_ROLES } from "@/lib/auth/roles";

export default function SignupPage() {
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

  return (
    <div className="flex flex-1 flex-col md:flex-row" style={{ background: "var(--bg)" }}>
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
      <div className="flex flex-1 items-center justify-center px-6 py-15 md:py-0">
        <div
          className="w-full max-w-sm rounded-3xl bg-white px-10 py-8 border"
          style={{ borderColor: "var(--hairline-soft)", boxShadow: "var(--shadow-lg)" }}
        >
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#0d3b2e] text-2xl font-bold text-white">
              D
            </span>
            <span className="mt-4 text-xs font-semibold tracking-widest text-emerald-700">
              REQUEST ACCESS
            </span>
            <p className="mt-2 text-sm text-zinc-500">
              Ask Central Admin to set up your account
            </p>
          </div>

          {done ? (
            <div className="mt-8 rounded-xl p-4 text-center" style={{ background: "var(--accent-tint)" }}>
              <p className="text-sm font-semibold text-zinc-800">Request sent!</p>
              <p className="mt-1.5 text-sm text-zinc-500">
                Central Admin will review it. Once approved, log in with your
                mobile number and the password you just set.
              </p>
              <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                Back to login →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
              <FieldInput
                type="text"
                placeholder="Full name"
                value={name}
                onChange={setName}
                autoComplete="name"
              />
              <FieldInput
                type="tel"
                inputMode="tel"
                placeholder="Phone number"
                maxLength={10}
                value={phone}
                onChange={setPhone}
                autoComplete="tel"
              />
              <FieldInput
                type="password"
                placeholder="Password"
                value={password}
                onChange={setPassword}
                minLength={6}
                autoComplete="new-password"
              />
              <FieldInput
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                minLength={6}
                autoComplete="new-password"
              />

              <label className="flex flex-col gap-1.5 text-sm text-zinc-600">
                Role you&apos;re requesting
                <select
                  className="rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-800 outline-none focus:border-[#0d3b2e]"
                  value={role}
                  onChange={(e) => setRole(e.target.value as AccessRole)}
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
                {pending ? "Sending…" : "Send request"}
              </button>
            </form>
          )}

          <div className="my-4 h-px w-full bg-zinc-100" />

          <p className="text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-emerald-700 hover:text-emerald-800">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  type,
  placeholder,
  value,
  onChange,
  maxLength,
  minLength,
  inputMode,
  autoComplete,
}: {
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  minLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 focus-within:border-[#0d3b2e]">
      <input
        type={type}
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
    </label>
  );
}
