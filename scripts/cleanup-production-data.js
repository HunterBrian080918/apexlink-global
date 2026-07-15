require("dotenv").config();

const baseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const execute = process.argv.includes("--execute");
const TEST_MARKERS = [
  "LAUNCH-AUDIT",
  "UI Polish Test",
  "Takane Seiya",
  "Dummy",
  "FINAL-LAUNCH",
  "CONCURRENCY-TEST",
  "TEST Retail",
  "TEST Wholesale",
];
const TEST_EMAIL_PATTERNS = ["example.com"];
const TABLES = [
  "orders",
  "customers",
  "payments",
  "support_conversations",
  "support_messages",
  "contact_messages",
  "admin_notifications",
];

if (!baseUrl || !key) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
}

const request = async (table, options = {}) => {
  const response = await fetch(`${baseUrl}/rest/v1/${table}${options.query || ""}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: options.prefer || "return=representation",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text
    ? (() => {
        try {
          return JSON.parse(text);
        } catch (error) {
          return text;
        }
      })()
    : null;

  if (!response.ok) {
    throw new Error(`${table}: ${response.status} ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }

  return payload;
};

const matchesTestMarker = (value) => {
  const text = String(value || "").toLowerCase();
  if (!text) {
    return false;
  }

  if (TEST_MARKERS.some((marker) => text.includes(marker.toLowerCase()))) {
    return true;
  }

  return TEST_EMAIL_PATTERNS.some((pattern) => text.includes(pattern.toLowerCase()));
};

const rowContainsTestMarker = (value) => {
  if (value == null) {
    return false;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return matchesTestMarker(value);
  }

  if (Array.isArray(value)) {
    return value.some(rowContainsTestMarker);
  }

  if (typeof value === "object") {
    return Object.values(value).some(rowContainsTestMarker);
  }

  return false;
};

const getTableKeyColumn = (table) => {
  if (table === "support_messages") {
    return "id,conversation_id";
  }

  return "id";
};

const deleteRowById = async (table, id) => {
  await request(table, {
    method: "DELETE",
    query: `?id=eq.${encodeURIComponent(String(id))}`,
    prefer: "return=minimal",
  });
};

const main = async () => {
  const summary = {};

  for (const table of TABLES) {
    try {
      const rows = await request(table, {
        query: `?select=*&limit=1000`,
      });
      const matches = (Array.isArray(rows) ? rows : []).filter(rowContainsTestMarker);
      summary[table] = {
        scanned: Array.isArray(rows) ? rows.length : 0,
        matched: matches.length,
        ids: matches.map((row) => row.id),
      };

      if (execute) {
        for (const row of matches) {
          await deleteRowById(table, row.id);
        }
      }
    } catch (error) {
      summary[table] = {
        error: error.message,
      };
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: execute ? "EXECUTE" : "DRY_RUN",
        markers: TEST_MARKERS,
        emailPatterns: TEST_EMAIL_PATTERNS,
        summary,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
