import { redirect } from "@tanstack/react-router";
import { getSiteAccess } from "./gate.functions";

export async function requireSiteAccess() {
  const access = await getSiteAccess();
  if (!access.unlocked) throw redirect({ to: "/unlock" });
  return access;
}