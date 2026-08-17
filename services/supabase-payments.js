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
const PAYMENT_STAGE_UNIQUE_INDEX = "payments_order_stage_unique";
const getMissingPaymentColumns = (error) => {
  const message = String(error?.message || "");
  const candidateColumns = [
    "payment_provider",
    "settlement_channel",
    "transaction_id",
    "paypal_order_id",
    "paypal_capture_id",
    "payment_proof_url",
    "note",
  ];

  return candidateColumns.filter((columnName) => {
    const bareColumnMessage =
      message.includes(`column payments.${columnName} does not exist`) ||
      message.includes(`column ${columnName} does not exist`) ||
      message.includes(`Could not find the '${columnName}' column of 'payments' in the schema cache`);
    return bareColumnMessage;
  });
};
const withMissingColumnRetries = async (executor, payload) => {
  const body = payload;
  const removedColumns = new Set();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await executor(body);
    } catch (error) {
      const missingColumns = getMissingPaymentColumns(error).filter((columnName) => !removedColumns.has(columnName));
      if (!missingColumns.length) {
        throw error;
      }
      missingColumns.forEach((columnName) => {
        removedColumns.add(columnName);
        delete body[columnName];
      });
    }
  }

  return executor(body);
};

const parseAmount = (value, fallback = 0) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toNullableText = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
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

const isRevenueStatus = (value) =>
  new Set(["paid", "deposit_paid", "partially_paid"]).has(normalizePaymentStatus(value || "pending"));

