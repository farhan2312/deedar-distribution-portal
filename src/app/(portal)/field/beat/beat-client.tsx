"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchCounterByPhone, type CounterSearchResult } from "@/lib/field/actions";
import { ProgressBar } from "@/components/ui/progress-bar";

export type BeatCounter = {
  id: string;
  name: string;
  type: string;
  areaName: string;
  addedByMe: boolean;
  assignedBySO: boolean;
  canVisit: boolean;
  visitedToday: boolean;
};

export function BeatClient({
  firstName,
  depotName,
  reportsTo,
  visitsToday,
  newCountersToday,
  beat,
  beatLabel = "Today's Beat",
}: {
  firstName: string;
  depotName: string;
  reportsTo: string | null;
  visitsToday: number;
  newCountersToday: number;
  beat: BeatCounter[];
  beatLabel?: string;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<CounterSearchResult | null>(null);
  const [searching, startSearch] = useTransition();

  const selfAddedCount = beat.filter((c) => c.addedByMe).length;

  function doSearch() {
    if (!/^\d{10}$/.test(phone)) {
      setResult({ found: false });
      return;
    }
    startSearch(async () => setResult(await searchCounterByPhone(phone)));
  }

  function openCounter(counterId: string) {
    router.push(`/field/counter/${counterId}`);
  }

  return (
    <div className="mx-auto max-w-xl" style={{ animation: "fadeUp .3s ease" }}>
      <header className="mb-5">
        <h2 className="text-[26px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          Namaste, {firstName}
        </h2>
        <p className="mt-0.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
          {depotName}
          {reportsTo && ` · reports to ${reportsTo}`}
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <BeatStat label="Visits today" value={visitsToday} target={50} />
        <BeatStat label="New counters" value={newCountersToday} target={10} />
      </div>

      {/* Search by mobile */}
      <div className="card mb-6 p-5">
        <label className="mb-2 block text-[12px] font-semibold" style={{ color: "var(--ink-2)" }}>
          Find a counter by mobile number
        </label>
        <div className="flex gap-2">
          <input
            className="inp flex-1"
            type="tel"
            inputMode="tel"
            maxLength={10}
            placeholder="10-digit mobile"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setResult(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <button className="btn btn-primary whitespace-nowrap" onClick={doSearch} disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {result && (
          <div className="mt-3">
            {!result.found ? (
              <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
                No counter with this number.{" "}
                <a href="/field/new-counter" className="link">Add it as a new counter →</a>
              </p>
            ) : (
              <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-soft)" }}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold" style={{ color: "var(--ink-1)" }}>
                    {result.name}
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {result.type} · {result.area} · {result.depotName}
                  </div>
                </div>
                {result.canVisit ? (
                  <button className="btn btn-primary btn-sm" onClick={() => openCounter(result.id)}>
                    Check in
                  </button>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={() => openCounter(result.id)}>
                    View
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {!result && (
          <p className="mt-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
            Found: check in if it&apos;s in your depot. Not found: add it as a new
            counter.
          </p>
        )}
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <h4 className="text-[18px] font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
          {beatLabel}
        </h4>
        <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
          {beat.length} counter{beat.length === 1 ? "" : "s"}
          {selfAddedCount > 0 && ` · ${selfAddedCount} added by you`}
        </span>
      </div>

      {beat.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>
          No counters in your beat yet — add one from New Counter, or ask your
          supervisor (SO) to assign you a counter for today.
        </p>
      ) : (
        <div className="space-y-2">
          {beat.map((c) => (
            <div key={c.id} className="card card-hover flex items-center gap-3 p-3.5">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl" style={{ background: "var(--accent-tint)" }}>
                <PinIcon />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold" style={{ color: "var(--ink-1)" }}>
                    {c.name}
                  </span>
                  {c.addedByMe && (
                    <span className="flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>
                      Added by you
                    </span>
                  )}
                  {c.assignedBySO && (
                    <span className="flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "var(--bg-soft)", color: "var(--ink-2)" }}>
                      Assigned by SO
                    </span>
                  )}
                </div>
                <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {c.type} · {c.areaName}
                </div>
              </div>
              <div className="flex flex-none items-center gap-2">
                {c.visitedToday && (
                  <span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--success)" }}>
                    <CheckIcon /> Visited
                  </span>
                )}
                <button className="btn btn-primary btn-sm" onClick={() => openCounter(c.id)}>
                  {c.visitedToday ? "Open" : "Check in"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BeatStat({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = target === 0 ? 0 : Math.round((value / target) * 100);
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 text-[26px] font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--ink-1)" }}>
        {value}
        <span className="text-[14px] font-medium" style={{ color: "var(--ink-3)" }}>/{target}</span>
      </div>
      <div className="mt-2">
        <ProgressBar pct={pct} />
      </div>
    </div>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
