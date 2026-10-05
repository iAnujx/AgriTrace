import { beforeEach, describe, expect, it, vi } from "vitest";

// No shared database in tests: every call fails, so the store must fall back to localStorage.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("offline");
    },
  },
}));

import { batchKey, extrasShared, listRecs, putRec, ratingsByBatch, removeRec } from "@/lib/extras";
import { suggestPrice } from "@/lib/pricing";

beforeEach(() => localStorage.clear());

describe("extras store (local fallback)", () => {
  it("saves, updates by (kind, owner, ref) and removes", async () => {
    const a = await putRec("need", "0xABC", "", { crop: "Rice", quantity: 10 });
    expect(extrasShared()).toBe(false);
    expect((await listRecs("need", { owner: "0xabc" })).length).toBe(1);
    const l1 = await putRec("listing", "0xABC", "7", { price: 20 }, { unique: true });
    const l2 = await putRec("listing", "0xabc", "7", { price: 25 }, { unique: true, merge: true });
    expect(l2.id).toBe(l1.id);
    expect((await listRecs("listing")).length).toBe(1);
    expect((await listRecs<{ price: number }>("listing"))[0]!.data.price).toBe(25);
    await removeRec("need", a.id);
    expect((await listRecs("need")).length).toBe(0);
  });

  it("averages distributor quality ratings per batch", async () => {
    await putRec(
      "stock",
      "0xd1",
      "1",
      { fragmentId: 1, batchId: 5, farmer: "0xF", qualityRating: 4, qualityNotes: "clean" },
      { unique: true },
    );
    await putRec(
      "stock",
      "0xd2",
      "2",
      { fragmentId: 2, batchId: 5, farmer: "0xf", qualityRating: 2 },
      { unique: true },
    );
    const r = (await ratingsByBatch()).get(batchKey("0xF", 5))!;
    expect(r.avg).toBe(3);
    expect(r.count).toBe(2);
    expect(r.notes).toEqual(["clean"]);
  });

  it("rejects an oversized record instead of failing silently", async () => {
    await expect(putRec("listing", "0x1", "1", { image: "x".repeat(700_000) })).rejects.toThrow(
      /too large/i,
    );
  });
});

describe("price guidance", () => {
  it("charges more for Darjeeling tea than ordinary tea", () => {
    expect(
      suggestPrice("Darjeeling tea", "other", "Darjeeling, West Bengal")!.price,
    ).toBeGreaterThan(suggestPrice("Tea", "other", "Somewhere")!.price);
  });
  it("returns nothing for an empty form", () => {
    expect(suggestPrice("", "rabi", "")).toBeNull();
  });
});
