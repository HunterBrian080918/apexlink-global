const { getOrderById, updateOrder, createOrderEvent } = require("./supabase-orders");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ADMIN_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

const requireConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
    throw new Error(
      "Supabase payments service is not configured. Set SUPABASE_URL and either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
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

const escapeFilterValue = (value) => encodeURIComponent(String(value || "").trim());
const nowIso = () => new Date().toISOString();

const parseAmount = (value, fallback = 0) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

const formatPaymentStatusLabel = (status) =>
  String(status || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (part) => part.toUpperCase()) || "Pending";

const PAYMENT_TYPES = new Set(["deposit", "full-payment", "balance", "refund"]);
const PAYMENT_STATUSES = new Set([
  "pending",
  "awaiting_payment",
  "payment_submitted",
  "paid",
  "failed",
  "refunded",
  "unpaid",
  "deposit_paid",
  "partially_paid",
  "partially_refunded",
  "cancelled",
  "awaiting-payment",
  "payment-submitted",
]);

const normalizePaymentType = (value) => {
  const normalized = String(value || "full-payment")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return PAYMENT_TYPES.has(normalized) ? normalized : "full-payment";
};

const normalizePaymentStatus = (value) => {
  const normalized = String(value || "pending")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  if (!PAYMENT_STATUSES.has(normalized) && !PAYMENT_STATUSES.has(normalized.replace(/_/g, "-"))) {
    throw new Error("Invalid payment status.");
  }

  return normalized;
};

const mapPaymentRow = (row) => ({
  id: String(row?.id || ""),
  paymentId: String(row?.payment_id || row?.id || "").trim(),
  orderId: String(row?.order_id || "").trim(),
  product: String(row?.product || "").trim(),
  customer: String(row?.customer || "").trim(),
  orderType: String(row?.order_type || row?.purchase_mode || "retail").trim().toLowerCase(),
  paymentType: normalizePaymentType(row?.payment_type),
  paymentMethod: String(row?.payment_method || "").trim(),
  settlementChannel: String(row?.settlement_channel || "").trim(),
  amount: Number(row?.amount || 0),
  currency: String(row?.currency || "USD").trim().toUpperCase(),
  depositAmount: Number(row?.deposit_amount || 0),
  balanceAmount: Number(row?.balance_amount || 0),
  billingAddress: String(row?.billing_address || "").trim(),
  customerEmail: String(row?.customer_email || "").trim(),
  customerPhone: String(row?.customer_phone || "").trim(),
  providerReference: String(row?.provider_reference || "").trim(),
  note: String(row?.note || "").trim(),
  status: String(row?.status || "pending")
    .trim()
    .toLowerCase(),
  statusLabel: formatPaymentStatusLabel(row?.status || "pending"),
  createdAt: String(row?.created_at || ""),
  updatedAt: String(row?.updated_at || row?.created_at || ""),
  paidAt: String(row?.paid_at || "").trim(),
});

const listPayments = async () => {
  const rows = await requestSupabase("payments?select=*&order=created_at.desc");
  return Array.isArray(rows) ? rows.map(mapPaymentRow) : [];
};

const getPaymentById = async (id) => {
  const paymentId = String(id || "").trim();
  if (!paymentId) {
    return null;
  }

  const rows = await requestSupabase(`payments?select=*&id=eq.${escapeFilterValue(paymentId)}&limit=1`);
  return Array.isArray(rows) && rows[0] ? mapPaymentRow(rows[0]) : null;
};

const listPaymentsByOrder = async (orderId) => {
  const normalizedOrderId = String(orderId || "").trim();
  if (!normalizedOrderId) {
    return [];
  }

  const rows = await requestSupabase(
    `payments?select=*&order_id=eq.${escapeFilterValue(normalizedOrderId)}&order=created_at.asc`
  );
  return Array.isArray(rows) ? rows.map(mapPaymentRow) : [];
};

const hasDepositConfiguration = (order) =>
  parseAmount(order?.depositPercentage, 0) > 0 || parseAmount(order?.depositAmount, 0) > 0;

const getNextPaymentType = (order, existingPayments) => {
  const items = Array.isArray(existingPayments) ? existingPayments : [];
  const hasDeposit = items.some((payment) => payment.paymentType === "deposit");
  const hasBalance = items.some((payment) => payment.paymentType === "balance");
  const hasFullPayment = items.some((payment) => payment.paymentType === "full-payment");

  if ((order?.purchaseMode || "") !== "wholesale") {
    return hasFullPayment ? "" : "full-payment";
  }

  if (!hasDepositConfiguration(order)) {
    return hasFullPayment ? "" : "full-payment";
  }

  if (!hasDeposit) {
    return "deposit";
  }

  if (!hasBalance) {
    return "balance";
  }

  return "";
};

const deriveAmountByType = (order, paymentType, requestedAmount) => {
  const fallbackSubtotal = parseAmount(order?.subtotal, 0);
  if (requestedAmount > 0) {
    return requestedAmount;
  }

  if (paymentType === "deposit") {
    return parseAmount(order?.depositAmount, fallbackSubtotal);
  }

  if (paymentType === "balance") {
    return parseAmount(order?.balanceAmount, fallbackSubtotal);
  }

  return fallbackSubtotal;
};

const createPaymentForOrder = async (orderId, input) => {
  const normalizedOrderId = String(orderId || "").trim();
  if (!normalizedOrderId) {
    throw new Error("Order id is required.");
  }

  const order = await getOrderById(normalizedOrderId);
  if (!order?.id) {
    throw new Error("Order not found.");
  }

  const existingPayments = await listPaymentsByOrder(order.id);
  const requestedType = String(input?.paymentType || "").trim();
  const paymentType = normalizePaymentType(requestedType || getNextPaymentType(order, existingPayments));

  if (!paymentType) {
    throw new Error("All required payment records for this order have already been created.");
  }

  if (existingPayments.some((payment) => payment.paymentType === paymentType)) {
    throw new Error(`A ${paymentType} payment record already exists for this order.`);
  }

  const requestedAmount = parseAmount(input?.amount, 0);
  const amount = deriveAmountByType(order, paymentType, requestedAmount);
  const depositAmount = paymentType === "deposit" ? amount : parseAmount(input?.depositAmount, 0);
  const balanceAmount = paymentType === "balance" ? amount : parseAmount(input?.balanceAmount, 0);
  const paymentMethod = String(input?.paymentMethod || "").trim();

  if (!paymentMethod) {
    throw new Error("Payment method is required.");
  }

  const insertPayload = {
    order_id: order.id,
    product: String(order.productName || "").trim() || null,
    customer: String(order.customerName || "").trim() || null,
    order_type: String(order.purchaseMode || "retail").trim().toLowerCase(),
    payment_type: paymentType,
    payment_method: paymentMethod,
    amount,
    currency: String(order.currency || input?.currency || "USD").trim().toUpperCase(),
    deposit_amount: depositAmount,
    balance_amount: balanceAmount,
    billing_address: String(order.billingAddress || order.shippingAddress || "").trim() || null,
    customer_email: String(order.email || "").trim().toLowerCase() || null,
    customer_phone: String(order.phone || "").trim() || null,
    provider_reference: String(input?.providerReference || "").trim() || null,
    note: String(input?.note || "").trim() || null,
    status: normalizePaymentStatus(input?.status || "pending"),
    created_at: nowIso(),
    updated_at: nowIso(),
    paid_at:
      String(input?.status || "").trim().toLowerCase() === "paid" ? String(input?.paidAt || nowIso()) : null,
  };

  let createdRows;
  try {
    createdRows = await requestSupabase("payments", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: insertPayload,
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (/provider_reference|note/i.test(message)) {
      delete insertPayload.provider_reference;
      delete insertPayload.note;
      createdRows = await requestSupabase("payments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: insertPayload,
      });
    } else if (/check constraint/i.test(message) && /status/i.test(message)) {
      insertPayload.status = "pending";
      createdRows = await requestSupabase("payments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: insertPayload,
      });
    } else {
      throw error;
    }
  }

  const createdPayment = Array.isArray(createdRows) && createdRows[0] ? mapPaymentRow(createdRows[0]) : null;
  if (!createdPayment?.id) {
    throw new Error("Supabase did not return the created payment.");
  }

  const nextOrderPaymentStatus = paymentType === "deposit" ? "pending" : "pending";
  const updatedOrder = await updateOrder(
    order.id,
    {
      paymentMethod,
      paymentStatus: nextOrderPaymentStatus,
    },
    {
      createEvents: true,
      createdBy: "customer",
    }
  );

  await createOrderEvent(order.id, {
    eventType: "payment_created",
    title: "Payment record created",
    description: `${createdPayment.paymentType} payment record created with ${paymentMethod}.`,
    createdBy: "customer",
    metadata: {
      paymentId: createdPayment.id,
      paymentType: createdPayment.paymentType,
      status: createdPayment.status,
    },
  });

  return {
    payment: createdPayment,
    order: updatedOrder,
  };
};

