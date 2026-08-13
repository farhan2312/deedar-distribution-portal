"use client";

// A stable-per-browser id used to bind live location sharing to the ONE
// device that started the rep's day. Persisted in localStorage so it survives
// reloads and navigation; a different browser / cleared storage is a different
// device (which is exactly what we want — a second login can't hijack the pin).

const KEY = "deedar_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage disabled: fall back to no id. The server then
    // treats this device as "unclaimed" and won't be able to own the day —
    // acceptable degradation vs. blocking a legitimate rep entirely.
    return "";
  }
}
