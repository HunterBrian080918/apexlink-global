const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ADMIN_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

const ADMIN_AUTH_TABLE = "admin_auth_accounts";
const ADMIN_AUTH_SELECT = [
  "id",
  "email",
  "password_hash",
  "password_salt",
  "session_version",
  "is_active",
  "created_at",
  "updated_at",
  "last_login_at",
].join(",");

const requireConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
    throw new Error(
      "Supabase admin auth service is not configured. Set SUPABASE_URL and either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return {
    restUrl: `${SUPABASE_URL}/rest/v1`,
    headers: {
      apikey: SUPABASE_ADMIN_KEY,
      Authorization: `Bearer ${SUPABASE_ADMIN_KEY}`,
    },
  };
};

const createMissingTableError = () => {
  const error = new Error(
    "Supabase admin auth table is not available. Run migration 20260713000200_admin_auth_accounts.sql, then run npm run migrate:admin-auth."
  );
  error.status = 503;
  return error;
};

const isMissingAdminAuthTableError = (message) =>
  /admin_auth_accounts/i.test(String(message || "")) &&
  /does not exist|Could not find|schema cache/i.test(String(message || ""));

const requestSupabase = async (tablePath, options = {}) => {
  const { restUrl, headers } = requireConfig();
  const response = await fetch(`${restUrl}/${tablePath}`, {
    method: options.method || "GET",
    headers: {
      ...headers,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = text;
    }
  }

  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload
        ? payload.message || payload.error_description || payload.error || JSON.stringify(payload)
        : text;
    if (isMissingAdminAuthTableError(detail)) {
      throw createMissingTableError();
    }
    const error = new Error(detail || `Supabase request failed with status ${response.status}.`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const escapeFilterValue = (value) => encodeURIComponent(String(value || "").trim());

const mapAdminAuthRow = (row) => {
  if (!row || typeof row !== "object") {
    return null;
  }

  return {
    id: String(row.id || ""),
    email: String(row.email || "").trim().toLowerCase(),
    passwordHash: String(row.password_hash || ""),
    passwordSalt: String(row.password_salt || ""),
    sessionVersion: Math.max(1, Number.parseInt(row.session_version || 1, 10) || 1),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : "",
  };
};

const mapAdminAuthInputToRow = (input = {}) => ({
  email: String(input.email || "").trim().toLowerCase(),
  password_hash: String(input.passwordHash || "").trim(),
  password_salt: String(input.passwordSalt || "").trim(),
  session_version: Math.max(1, Number.parseInt(input.sessionVersion || 1, 10) || 1),
  is_active: input.isActive !== false,
  created_at: input.createdAt || new Date().toISOString(),
  updated_at: input.updatedAt || new Date().toISOString(),
  last_login_at: input.lastLoginAt || null,
});

const getActiveAdminAuth = async () => {
  const rows = await requestSupabase(
    `${ADMIN_AUTH_TABLE}?select=${ADMIN_AUTH_SELECT}&is_active=eq.true&order=updated_at.desc&limit=1`
  );
  return mapAdminAuthRow(Array.isArray(rows) ? rows[0] : null);
};

const getAdminAuthByEmail = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const rows = await requestSupabase(
    `${ADMIN_AUTH_TABLE}?select=${ADMIN_AUTH_SELECT}&email=eq.${escapeFilterValue(normalizedEmail)}&limit=1`
  );
  return mapAdminAuthRow(Array.isArray(rows) ? rows[0] : null);
};

const createAdminAuthAccount = async (input) => {
  const row = mapAdminAuthInputToRow(input);
  const rows = await requestSupabase(ADMIN_AUTH_TABLE, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: row,
  });
  return mapAdminAuthRow(Array.isArray(rows) ? rows[0] : null);
};

const updateAdminAuthAccount = async (id, input = {}) => {
  const accountId = String(id || "").trim();
  if (!accountId) {
    throw new Error("Admin auth account id is required.");
  }

  const patch = {
    updated_at: input.updatedAt || new Date().toISOString(),
  };

  if (input.email !== undefined) {
    patch.email = String(input.email || "").trim().toLowerCase();
  }

  if (input.passwordHash !== undefined) {
    patch.password_hash = String(input.passwordHash || "").trim();
  }

  if (input.passwordSalt !== undefined) {
    patch.password_salt = String(input.passwordSalt || "").trim();
  }

  if (input.sessionVersion !== undefined) {
    patch.session_version = Math.max(1, Number.parseInt(input.sessionVersion || 1, 10) || 1);
  }

  if (input.isActive !== undefined) {
    patch.is_active = Boolean(input.isActive);
  }

  if (input.lastLoginAt !== undefined) {
    patch.last_login_at = input.lastLoginAt || null;
  }

  const rows = await requestSupabase(`${ADMIN_AUTH_TABLE}?id=eq.${escapeFilterValue(accountId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: patch,
  });
  return mapAdminAuthRow(Array.isArray(rows) ? rows[0] : null);
};

const touchAdminLastLogin = async (id) =>
  updateAdminAuthAccount(id, {
    lastLoginAt: new Date().toISOString(),
  });

const upsertAdminAuthByEmail = async (input) => {
  const existing = await getAdminAuthByEmail(input?.email);
  if (existing?.id) {
    return updateAdminAuthAccount(existing.id, input);
  }
  return createAdminAuthAccount(input);
};

module.exports = {
  getActiveAdminAuth,
  getAdminAuthByEmail,
  createAdminAuthAccount,
  updateAdminAuthAccount,
  touchAdminLastLogin,
  upsertAdminAuthByEmail,
};
