import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("offline");
    },
    auth: { signOut: async () => ({}) },
  },
}));

import {
  endSession,
  getSession,
  identityOf,
  roleOfWallet,
  rememberRole,
  scopedKey,
  startSession,
} from "@/lib/session";

beforeEach(() => localStorage.clear());

describe("session", () => {
  it("keeps one profile per account AND per role", () => {
    const farmer = startSession({ address: "", role: "farmer", method: "email", userId: "u1" });
    const kFarmer = scopedKey("agritrace-profile", farmer);
    const distributor = startSession({
      address: "",
      role: "distributor",
      method: "email",
      userId: "u1",
    });
    const kDist = scopedKey("agritrace-profile", distributor);
    const other = startSession({ address: "", role: "farmer", method: "email", userId: "u2" });
    expect(new Set([kFarmer, kDist, scopedKey("agritrace-profile", other)]).size).toBe(3);
  });

  it("identity stays the account id even after a wallet is connected", () => {
    const s = startSession({ address: "", role: "retailer", method: "google", userId: "U9" });
    expect(identityOf({ ...s, address: "0xABC" })).toBe("u9");
    expect(identityOf({ ...s, userId: "" as never, address: "0xABC" })).toBe("0xabc");
  });

  it("gives every role a session, not only farmer", () => {
    for (const role of ["farmer", "distributor", "retailer", "consumer"] as const) {
      startSession({ address: "0x1", role, method: "wallet" });
      expect(getSession()?.role).toBe(role);
    }
  });

  it("remembers the role a wallet registered with", async () => {
    expect(await roleOfWallet("0xAbC")).toBeNull();
    await rememberRole("0xAbC", "distributor");
    expect(await roleOfWallet("0xabc")).toBe("distributor");
  });

  it("logout clears the session", async () => {
    startSession({ address: "0x1", role: "farmer", method: "wallet" });
    await endSession();
    expect(getSession()).toBeNull();
  });
});
