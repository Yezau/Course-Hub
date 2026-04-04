import { getClientIp } from "./security.js";

export function getAuditContext(c) {
  const currentUser = typeof c.get === "function" ? c.get("user") : null;

  return {
    actorId: currentUser?.id ?? null,
    ipAddress: getClientIp(c),
    userAgent: c.req.header("user-agent") || null,
  };
}

export async function recordAuditLog(db, payload = {}) {
  return null;
}

export async function listAuditLogs(db, options = {}) {
  return [];
}
