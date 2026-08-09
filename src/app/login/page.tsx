"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row bg-[#faf6ef]">
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
      <div className="flex flex-1 items-center justify-center px-6 py-16 md:py-0">
        <div className="w-full max-w-md rounded-2xl bg-white px-10 py-12 shadow-xl shadow-black/5">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#0d3b2e] text-2xl font-bold text-white">
              D
            </span>
            <span className="mt-4 text-xs font-semibold tracking-widest text-emerald-700">
              WELCOME BACK
            </span>
            <h2 className="mt-2 text-3xl font-bold text-[#0d3b2e]">
              Welcome Back
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Login to continue to Deedar Drive
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <label className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 focus-within:border-[#0d3b2e]">
              <PhoneIcon className="h-5 w-5 shrink-0 text-emerald-700" />
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                suppressHydrationWarning
                className="w-full bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
              />
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 focus-within:border-[#0d3b2e]">
              <LockIcon className="h-5 w-5 shrink-0 text-emerald-700" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                suppressHydrationWarning
                className="w-full bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="shrink-0 text-zinc-400 hover:text-zinc-600"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <EyeIcon className="h-5 w-5" open={showPassword} />
              </button>
            </label>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-zinc-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  suppressHydrationWarning
                  className="h-4 w-4 rounded border-zinc-300 text-[#0d3b2e] focus:ring-[#0d3b2e]"
                />
                Remember me
              </label>
              <Link href="#" className="font-medium text-emerald-700 hover:text-emerald-800">
                Forgot password?
              </Link>
            </div>

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#0d3b2e] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#124a3a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Logging in…" : "Login"}
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </form>

          <div className="my-6 h-px w-full bg-zinc-100" />

          <p className="text-center text-sm text-zinc-500">
            New to Deedar Drive?{" "}
            <span className="cursor-pointer font-semibold text-emerald-700 hover:text-emerald-800">
              Request Access
            </span>
          </p>
        </div>
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

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
