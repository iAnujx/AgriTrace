/**
 * Who is signed in, on this device. One session shape for every login method
 * (MetaMask, Google, email, phone, guest). Profiles and roles are kept PER ACCOUNT and PER ROLE,
 * so a distributor never sees a farmer's profile and two people on one browser never share one.
 */
import { supabase } from "@/integrations/supabase/client";
import { listRecs, putRec } from "@/lib/extras";

export type Role = "farmer" | "distributor" | "retailer" | "consumer";
export type Method = "wallet" | "google" | "email" | "phone" | "guest";
export interface Session {
  address: string; // wallet address ("" until a wallet is connected for non-wallet logins)
  role: Role;
  connectedAt: string;
  method?: Method;
  userId?: string; // Supabase account id for google / email / phone
  name?: string;
  email?: string;
  phone?: string;
}

const KEY = "agritrace-user";
const ROLES_KEY = "agritrace-roles";
export const ROLE_LIST: Role[] = ["farmer", "distributor", "retailer", "consumer"];
export const isRole = (v: unknown): v is Role => ROLE_LIST.includes(v as Role);
export const homeFor = (r: Role) => `/dashboard/${r}`;

export function getSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return s && isRole(s.role) ? { address: "", connectedAt: "", ...s } : null;
  } catch {
    return null;
  }
}
export function startSession(s: Omit<Session, "connectedAt">): Session {
  const full: Session = { ...s, connectedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(full));
  if (s.address) rememberRoleLocal(s.address, s.role);
  return full;
}
export async function endSession() {
  localStorage.removeItem(KEY);
  try {
    await supabase.auth.signOut();
  } catch {
    /* signing out of the account service must never block logging out here */
  }
}

/** Stable identity for storage keys: the account id when there is one, else the wallet address. */
export const identityOf = (s: Session | null): string =>
  s ? (s.userId || s.address || "guest").toLowerCase() : "guest";
/** Storage key for anything that belongs to ONE person acting in ONE role (profile, drafts…). */
export const scopedKey = (base: string, s: Session | null = getSession()) =>
  `${base}:${s?.role ?? "none"}:${identityOf(s)}`;

/* ---- wallet -> role memory (this device, plus a shared copy so it follows the wallet to other devices) ---- */
const rolesLocal = (): Record<string, Role> => {
  try {
    return JSON.parse(localStorage.getItem(ROLES_KEY) ?? "{}");
  } catch {
    return {};
  }
};
const rememberRoleLocal = (address: string, role: Role) =>
  localStorage.setItem(
    ROLES_KEY,
    JSON.stringify({ ...rolesLocal(), [address.toLowerCase()]: role }),
  );
export async function rememberRole(address: string, role: Role) {
  rememberRoleLocal(address, role);
  try {
    await putRec("profile", address, "role", { role }, { unique: true });
  } catch {
    /* best effort */
  }
}
export async function roleOfWallet(address: string): Promise<Role | null> {
  const local = rolesLocal()[address.toLowerCase()];
  if (local) return local;
  try {
    const r = (await listRecs<{ role: Role }>("profile", { owner: address, ref: "role" }))[0]?.data
      .role;
    return isRole(r) ? r : null;
  } catch {
    return null;
  }
}
