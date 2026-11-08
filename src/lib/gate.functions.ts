import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { gateSession, passwordMatches } from "./gate.server";

export const getSiteAccess = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const secret = process.env["SESSION_SECRET"];
  if (!secret) return { unlocked: false };
  const session = await gateSession(secret);
  return { unlocked: session.data.unlocked === true };
});

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => {
    if (typeof data?.password !== "string" || data.password.length > 1024) throw new Error("Enter a valid password.");
    return data;
  })
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const expected = process.env["SITE_PASSWORD"];
    const secret = process.env["SESSION_SECRET"];
    if (!expected || !secret) throw new Error("Site access is not configured.");
    if (!passwordMatches(data.password, expected)) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      return { ok: false };
    }
    const session = await gateSession(secret);
    await session.update({ unlocked: true });
    return { ok: true };
  });

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const secret = process.env["SESSION_SECRET"];
  if (secret) await (await gateSession(secret)).clear();
  return { ok: true };
});