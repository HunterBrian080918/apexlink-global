const PAYPAL_CLIENT_ID = String(process.env.PAYPAL_CLIENT_ID || "").trim();
const PAYPAL_CLIENT_SECRET = String(process.env.PAYPAL_CLIENT_SECRET || "").trim();
const PAYPAL_MODE = String(process.env.PAYPAL_MODE || "sandbox").trim().toLowerCase() === "live" ? "live" : "sandbox";
const PAYPAL_WEBHOOK_ID = String(process.env.PAYPAL_WEBHOOK_ID || "").trim();
const PAYPAL_API_BASE =
  PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

const tokenCache = {
  accessToken: "",
  expiresAt: 0,
};

const requirePayPalConfig = (options = {}) => {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
  }

  if (options.requireWebhookId && !PAYPAL_WEBHOOK_ID) {
    throw new Error("PayPal webhook verification requires PAYPAL_WEBHOOK_ID.");
  }
};

const parseJson = async (response) => {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return { raw: text };
  }
};

const getAccessToken = async () => {
  requirePayPalConfig();

  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 30000) {
    return tokenCache.accessToken;
  }

  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  const payload = await parseJson(response);

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      String(payload?.error_description || payload?.error || `PayPal auth failed with status ${response.status}.`)
    );
  }

  const expiresInMs = Math.max(60, Number(payload.expires_in || 300)) * 1000;
  tokenCache.accessToken = String(payload.access_token || "");
  tokenCache.expiresAt = Date.now() + expiresInMs;
  return tokenCache.accessToken;
};

const paypalRequest = async (pathname, options = {}) => {
  const accessToken = await getAccessToken();
  const response = await fetch(`${PAYPAL_API_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    const message =
      payload?.details?.[0]?.description ||
      payload?.message ||
      payload?.name ||
      `PayPal request failed with status ${response.status}.`;
    const error = new Error(String(message));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const formatAmount = (value) => Number(Number(value || 0).toFixed(2)).toFixed(2);

const findPayPalLink = (payload, rel) =>
  String((Array.isArray(payload?.links) ? payload.links : []).find((item) => String(item?.rel || "").toLowerCase() === rel)?.href || "").trim();

const createOrder = async (input) => {
  const amount = formatAmount(input?.amount || 0);
  if (Number(amount) <= 0) {
    throw new Error("PayPal amount must be greater than zero.");
  }

  const payload = await paypalRequest("/v2/checkout/orders", {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: String(input?.referenceId || "").trim() || undefined,
          custom_id: String(input?.customId || "").trim() || undefined,
          invoice_id: String(input?.invoiceId || "").trim() || undefined,
          description: String(input?.description || "").trim() || undefined,
          amount: {
            currency_code: String(input?.currency || "USD").trim().toUpperCase(),
            value: amount,
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "AvelixLink",
            user_action: "PAY_NOW",
            return_url: String(input?.returnUrl || "").trim(),
            cancel_url: String(input?.cancelUrl || "").trim(),
          },
        },
      },
    },
  });

  return {
    id: String(payload?.id || "").trim(),
    status: String(payload?.status || "").trim(),
    approvalUrl: findPayPalLink(payload, "approve"),
    raw: payload,
  };
};

const extractCapture = (payload) => {
  const units = Array.isArray(payload?.purchase_units) ? payload.purchase_units : [];
  for (const unit of units) {
    const captures = Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [];
    if (captures[0]?.id) {
      return captures[0];
    }
  }
  return null;
};

const captureOrder = async (paypalOrderId) => {
  const normalized = String(paypalOrderId || "").trim();
  if (!normalized) {
    throw new Error("PayPal order id is required.");
  }

  const payload = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(normalized)}/capture`, {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: {},
  });
  const capture = extractCapture(payload);

  return {
    id: normalized,
    status: String(payload?.status || "").trim(),
    captureId: String(capture?.id || "").trim(),
    captureStatus: String(capture?.status || "").trim(),
    paidAt: String(capture?.create_time || capture?.update_time || "").trim(),
    payerEmail: String(payload?.payer?.email_address || "").trim(),
    raw: payload,
  };
};

const verifyWebhookSignature = async ({ headers, eventBody }) => {
  requirePayPalConfig({ requireWebhookId: true });

  const payload = await paypalRequest("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: String(headers?.authAlgo || "").trim(),
      cert_url: String(headers?.certUrl || "").trim(),
      transmission_id: String(headers?.transmissionId || "").trim(),
      transmission_sig: String(headers?.transmissionSig || "").trim(),
      transmission_time: String(headers?.transmissionTime || "").trim(),
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: eventBody,
    },
  });

  return String(payload?.verification_status || "").trim().toUpperCase() === "SUCCESS";
};

const getConfigurationStatus = () => ({
  configured: Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET),
  mode: PAYPAL_MODE,
  webhookConfigured: Boolean(PAYPAL_WEBHOOK_ID),
});

module.exports = {
  createOrder,
  captureOrder,
  verifyWebhookSignature,
  getConfigurationStatus,
};
