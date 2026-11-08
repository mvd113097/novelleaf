import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ unlocked: false, status: 200 }));
vi.mock("@tanstack/react-start/server", () => ({
  useSession: vi.fn(async () => ({ data: { unlocked: state.unlocked } })),
  setResponseHeader: vi.fn(),
  setResponseStatus: vi.fn((status: number) => { state.status = status; }),
}));
import { passwordMatches, requireUnlocked, gateSession } from "@/lib/gate.server";
import { useSession } from "@tanstack/react-start/server";
beforeEach(() => { state.unlocked = false; state.status = 200; vi.clearAllMocks(); });
describe("Shared password access", () => {
  it("accepts only the exact shared password", () => {
    expect(passwordMatches("fixture-password", "fixture-password")).toBe(true);
    expect(passwordMatches("incorrect", "fixture-password")).toBe(false);
    expect(passwordMatches("", "fixture-password")).toBe(false);
  });
  it("blocks reader services when the session is locked", async () => {
    await expect(requireUnlocked("test-session-secret-with-at-least-32-characters")).rejects.toThrow("Unlock the site");
    expect(state.status).toBe(401);
  });
  it("permits reader services only after unlocking", async () => {
    state.unlocked = true;
    await expect(requireUnlocked("test-session-secret-with-at-least-32-characters")).resolves.toBeUndefined();
  });
  it("fails closed when the session secret is unavailable", async () => {
    await expect(requireUnlocked(undefined)).rejects.toThrow("not configured");
  });
  it("keeps unlock sessions encrypted with secure HttpOnly cookies", async () => {
    await gateSession("test-session-secret-with-at-least-32-characters");
    expect(useSession).toHaveBeenCalledWith(expect.objectContaining({ cookie: { httpOnly: true, secure: true, sameSite: "lax", path: "/" } }));
  });
});