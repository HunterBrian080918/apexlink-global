const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ADMIN_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();
const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
const fallbackFile = path.join(__dirname, "..", "data", "admin-notifications.json");
const TYPES = new Set([
  "new_contact_inquiry",
  "new_support_message",
  "customer_reply",
  "new_retail_order",
  "new_wholesale_inquiry",
  "new_payment",
  "new_quote_request",
]);
let hasWarnedAboutFallback = false;

const mapRow = (row) => ({
  id: String(row?.id || ""),
  type: String(row?.type || "new_support_message"),
  title: String(row?.title || "New activity"),
  message: String(row?.message || ""),
  entityType: String(row?.entity_type || ""),
  entityId: String(row?.entity_id || ""),
  metadata: row?.metadata && typeof row.metadata === "object" ? row.metadata : {},
  isRead: Boolean(row?.is_read),
  readAt: String(row?.read_at || ""),
  createdAt: String(row?.created_at || ""),
});

const isUuidLike = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());

const requestSupabase = async (tablePath, options = {}) => {
  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) throw new Error("Supabase notifications are not configured.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${tablePath}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_ADMIN_KEY,
      Authorization: `Bearer ${SUPABASE_ADMIN_KEY}`,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const payload = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || text || `Supabase request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
};

const readFallback = () => {
  try {
    const rows = JSON.parse(fs.readFileSync(fallbackFile, "utf8"));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
};

const writeFallback = (rows) => {
  fs.mkdirSync(path.dirname(fallbackFile), { recursive: true });
  fs.writeFileSync(fallbackFile, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
};

const withFallback = async (primary, fallback) => {
  try {
    return await primary();
  } catch (error) {
    if (isProduction) {
      throw error;
    }
    if (error.status && ![400, 404].includes(error.status)) throw error;
    if (!hasWarnedAboutFallback) {
      console.warn(`[notifications] Development fallback enabled. Supabase persistence is unavailable: ${error.message}`);
      hasWarnedAboutFallback = true;
    }
    return fallback();
  }
};

const listNotifications = async (limit = 50) => withFallback(
  async () => {
    const rows = await requestSupabase(`admin_notifications?select=*&order=created_at.desc&limit=${Math.min(Math.max(Number(limit) || 50, 1), 100)}`);
    return (Array.isArray(rows) ? rows : []).map(mapRow);
  },
  () => readFallback().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit).map(mapRow)
);

const createNotification = async (input = {}) => {
  const type = TYPES.has(input.type) ? input.type : "new_support_message";
  const entityId = String(input.entityId || "").trim();
  const row = {
    id: crypto.randomUUID(),
    type,
    title: String(input.title || "New activity").trim(),
    message: String(input.message || "").trim(),
    entity_type: String(input.entityType || "").trim() || null,
    entity_id: isUuidLike(entityId) ? entityId : null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    is_read: false, read_at: null, created_at: new Date().toISOString(),
  };
  return withFallback(
    async () => {
      const rows = await requestSupabase("admin_notifications", { method: "POST", headers: { Prefer: "return=representation" }, body: row });
      return mapRow(rows?.[0] || row);
    },
    () => { const rows = readFallback(); rows.push(row); writeFallback(rows); return mapRow(row); }
  );
};

const markNotificationRead = async (id) => withFallback(
  async () => {
    const rows = await requestSupabase(`admin_notifications?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: { is_read: true, read_at: new Date().toISOString() },
    });
    return mapRow(rows?.[0]);
  },
  () => { const rows = readFallback(); const row = rows.find((item) => item.id === id); if (row) { row.is_read = true; row.read_at = new Date().toISOString(); writeFallback(rows); } return row ? mapRow(row) : null; }
);

const markAllNotificationsRead = async () => withFallback(
  async () => { await requestSupabase("admin_notifications?is_read=eq.false", { method: "PATCH", body: { is_read: true, read_at: new Date().toISOString() } }); return true; },
  () => { const rows = readFallback(); const now = new Date().toISOString(); rows.forEach((row) => { if (!row.is_read) { row.is_read = true; row.read_at = now; } }); writeFallback(rows); return true; }
);

const getUnreadNotificationCount = async () =>
  withFallback(
    async () => {
      const rows = await requestSupabase("admin_notifications?select=id&is_read=eq.false");
      return Array.isArray(rows) ? rows.length : 0;
    },
    () => readFallback().filter((row) => !row.is_read).length
  );

module.exports = {
  listNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
};
