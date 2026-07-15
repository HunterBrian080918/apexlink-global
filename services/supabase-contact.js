const {
  createConversationWithFirstMessage,
  getConversationById,
} = require("./supabase-support");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ADMIN_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

const requireConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
    throw new Error(
      "Supabase contact service is not configured. Set SUPABASE_URL and either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
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

const nowIso = () => new Date().toISOString();
const sanitizeText = (value) => String(value || "").trim();
const toNullableText = (value) => {
  const normalized = sanitizeText(value);
  return normalized || null;
};

const validateContactPayload = (input = {}) => {
  const payload = {
    name: sanitizeText(input.name || input.customerName),
    email: sanitizeText(input.email),
    subject: sanitizeText(input.subject),
    message: sanitizeText(input.message || input.text),
    company: sanitizeText(input.company),
    phone: sanitizeText(input.phone || input.customerPhone),
    country: sanitizeText(input.country || input.customerCountry),
  };

  if (!payload.name || !payload.email || !payload.subject || !payload.message) {
    throw new Error("Name, email, subject, and message are required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    throw new Error("A valid email address is required.");
  }

  return payload;
};

const createContactInquiry = async (input = {}) => {
  const payload = validateContactPayload(input);
  const supportResult = await createConversationWithFirstMessage({
    source: "contact",
    conversationType: "general_contact",
    customerName: payload.name,
    email: payload.email,
    customerPhone: payload.phone,
    country: payload.country,
    subject: payload.subject,
    message: payload.company ? `Company: ${payload.company}\n\n${payload.message}` : payload.message,
  });
  const conversation =
    supportResult?.conversation?.id ? supportResult.conversation : await getConversationById(supportResult?.conversation?.id);

  const rows = await requestSupabase("contact_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      customer_id: toNullableText(conversation?.customerId),
      source: "contact",
      status: "unprocessed",
      customer_name: payload.name,
      email: payload.email,
      phone: toNullableText(payload.phone),
      country: toNullableText(payload.country),
      product_interest: payload.subject,
      message: payload.message,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  });

  return {
    contactMessage: Array.isArray(rows) ? rows[0] || null : null,
    conversation: supportResult.conversation,
    firstMessage: supportResult.message,
  };
};

module.exports = {
  createContactInquiry,
  validateContactPayload,
};
