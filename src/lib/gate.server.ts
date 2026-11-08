import { createHash, timingSafeEqual } from "node:crypto";
import { useSession, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";

export function passwordMatches(input: string, expected: string): boolean {
  return timingSafeEqual(createHash("sha256").update(input, "utf8").digest(), createHash("sha256").update(expected, "utf8").digest());
}
export function gateSession(secret: string) {
  return useSession<{ unlocked?: boolean }>({
    password: secret,
    name: "inkleaf-gate",
    maxAge: 60 * 60 * 24 * 7,
    cookie: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
  });
}
export async function requireUnlocked(secret: string | undefined) {
  setResponseHeader("Cache-Control", "private, no-store");
  if (!secret) throw new Error("Site access is not configured.");
  const session = await gateSession(secret);
  if (!session.data.unlocked) {
    setResponseStatus(401);
    throw new Error("Unlock the site before using the reader.");
  }
}