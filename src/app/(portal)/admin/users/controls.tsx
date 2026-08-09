"use client";

import { useTransition } from "react";
import type { AccessRole } from "@/db/schema";
import {
  setUserCnf,
  setUserDepot,
  toggleAccessRole,
  toggleUserArea,
  toggleUserDepot,
} from "@/lib/admin/actions";

export function RoleCheckbox({
  userId,
  role,
  checked,
}: {
  userId: string;
  role: AccessRole;
  checked: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      onChange={() => start(() => toggleAccessRole(userId, role))}
    />
  );
}

export function AreaCheckbox({
  userId,
  areaId,
  name,
  checked,
}: {
  userId: string;
  areaId: string;
  name: string;
  checked: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <label style={chipLabel}>
      <input type="checkbox" checked={checked} disabled={pending} onChange={() => start(() => toggleUserArea(userId, areaId))} />
      {name}
    </label>
  );
}

export function DepotCheckbox({
  userId,
  depotId,
  name,
  checked,
}: {
  userId: string;
  depotId: string;
  name: string;
  checked: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <label style={chipLabel}>
      <input type="checkbox" checked={checked} disabled={pending} onChange={() => start(() => toggleUserDepot(userId, depotId))} />
      {name}
    </label>
  );
}

export function DepotSelect({
  userId,
  value,
  options,
}: {
  userId: string;
  value: string | null;
  options: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <select
      className="inp"
      style={selectStyle}
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("depotId", e.target.value);
        start(() => setUserDepot(userId, fd));
      }}
    >
      <option value="">Select depot</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}

/** C&F HQ dropdown for the hq role — the access-control modification. */
export function CnfSelect({
  userId,
  value,
  options,
}: {
  userId: string;
  value: string | null;
  options: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <select
      className="inp"
      style={selectStyle}
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("cnfId", e.target.value);
        start(() => setUserCnf(userId, fd));
      }}
    >
      <option value="">Select C&amp;F HQ</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}

const chipLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11,
  background: "var(--bg-soft)",
  padding: "3px 8px",
  borderRadius: "var(--r-pill)",
  cursor: "pointer",
};
const selectStyle: React.CSSProperties = { padding: "5px 8px", fontSize: 12 };
