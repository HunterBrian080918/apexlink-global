const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ADMIN_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

const requireConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
    throw new Error(
      "Supabase analytics service is not configured. Set SUPABASE_URL and either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
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
    const requestError = new Error(detail || `Supabase request failed with status ${response.status}.`);
    requestError.status = response.status;
    requestError.payload = payload;
    throw requestError;
  }

  return payload;
};

const requestSupabaseCount = async (tablePath) => {
  const { restUrl, headers } = requireConfig();
  const response = await fetch(`${restUrl}/${tablePath}`, {
    method: "HEAD",
    headers: {
      ...headers,
      Prefer: "count=exact",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const requestError = new Error(text || `Supabase count request failed with status ${response.status}.`);
    requestError.status = response.status;
    throw requestError;
  }

  const contentRange = String(response.headers.get("content-range") || "").trim();
  const match = contentRange.match(/\/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 0;
};

const escapeFilterValue = (value) => encodeURIComponent(String(value || "").trim());
const nowIso = () => new Date().toISOString();
const toIsoDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
};

const startOfDayIso = (value = new Date()) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
};

const addDaysIso = (value, days) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const sanitizePath = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized || !normalized.startsWith("/")) {
    return "/";
  }
  return normalized.slice(0, 320);
};

const sanitizeText = (value, maxLength = 512) => String(value || "").trim().slice(0, maxLength);

const normalizeDeviceType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["mobile", "tablet", "desktop"].includes(normalized)) {
    return normalized;
  }
  return "desktop";
};

const mapAnalyticsEventRow = (row) => ({
  id: String(row?.id || ""),
  eventType: String(row?.event_type || ""),
  path: String(row?.path || ""),
  metadata: row?.metadata && typeof row.metadata === "object" ? row.metadata : {},
  createdAt: String(row?.created_at || ""),
});

const mapDailyStatRow = (row) => ({
  eventDate: String(row?.event_date || ""),
  visitCount: Number(row?.visit_count || 0),
  aiMatchCount: Number(row?.ai_match_count || 0),
  inquiryCount: Number(row?.inquiry_count || 0),
});

const listVisitEvents = async ({ days = 30 } = {}) => {
  const safeDays = Math.max(1, Number.parseInt(days, 10) || 30);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - Math.max(safeDays - 1, 0));
  start.setUTCHours(0, 0, 0, 0);
  const rows = await requestSupabase(
    `analytics_events?select=id,event_type,path,metadata,created_at&event_type=eq.visit&created_at=gte.${escapeFilterValue(
      start.toISOString()
    )}&order=created_at.asc`
  );
  return Array.isArray(rows) ? rows.map(mapAnalyticsEventRow) : [];
};

const listDailyStats = async ({ days = 30 } = {}) => {
  const safeDays = Math.max(1, Number.parseInt(days, 10) || 30);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - Math.max(safeDays - 1, 0));
  start.setUTCHours(0, 0, 0, 0);
  const rows = await requestSupabase(
    `analytics_daily_stats?select=event_date,visit_count,ai_match_count,inquiry_count&event_date=gte.${escapeFilterValue(
      toIsoDateKey(start)
    )}&order=event_date.asc`
  );
  return Array.isArray(rows) ? rows.map(mapDailyStatRow) : [];
};

const getTotals = async () => {
  const rows = await requestSupabase("analytics_totals?select=*&id=eq.1&limit=1");
  const row = Array.isArray(rows) ? rows[0] : null;
  return {
    totalVisits: Number(row?.total_visits || 0),
    totalAiMatch: Number(row?.total_ai_match || 0),
    totalInquiries: Number(row?.total_inquiries || 0),
    createdAt: String(row?.created_at || ""),
    updatedAt: String(row?.updated_at || ""),
  };
};

const patchDailyVisitCount = async (dateKey, visitCount) => {
  const rows = await requestSupabase(
    `analytics_daily_stats?select=event_date,visit_count,ai_match_count,inquiry_count&event_date=eq.${escapeFilterValue(
      dateKey
    )}&limit=1`
  ).catch(() => []);
  const existing = Array.isArray(rows) ? rows[0] : null;
  if (existing?.event_date) {
    await requestSupabase(`analytics_daily_stats?event_date=eq.${escapeFilterValue(dateKey)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: {
        visit_count: visitCount,
        updated_at: nowIso(),
      },
    });
    return;
  }

  await requestSupabase("analytics_daily_stats", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: {
      event_date: dateKey,
      visit_count: visitCount,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  });
};

const patchTotalVisitCount = async (visitCount) => {
  await requestSupabase("analytics_totals?id=eq.1", {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: {
      total_visits: visitCount,
      updated_at: nowIso(),
    },
  });
};

const syncVisitAggregates = async (createdAt) => {
  const dateKey = toIsoDateKey(createdAt);
  if (!dateKey) {
    return;
  }

  const dayStart = startOfDayIso(createdAt);
  const dayEnd = addDaysIso(new Date(dayStart), 1);
  const [dailyCount, totalCount] = await Promise.all([
    requestSupabaseCount(
      `analytics_events?select=id&event_type=eq.visit&created_at=gte.${escapeFilterValue(
        dayStart
      )}&created_at=lt.${escapeFilterValue(dayEnd)}`
    ),
    requestSupabaseCount("analytics_events?select=id&event_type=eq.visit"),
  ]);

  await Promise.all([patchDailyVisitCount(dateKey, dailyCount), patchTotalVisitCount(totalCount)]);
};

const recordVisit = async (input = {}) => {
  const createdAt = nowIso();
  const metadata = {
    referrer: sanitizeText(input.referrer, 2048),
    userAgent: sanitizeText(input.userAgent, 1024),
    deviceType: normalizeDeviceType(input.deviceType),
    visitorId: sanitizeText(input.visitorId, 128),
    pageViewId: sanitizeText(input.pageViewId, 128),
    source: sanitizeText(input.source, 128),
    country: sanitizeText(input.country, 32),
    clientTimestamp: sanitizeText(input.timestamp, 64),
    ipAddress: sanitizeText(input.ipAddress, 128),
    hostname: sanitizeText(input.hostname, 255),
  };

  const rows = await requestSupabase("analytics_events", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      event_type: "visit",
      path: sanitizePath(input.path),
      metadata,
      created_at: createdAt,
    },
  });
  const event = Array.isArray(rows) && rows[0] ? mapAnalyticsEventRow(rows[0]) : null;
  if (!event?.id) {
    throw new Error("Supabase did not return the created analytics event.");
  }

  await syncVisitAggregates(createdAt);
  return event;
};

module.exports = {
  getTotals,
  listDailyStats,
  listVisitEvents,
  recordVisit,
};