const mapPaymentRow = (row) => ({
  id: String(row?.id || ""),
  paymentId: String(row?.payment_id || row?.id || "").trim(),
  orderId: String(row?.order_id || "").trim(),
  product: String(row?.product || "").trim(),
  customer: String(row?.customer || "").trim(),
  orderType: String(row?.order_type || row?.purchase_mode || "retail").trim().toLowerCase(),
  paymentType: normalizePaymentType(row?.payment_type),
  paymentMethod: String(row?.payment_method || "").trim(),
  paymentProvider: String(row?.payment_provider || "").trim(),
  settlementChannel: String(row?.settlement_channel || "").trim(),
  amount: Number(row?.amount || 0),
  currency: String(row?.currency || "USD").trim().toUpperCase(),
  depositAmount: Number(row?.deposit_amount || 0),
  balanceAmount: Number(row?.balance_amount || 0),
  billingAddress: String(row?.billing_address || "").trim(),
  customerEmail: String(row?.customer_email || "").trim(),
  customerPhone: String(row?.customer_phone || "").trim(),
  transactionId: String(row?.transaction_id || "").trim(),
  providerReference: String(row?.transaction_id || "").trim(),
  paypalOrderId: String(row?.paypal_order_id || "").trim(),
  paypalCaptureId: String(row?.paypal_capture_id || "").trim(),
  paymentProofUrl: String(row?.payment_proof_url || "").trim(),
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

const getPaymentByOrderAndType = async (orderId, paymentType) => {
  const normalizedOrderId = String(orderId || "").trim();
  const normalizedPaymentType = normalizePaymentType(paymentType);
  if (!normalizedOrderId || normalizedPaymentType === "refund") {
    return null;
  }

  const rows = await requestSupabase(
    `payments?select=*&order_id=eq.${escapeFilterValue(normalizedOrderId)}&payment_type=eq.${escapeFilterValue(normalizedPaymentType)}&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? mapPaymentRow(rows[0]) : null;
};

const isPaymentStageUniqueViolation = (error) => {
  const code = String(error?.payload?.code || error?.code || "").trim();
  const message = String(error?.message || "");
  return code === "23505" && (
    message.includes(PAYMENT_STAGE_UNIQUE_INDEX) ||
    /\(order_id,\s*payment_type\)/i.test(message)
  );
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

const getPaymentByPayPalOrderId = async (paypalOrderId) => {
  const normalized = String(paypalOrderId || "").trim();
  if (!normalized) {
    return null;
  }

  const rows = await requestSupabase(
    `payments?select=*&paypal_order_id=eq.${escapeFilterValue(normalized)}&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? mapPaymentRow(rows[0]) : null;
};

const getPaymentByPayPalCaptureId = async (paypalCaptureId) => {
  const normalized = String(paypalCaptureId || "").trim();
  if (!normalized) {
    return null;
  }

  const rows = await requestSupabase(
    `payments?select=*&paypal_capture_id=eq.${escapeFilterValue(normalized)}&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? mapPaymentRow(rows[0]) : null;
};

const hasDepositConfiguration = (order) =>
  parseAmount(order?.depositPercentage, 0) > 0 || parseAmount(order?.depositAmount, 0) > 0;

const isSettledPayment = (payment) =>
  new Set(["paid", "deposit_paid"]).has(normalizePaymentStatus(payment?.status || "pending"));

const resolveNextPaymentStage = (order, existingPayments) => {
  const items = Array.isArray(existingPayments) ? existingPayments : [];
  const findPayment = (type) => items.find((payment) => payment.paymentType === type) || null;
  const fullPayment = findPayment("full-payment");

  if ((order?.purchaseMode || "") !== "wholesale") {
    return {
      paymentType: isSettledPayment(fullPayment) ? "" : "full-payment",
      payment: fullPayment,
      complete: isSettledPayment(fullPayment),
    };
  }

  if (!hasDepositConfiguration(order)) {
    return {
      paymentType: isSettledPayment(fullPayment) ? "" : "full-payment",
      payment: fullPayment,
      complete: isSettledPayment(fullPayment),
    };
  }

  const depositPayment = findPayment("deposit");
  if (!isSettledPayment(depositPayment)) {
    return {
      paymentType: "deposit",
      payment: depositPayment,
      complete: false,
    };
  }

  const balancePayment = findPayment("balance");
  return {
    paymentType: isSettledPayment(balancePayment) ? "" : "balance",
    payment: balancePayment,
    complete: isSettledPayment(balancePayment),
  };
};

const getNextPaymentType = (order, existingPayments) =>
  resolveNextPaymentStage(order, existingPayments).paymentType;

const deriveAmountByType = (order, paymentType) => {
  const total = parseAmount(order?.totalAmount || order?.subtotal, 0);
  const configuredDeposit = parseAmount(order?.depositAmount, 0);
  const depositPercentage = parseAmount(order?.depositPercentage, 0);
  const deposit = configuredDeposit > 0 ? configuredDeposit : total * (depositPercentage / 100);

  if (paymentType === "deposit") {
    return Math.min(total, Math.max(0, deposit));
  }

  if (paymentType === "balance") {
    const configuredBalance = parseAmount(order?.balanceAmount, 0);
    return configuredBalance > 0 ? configuredBalance : Math.max(0, total - deposit);
  }

  return total;
};

const deriveOrderPaymentStatus = (order, payments) => {
  const items = Array.isArray(payments) ? payments : [];
  if (!items.length) {
    return "unpaid";
  }

  const paidItems = items.filter(
    (payment) => payment.paymentType !== "refund" && isSettledPayment(payment)
  );
  const paidAmount = paidItems.reduce((total, payment) => total + parseAmount(payment.amount, 0), 0);
  const orderTotal = parseAmount(order?.totalAmount || order?.subtotal, 0);
  const hasDepositPaid = paidItems.some((payment) => payment.paymentType === "deposit");
  const hasRefund = items.some((payment) => normalizePaymentStatus(payment.status) === "refunded");
  const hasPartialRefund = items.some((payment) => normalizePaymentStatus(payment.status) === "partially_refunded");

  if (orderTotal > 0 && paidAmount >= orderTotal - 0.005) {
    return hasRefund || hasPartialRefund ? "partially_refunded" : "paid";
  }

  if (hasDepositPaid && hasDepositConfiguration(order)) {
    return hasRefund || hasPartialRefund ? "partially_refunded" : "deposit_paid";
  }

  if (paidAmount > 0 || items.some((payment) => normalizePaymentStatus(payment.status) === "partially_paid")) {
    return "partially_paid";
  }

  if (hasRefund) {
    return "refunded";
  }
  if (hasPartialRefund) {
    return "partially_refunded";
  }
  if (items.some((payment) => ["pending", "awaiting_payment", "payment_submitted"].includes(normalizePaymentStatus(payment.status)))) {
    return "pending";
  }
  if (items.every((payment) => normalizePaymentStatus(payment.status) === "failed")) {
    return "failed";
  }
  if (items.every((payment) => normalizePaymentStatus(payment.status) === "cancelled")) {
    return "cancelled";
  }
  return "unpaid";
};

const syncOrderPaymentStatus = async (orderId, options = {}) => {
  const order = await getOrderById(orderId);
  if (!order?.id) {
    throw new Error("Order not found while synchronizing payment status.");
  }
  const payments = await listPaymentsByOrder(order.id);
  const paymentStatus = deriveOrderPaymentStatus(order, payments);
  if (String(order.paymentStatus || "unpaid") === paymentStatus) {
    return order;
  }
  return updateOrder(
    order.id,
    { paymentStatus },
    {
      createEvents: true,
      createdBy: String(options.createdBy || "system").trim() || "system",
    }
  );
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
  const stage = resolveNextPaymentStage(order, existingPayments);
  const requestedType = String(input?.paymentType || "").trim();
  const paymentType = normalizePaymentType(requestedType || stage.paymentType);

  if (!stage.paymentType) {
    throw new Error("All required payment records for this order have already been created.");
  }

  if (paymentType !== stage.paymentType) {
    throw new Error(`The next required payment stage is ${stage.paymentType}.`);
  }

  if (stage.payment?.id) {
    return {
      payment: stage.payment,
      order,
      idempotent: true,
    };
  }

  const amount = deriveAmountByType(order, paymentType);
  if (!(amount > 0)) {
    throw new Error("The order payment amount is unavailable.");
  }
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
    payment_provider: String(input?.paymentProvider || "").trim() || null,
    settlement_channel: String(input?.settlementChannel || "").trim() || null,
    amount,
    currency: String(order.currency || input?.currency || "USD").trim().toUpperCase(),
    deposit_amount: depositAmount,
    balance_amount: balanceAmount,
    billing_address: String(order.billingAddress || order.shippingAddress || "").trim() || null,
    customer_email: String(order.email || "").trim().toLowerCase() || null,
    customer_phone: String(order.phone || "").trim() || null,
    status: normalizePaymentStatus(input?.status || "pending"),
    created_at: nowIso(),
    updated_at: nowIso(),
    paid_at:
      String(input?.status || "").trim().toLowerCase() === "paid" ? String(input?.paidAt || nowIso()) : null,
    ...(toNullableText(input?.transactionId || input?.providerReference)
      ? { transaction_id: toNullableText(input?.transactionId || input?.providerReference) }
      : {}),
    ...(toNullableText(input?.paypalOrderId) ? { paypal_order_id: toNullableText(input?.paypalOrderId) } : {}),
    ...(toNullableText(input?.paypalCaptureId)
      ? { paypal_capture_id: toNullableText(input?.paypalCaptureId) }
      : {}),
    ...(toNullableText(input?.paymentProofUrl)
      ? { payment_proof_url: toNullableText(input?.paymentProofUrl) }
      : {}),
    ...(toNullableText(input?.note) ? { note: toNullableText(input?.note) } : {}),
  };

  let createdRows;
  try {
    try {
      createdRows = await withMissingColumnRetries(
        (body) =>
          requestSupabase("payments", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body,
          }),
        insertPayload
      );
    } catch (error) {
      const message = String(error?.message || "");
      if (!/check constraint/i.test(message) || !/status/i.test(message)) {
        throw error;
      }
      insertPayload.status = "pending";
      createdRows = await withMissingColumnRetries(
        (body) =>
          requestSupabase("payments", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body,
          }),
        insertPayload
      );
    }
  } catch (error) {
    if (!isPaymentStageUniqueViolation(error)) {
      throw error;
    }

    const existingPayment = await getPaymentByOrderAndType(order.id, paymentType);
    if (!existingPayment?.id) {
      throw error;
    }

    return {
      payment: existingPayment,
      order: (await getOrderById(order.id)) || order,
      idempotent: true,
    };
  }

  const createdPayment = Array.isArray(createdRows) && createdRows[0] ? mapPaymentRow(createdRows[0]) : null;
  if (!createdPayment?.id) {
    throw new Error("Supabase did not return the created payment.");
  }

  await updateOrder(
    order.id,
    {
      paymentMethod,
    },
    {
      createEvents: true,
      createdBy: "customer",
    }
  );
  const updatedOrder = await syncOrderPaymentStatus(order.id, { createdBy: "customer" });

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
    idempotent: false,
  };
};

const reviewBankTransferPayment = async (paymentId, nextStatus, options = {}) => {
  const normalizedPaymentId = String(paymentId || "").trim();
  const normalizedStatus = String(nextStatus || "").trim().toLowerCase();
  if (!normalizedPaymentId) {
    throw new Error("Payment id is required.");
  }
  if (!new Set(["paid", "failed"]).has(normalizedStatus)) {
    throw new Error("Bank transfer review status must be paid or failed.");
  }

  let result;
  try {
    result = await requestSupabase("rpc/review_bank_transfer_payment", {
      method: "POST",
      body: {
        p_payment_id: normalizedPaymentId,
        p_next_status: normalizedStatus,
        p_created_by: String(options.createdBy || "admin").trim() || "admin",
      },
    });
  } catch (error) {
    if (/review_bank_transfer_payment|schema cache|function/i.test(String(error?.message || ""))) {
      error.status = 503;
      error.message =
        "Atomic bank transfer confirmation is unavailable. Apply the Phase 1 payment integrity migration.";
    }
    throw error;
  }

  const payment = await getPaymentById(normalizedPaymentId);
  const order = payment?.orderId ? await getOrderById(payment.orderId) : null;
  if (!payment?.id || !order?.id) {
    throw new Error("Atomic bank transfer confirmation did not return persisted records.");
  }

  return {
    payment,
    order,
    idempotent: Boolean(result?.idempotent),
  };
};

const updatePayment = async (paymentId, partial, options = {}) => {
  const normalizedPaymentId = String(paymentId || "").trim();
  if (!normalizedPaymentId) {
    throw new Error("Payment id is required.");
  }
  const createdBy = String(options.createdBy || "admin").trim() || "admin";

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
    if (partial?.transactionId === undefined) {
      patch.transaction_id = String(partial.providerReference || "").trim() || null;
    }
  }

  if (partial?.settlementChannel !== undefined) {
    patch.settlement_channel = String(partial.settlementChannel || "").trim() || null;
  }

  if (partial?.transactionId !== undefined) {
    patch.transaction_id = String(partial.transactionId || "").trim() || null;
  }

  if (partial?.paymentProvider !== undefined) {
    patch.payment_provider = String(partial.paymentProvider || "").trim() || null;
  }

  if (partial?.paypalOrderId !== undefined) {
    patch.paypal_order_id = String(partial.paypalOrderId || "").trim() || null;
  }

  if (partial?.paypalCaptureId !== undefined) {
    patch.paypal_capture_id = String(partial.paypalCaptureId || "").trim() || null;
  }

  if (partial?.paymentProofUrl !== undefined) {
    patch.payment_proof_url = String(partial.paymentProofUrl || "").trim() || null;
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
    updatedRows = await withMissingColumnRetries(
      (body) =>
        requestSupabase(`payments?id=eq.${escapeFilterValue(normalizedPaymentId)}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body,
        }),
      patch
    );
  } catch (error) {
    const message = String(error?.message || "");
    if (/check constraint/i.test(message) && /status/i.test(message) && patch.status) {
      patch.status =
        patch.status === "paid" || patch.status === "failed" || patch.status === "refunded" ? patch.status : "pending";
      updatedRows = await withMissingColumnRetries(
        (body) =>
          requestSupabase(`payments?id=eq.${escapeFilterValue(normalizedPaymentId)}`, {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body,
          }),
        patch
      );
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
        createdBy,
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
        createdBy,
        metadata: {
          paymentId: updatedPayment.id,
          paymentType: updatedPayment.paymentType,
        },
      });
    }
  }

  if (options.syncOrder !== false) {
    await syncOrderPaymentStatus(updatedPayment.orderId, { createdBy });
  }

  return updatedPayment;
};

module.exports = {
  listPayments,
  getPaymentById,
  listPaymentsByOrder,
  getPaymentByPayPalOrderId,
  getPaymentByPayPalCaptureId,
  getPaymentByOrderAndType,
  createPaymentForOrder,
  reviewBankTransferPayment,
  updatePayment,
  resolveNextPaymentStage,
  deriveOrderPaymentStatus,
  syncOrderPaymentStatus,
  isRevenueStatus,
};
