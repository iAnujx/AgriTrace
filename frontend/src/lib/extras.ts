/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Off-chain "extras": things the blockchain should not store (photos, bids, warehouse notes, quality ratings,
 * crop needs). Money and stock ownership always stay on chain. Extras live in the Supabase table `app_records`
 * (shared between users). If that table is not set up yet, everything transparently falls back to this browser's
 * localStorage so the app never breaks (data is then private to this browser).
 */
import { supabase } from "@/integrations/supabase/client";

export type Kind = "listing" | "bid" | "need" | "stock" | "profile";
export interface Rec<T = Record<string, any>> {
  id: string;
  kind: Kind;
  owner: string;
  ref: string;
  data: T;
  created_at: string;
  updated_at: string;
}

const lsKey = (k: Kind) => `agritrace-extras:${k}`;
let remoteOk: boolean | null = null;
const listeners = new Set<() => void>();
export const extrasShared = () => remoteOk !== false;
export const onExtrasMode = (fn: () => void) => (
  listeners.add(fn),
  () => void listeners.delete(fn)
);
const setMode = (ok: boolean) => {
  if (remoteOk !== ok) {
    remoteOk = ok;
    listeners.forEach((f) => f());
  }
};

const table = () => (supabase as any).from("app_records");
const lc = (s: string) => s.toLowerCase();
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function readLocal<T>(kind: Kind): Rec<T>[] {
  try {
    return JSON.parse(localStorage.getItem(lsKey(kind)) ?? "[]");
  } catch {
    return [];
  }
}
function writeLocal(kind: Kind, rows: Rec<any>[]) {
  try {
    localStorage.setItem(lsKey(kind), JSON.stringify(rows));
  } catch {
    throw new Error("This browser has no space left to save that (try a smaller photo).");
  }
}

export async function listRecs<T = Record<string, any>>(
  kind: Kind,
  f: { owner?: string; ref?: string } = {},
): Promise<Rec<T>[]> {
  if (remoteOk !== false) {
    try {
      let q = table()
        .select("*")
        .eq("kind", kind)
        .order("created_at", { ascending: false })
        .limit(500);
      if (f.owner) q = q.eq("owner", lc(f.owner));
      if (f.ref) q = q.eq("ref", f.ref);
      const { data, error } = await q;
      if (error) throw error;
      setMode(true);
      return (data ?? []) as Rec<T>[];
    } catch {
      setMode(false);
    }
  }
  return readLocal<T>(kind).filter(
    (r) => (!f.owner || r.owner === lc(f.owner)) && (!f.ref || r.ref === f.ref),
  );
}

/** Insert, or update the record with the same (kind, owner, ref) when `unique` is set. Pass `id` to update a known record. */
export async function putRec<T extends Record<string, any>>(
  kind: Kind,
  owner: string,
  ref: string,
  data: T,
  opts: { id?: string; unique?: boolean; merge?: boolean } = {},
): Promise<Rec<T>> {
  const o = lc(owner);
  let id = opts.id;
  let prev: Rec<T> | undefined;
  if (!id && opts.unique) {
    prev = (await listRecs<T>(kind, { owner: o, ref }))[0];
    id = prev?.id;
  }
  if (id && !prev) prev = (await listRecs<T>(kind)).find((r) => r.id === id);
  const next = opts.merge && prev ? { ...prev.data, ...data } : data;
  if (JSON.stringify(next).length > 580_000)
    throw new Error("That is too large to save (try a smaller photo).");
  const now = new Date().toISOString();

  if (remoteOk !== false) {
    try {
      const q = id
        ? table().update({ data: next, updated_at: now }).eq("id", id)
        : table().insert({ kind, owner: o, ref, data: next });
      const { data: row, error } = await q.select().single();
      if (error) throw error;
      setMode(true);
      return row as Rec<T>;
    } catch {
      setMode(false);
    }
  }
  const rows = readLocal<T>(kind);
  const rec: Rec<T> = {
    id: id ?? uid(),
    kind,
    owner: o,
    ref,
    data: next as T,
    created_at: prev?.created_at ?? now,
    updated_at: now,
  };
  writeLocal(
    kind,
    id
      ? rows.map((r) => (r.id === id ? rec : r)).concat(rows.some((r) => r.id === id) ? [] : [rec])
      : [rec, ...rows],
  );
  return rec;
}

export async function removeRec(kind: Kind, id: string): Promise<void> {
  if (remoteOk !== false) {
    try {
      const { error } = await table().delete().eq("id", id);
      if (error) throw error;
      setMode(true);
      return;
    } catch {
      setMode(false);
    }
  }
  writeLocal(
    kind,
    readLocal(kind).filter((r) => r.id !== id),
  );
}

/* ---------- typed shapes ---------- */
export interface Listing {
  batchId: number;
  rootFragmentId: number;
  farmer: string;
  cropName: string;
  cropType: string;
  location: string;
  harvestDate: string;
  quantity: number;
  price: number;
  image?: string | null;
}
export interface Bid {
  listingId: string;
  batchId: number;
  farmer: string;
  bidder: string;
  bidderName: string;
  cropName: string;
  price: number;
  quantity: number;
  status: "open" | "accepted" | "rejected" | "withdrawn";
}
export interface Need {
  crop: string;
  quantity: number;
  maxPrice: number | null;
  neededBy: string | null;
  distributorName: string;
}
export interface StockInfo {
  fragmentId: number;
  batchId: number;
  farmer: string;
  warehouse?: string;
  packaging?: string;
  qualityRating?: number | null;
  qualityNotes?: string;
  sellingPrice?: number | null;
  transportCost?: number;
  wasted?: number;
  vehicle?: string;
  dispatchTo?: string;
  dispatchAt?: string;
}

/** Average distributor quality rating per farmer batch, used for the consumer catalog and the farmer's "Improve" tab. */
export async function ratingsByBatch(): Promise<
  Map<string, { avg: number; count: number; notes: string[] }>
> {
  const m = new Map<string, { sum: number; count: number; notes: string[] }>();
  for (const r of await listRecs<StockInfo>("stock")) {
    const d = r.data;
    if (d.qualityRating == null) continue;
    const k = `${lc(d.farmer)}:${d.batchId}`;
    const e = m.get(k) ?? { sum: 0, count: 0, notes: [] };
    e.sum += Number(d.qualityRating);
    e.count += 1;
    if (d.qualityNotes) e.notes.push(d.qualityNotes);
    m.set(k, e);
  }
  return new Map(
    [...m].map(([k, v]) => [k, { avg: v.sum / v.count, count: v.count, notes: v.notes }]),
  );
}
export const batchKey = (farmer: string, batchId: number) => `${lc(farmer)}:${batchId}`;