const updatePayment = async (paymentId, partial) => {
  const normalizedPaymentId = String(paymentId || "").trim();
  if (!normalizedPaymentId) {
    throw new Error("Payment id is required.");
  }

  const existing = await getPaymentById(normalizedPaymentId);
  if (!existing?.id) {
    throw new Error("Payment not found.");
  }

  const patch = {
    updated_at: nowIso(),
  };

  if (partial?.paymentMethod !== undefined) {
    patch.payment_method = String(partial.paymentMethod || "").trim() || null;
  }

  if (partial?.providerReference !== undefined) {
    patch.provider_reference = String(partial.providerReference || "").trim() || null;
  }

  if (partial?.note !== undefined) {
    patch.note = String(partial.note || "").trim() || null;
  }

  if (partial?.status !== undefined) {
    patch.status = normalizePaymentStatus(partial.status);
    patch.paid_at = patch.status === "paid" ? String(partial?.paidAt || nowIso()) : null;
  } else if (partial?.paidAt !== undefined) {
    patch.paid_at = String(partial.paidAt || "").trim() || null;
  }

  let updatedRows;
  try {
    updatedRows = await requestSupabase(`payments?id=eq.${escapeFilterValue(normalizedPaymentId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: patch,
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (/provider_reference|note/i.test(message)) {
      delete patch.provider_reference;
      delete patch.note;
      updatedRows = await requestSupabase(`payments?id=eq.${escapeFilterValue(normalizedPaymentId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: patch,
      });
    } else if (/check constraint/i.test(message) && /status/i.test(message) && patch.status) {
      patch.status =
        patch.status === "paid" || patch.status === "failed" || patch.status === "refunded" ? patch.status : "pending";
      updatedRows = await requestSupabase(`payments?id=eq.${escapeFilterValue(normalizedPaymentId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: patch,
      });
    } else {
      throw error;
    }
  }

  const updatedPayment = Array.isArray(updatedRows) && updatedRows[0] ? mapPaymentRow(updatedRows[0]) : null;
  if (!updatedPayment?.id) {
    throw new Error("Supabase did not return the updated payment.");
  }

  if (existing.status !== updatedPayment.status) {
    if (updatedPayment.status === "paid") {
      await createOrderEvent(updatedPayment.orderId, {
        eventType: "payment_marked_paid",
        title: "Payment marked paid",
        description: `${formatPaymentStatusLabel(updatedPayment.paymentType)} payment was marked paid.`,
        createdBy: "admin",
        metadata: {
          paymentId: updatedPayment.id,
          paymentType: updatedPayment.paymentType,
        },
      });
    } else if (updatedPayment.status === "refunded") {
      await createOrderEvent(updatedPayment.orderId, {
        eventType: "refunded",
        title: "Refund recorded",
        description: `${formatPaymentStatusLabel(updatedPayment.paymentType)} payment was marked refunded.`,
        createdBy: "admin",
        metadata: {
          paymentId: updatedPayment.id,
          paymentType: updatedPayment.paymentType,
        },
      });
    }
  }

  return updatedPayment;
};

module.exports = {
  listPayments,
  getPaymentById,
  listPaymentsByOrder,
  createPaymentForOrder,
  updatePayment,
};
