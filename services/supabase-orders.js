const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ADMIN_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

const ORDER_CREATE_TIMING_LOG = true;
const SUPPORT_RETRY_COOLDOWN_MS = 5000;
const createSupportState = () => ({
  supported: null,
  checkedAt: 0,
  retryAfter: 0,
  lastError: "",
  pending: null,
});
const orderEventsSupportState = createSupportState();
const shippingStatusSupportState = createSupportState();

const ORDER_REQUIRED_SELECT = ["*"];

const ORDER_ITEM_REQUIRED_SELECT = ["*"];

const requireConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
    throw new Error(
      "Supabase orders service is not configured. Set SUPABASE_URL and either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
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
    const error = new Error(detail || `Supabase request failed with status ${response.status}.`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const escapeFilterValue = (value) => encodeURIComponent(String(value || "").trim());
const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

const formatShippingTime = (value) => {
  const days = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(days) && days > 0 ? `${days} days` : "";
};

const toStatusLabel = (value, fallback = "-") =>
  String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (part) => part.toUpperCase()) || fallback;

const RETAIL_ORDER_STATUSES = new Set([
  "pending_payment",
  "processing",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
]);
const WHOLESALE_ORDER_STATUSES = new Set([
  "inquiry_received",
  "quote_pending",
  "awaiting_confirmation",
  "awaiting_deposit",
  "in_production",
  "quality_inspection",
  "awaiting_balance",
  "ready_to_ship",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
]);
const PAYMENT_STATUSES = new Set([
  "unpaid",
  "pending",
  "deposit_paid",
  "partially_paid",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
  "cancelled",
]);
const SHIPPING_STATUSES = new Set([
  "not_started",
  "preparing",
  "packed",
  "shipped",
  "in_transit",
  "delivered",
  "exception",
]);
const INTERNAL_ORDER_STATUSES = new Set(["unprocessed", "processed"]);

const formatDepositValue = (deposit) => {
  const amount = Number(deposit?.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "";
  }

  if (deposit?.type === "fixed") {
    return formatCurrency(amount);
  }

  return Number.isInteger(amount) ? `${amount}%` : `${amount.toFixed(2)}%`;
};

const getWholesalePriceTiers = (product) =>
  Array.isArray(product?.b2b?.priceTiers)
    ? product.b2b.priceTiers
        .filter((tier) => Number(tier?.unitPrice || 0) > 0)
        .slice()
        .sort((left, right) => Number(left?.minQuantity || 0) - Number(right?.minQuantity || 0))
    : [];

const getWholesaleTierForQuantity = (product, quantity) => {
  const tiers = getWholesalePriceTiers(product);
  if (!tiers.length) {
    return null;
  }

  const nextQuantity = Math.max(1, Number(quantity || 1));
  return (
    tiers.find((tier) => {
      const min = Math.max(1, Number(tier.minQuantity || 1));
      const max = Math.max(0, Number(tier.maxQuantity || 0));
      return nextQuantity >= min && (max === 0 || nextQuantity <= max);
    }) || tiers[tiers.length - 1]
  );
};

const nowIso = () => new Date().toISOString();
const nowMs = () => Date.now();
const currentDateStamp = () => {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const createOrderHeaderWithNumber = async (orderRow, dateKey) => {
  try {
    const payload = await requestSupabase("rpc/create_order_with_number", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        p_order: orderRow,
        p_date_key: String(dateKey || "").trim() || null,
      },
    });

    if (Array.isArray(payload)) {
      return payload[0] || null;
    }

    return payload && typeof payload === "object" ? payload : null;
  } catch (error) {
    const message = String(error?.message || "");
    if (/create_order_with_number/i.test(message) && /does not exist|Could not find/i.test(message)) {
      throw new Error(
        "Supabase order-number RPC is not available. Run migration 20260713000100_orders_concurrency_safe_numbers.sql."
      );
    }
    throw error;
  }
};

const getOrCreateCustomer = async (input) => {
  const email = String(input.email || "").trim().toLowerCase();
  if (email) {
    const existingRows = await requestSupabase(`customers?select=id,name,email,phone,country&email=eq.${escapeFilterValue(email)}&limit=1`);
    if (Array.isArray(existingRows) && existingRows[0]?.id) {
      return existingRows[0];
    }
  }

  const createdRows = await requestSupabase("customers", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      name: String(input.customerName || "").trim() || null,
      email: email || null,
      phone: String(input.phone || "").trim() || null,
      country: String(input.country || "").trim() || null,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  });

  return Array.isArray(createdRows) ? createdRows[0] : null;
};

const selectLeanProduct = async (productId) => {
  const productRows = await requestSupabase(
    `products?select=id,name,image_url,shipping_days,shipping_time,moq_value,b2c_retail_price,b2b_wholesale_moq,b2b_wholesale_lead_time,b2b_deposit_terms,b2b_deposit_required,b2b_deposit_type,b2b_deposit_value,b2b_custom_payment_terms&id=eq.${escapeFilterValue(productId)}&limit=1`
  );
  const productRow = Array.isArray(productRows) ? productRows[0] : null;
  if (!productRow) {
    return null;
  }

  const tierRows = await requestSupabase(
    `product_price_tiers?select=id,min_quantity,max_quantity,unit_price,sort_order&product_id=eq.${escapeFilterValue(productId)}&order=sort_order.asc`
  );

  return {
    id: String(productRow.id || ""),
    name: String(productRow.name || ""),
    image: String(productRow.image_url || ""),
    shippingDays: Number(productRow.shipping_days || 1),
    shippingTime: String(productRow.shipping_time || ""),
    moqValue: Number(productRow.moq_value || 1),
    b2c: {
      retailPrice: Number(productRow.b2c_retail_price || 0),
    },
    b2b: {
      wholesaleMoq: Number(productRow.b2b_wholesale_moq || 1),
      wholesaleLeadTime: Number(productRow.b2b_wholesale_lead_time || 1),
      depositTerms: String(productRow.b2b_deposit_terms || ""),
      deposit: {
        required: Boolean(productRow.b2b_deposit_required),
        type: String(productRow.b2b_deposit_type || "percentage"),
        value: Number(productRow.b2b_deposit_value || 0),
        customPaymentTerms: String(productRow.b2b_custom_payment_terms || productRow.b2b_deposit_terms || ""),
      },
      priceTiers: (Array.isArray(tierRows) ? tierRows : []).map((tier) => ({
        id: String(tier.id || ""),
        minQuantity: Number(tier.min_quantity || 1),
        maxQuantity: tier.max_quantity === null || tier.max_quantity === undefined ? 0 : Number(tier.max_quantity || 0),
        unitPrice: Number(tier.unit_price || 0),
      })),
    },
  };
};

const mapOrderRow = (row, itemRows = []) => {
  const orderNumber = String(row.order_number || row.order_id || row.id || "").trim();
  const shippingAmount = Number(row.shipping_amount || 0);
  const taxAmount = Number(row.tax_amount || 0);
  const discountAmount = Number(row.discount_amount || 0);
  const subtotalValue = Number(row.subtotal || 0);
  const purchaseMode = String(row.purchase_mode || "retail").trim().toLowerCase() === "wholesale" ? "wholesale" : "retail";
  const fallbackDepositPercentage =
    row.deposit_percentage !== undefined && row.deposit_percentage !== null
      ? String(row.deposit_percentage || "").trim()
      : "";
  const computedDepositAmount =
    row.deposit_amount !== undefined && row.deposit_amount !== null
      ? Number(row.deposit_amount || 0)
      : purchaseMode === "wholesale" && fallbackDepositPercentage
        ? subtotalValue * ((Number(String(fallbackDepositPercentage).replace(/[^\d.-]/g, "")) || 0) / 100)
        : 0;
  const computedBalanceAmount =
    row.balance_amount !== undefined && row.balance_amount !== null
      ? Number(row.balance_amount || 0)
      : Math.max(0, subtotalValue - computedDepositAmount);
  const totalAmount =
    row.total_amount !== undefined && row.total_amount !== null
      ? Number(row.total_amount || 0)
      : Math.max(0, subtotalValue + shippingAmount + taxAmount - discountAmount);

  return {
    id: String(row.id || ""),
    orderId: orderNumber || String(row.id || ""),
    orderNumber: orderNumber || String(row.id || ""),
    source: String(row.order_source || row.source || "website"),
    salesChannel: String(row.sales_channel || (purchaseMode === "wholesale" ? "wholesale" : "retail")),
    status: String(row.status || "unprocessed"),
    orderStatus: String(row.order_status || (purchaseMode === "wholesale" ? "inquiry_received" : "pending_payment")),
    paymentStatus: String(row.payment_status || "unpaid"),
    shippingStatus: String(row.shipping_status || "not_started"),
    purchaseMode,
    currency: String(row.currency || "USD"),
    paymentTerms: String(row.payment_terms || row.b2b_deposit_terms || ""),
    depositPercentage: fallbackDepositPercentage,
    depositAmount: computedDepositAmount > 0 ? formatCurrency(computedDepositAmount) : "",
    balanceAmount: computedBalanceAmount > 0 ? formatCurrency(computedBalanceAmount) : "",
    customerId: String(row.customer_id || ""),
    customerName: String(row.customer_name || ""),
    email: String(row.customer_email || row.email || ""),
    phone: String(row.customer_phone || row.phone || ""),
    country: String(row.customer_country || row.country || ""),
    billingAddress: String(row.billing_address || row.shipping_address || ""),
    shippingAddress: String(row.shipping_address || row.billing_address || ""),
    productId: String(row.product_id || row.product_id_snapshot || ""),
    productName: String(row.product_name || row.product_name_snapshot || ""),
    quantity: String(row.quantity || 1),
    unitPrice: formatCurrency(row.unit_price || 0),
    subtotal: formatCurrency(row.subtotal || 0),
    shippingAmount: formatCurrency(shippingAmount),
    taxAmount: formatCurrency(taxAmount),
    discountAmount: formatCurrency(discountAmount),
    totalAmount: formatCurrency(totalAmount),
    moq: String(row.moq || ""),
    budget: String(row.budget || formatCurrency(row.subtotal || 0)),
    shippingCycle: String(row.shipping_cycle || row.lead_time || ""),
    leadTime: String(row.lead_time || row.shipping_cycle || ""),
    message: String(row.message || ""),
    adminNote: String(row.admin_note || ""),
    paymentMethod: String(row.payment_method || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    statusLabel: toStatusLabel(row.status || "unprocessed"),
    orderStatusLabel: toStatusLabel(row.order_status || (purchaseMode === "wholesale" ? "inquiry_received" : "pending_payment")),
    paymentStatusLabel: toStatusLabel(row.payment_status || "unpaid"),
    shippingStatusLabel: toStatusLabel(row.shipping_status || "not_started"),
    items: itemRows.map((item) => ({
      id: String(item.id || ""),
      orderId: String(item.order_id || ""),
      productId: String(item.product_id || ""),
      productName: String(item.product_name_snapshot || item.product_name || ""),
      sku: String(item.sku_snapshot || ""),
      productImage: String(item.product_image_snapshot || ""),
      quantity: String(item.quantity || 1),
      unitPrice: formatCurrency(item.unit_price || 0),
      lineTotal: formatCurrency(item.line_total !== undefined ? item.line_total : item.subtotal || 0),
      purchaseMode: String(item.purchase_mode || ""),
      selectedPriceTierSnapshot: item.selected_price_tier_snapshot || null,
      productOptionsSnapshot: item.product_options_snapshot || null,
      moq: String(item.moq || ""),
      shippingCycle: String(item.shipping_cycle || ""),
      createdAt: String(item.created_at || ""),
      updatedAt: String(item.updated_at || ""),
    })),
  };
};

const fetchOrderItems = async (orderIds) => {
  if (!orderIds.length) {
    return [];
  }

  const filter = `order_id=in.(${orderIds.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(",")})`;
  const rows = await requestSupabase(`order_items?select=${ORDER_ITEM_REQUIRED_SELECT.join(",")}&${filter}&order=created_at.asc`);
  return Array.isArray(rows) ? rows : [];
};

const listOrders = async () => {
  const rows = await requestSupabase(`orders?select=${ORDER_REQUIRED_SELECT.join(",")}&order=created_at.desc`);
  const orderRows = Array.isArray(rows) ? rows : [];
  const itemRows = await fetchOrderItems(orderRows.map((row) => row.id));
  return orderRows.map((row) => mapOrderRow(row, itemRows.filter((item) => String(item.order_id || "") === String(row.id))));
};

const getOrderById = async (id) => {
  const orderId = String(id || "").trim();
  if (!orderId) {
    return null;
  }

  const rows = await requestSupabase(`orders?select=${ORDER_REQUIRED_SELECT.join(",")}&id=eq.${escapeFilterValue(orderId)}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    return null;
  }

  const itemRows = await fetchOrderItems([orderId]);
  return mapOrderRow(row, itemRows);
};

const getOrderByNumber = async (orderNumber) => {
  const normalized = String(orderNumber || "").trim();
  if (!normalized) {
    return null;
  }

  const rows = await requestSupabase(`orders?select=${ORDER_REQUIRED_SELECT.join(",")}&order_id=eq.${escapeFilterValue(normalized)}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    return null;
  }

  const itemRows = await fetchOrderItems([String(row.id || "")]);
  return mapOrderRow(row, itemRows);
};

const validateInternalStatus = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!INTERNAL_ORDER_STATUSES.has(normalized)) {
    throw new Error("Invalid order processing status.");
  }
  return normalized;
};

const validateOrderStatus = (purchaseMode, value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const allowed = purchaseMode === "wholesale" ? WHOLESALE_ORDER_STATUSES : RETAIL_ORDER_STATUSES;

  if (!allowed.has(normalized)) {
    throw new Error(`Invalid ${purchaseMode} order status.`);
  }

  return normalized;
};

const validatePaymentStatus = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!PAYMENT_STATUSES.has(normalized)) {
    throw new Error("Invalid payment status.");
  }
  return normalized;
};

const validateShippingStatus = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!SHIPPING_STATUSES.has(normalized)) {
    throw new Error("Invalid shipping status.");
  }
  return normalized;
};

const getOrderStatusEventPayload = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  const lookup = {
    inquiry_received: ["order_status_changed", "Inquiry received", "Order was marked as inquiry received."],
    quote_pending: ["quote_created", "Quote pending", "Order moved to quote pending."],
    awaiting_confirmation: ["customer_confirmed", "Awaiting confirmation", "Order is awaiting customer confirmation."],
    awaiting_deposit: ["deposit_requested", "Awaiting deposit", "Deposit was requested for this order."],
    in_production: ["production_started", "Production started", "Order entered production."],
    quality_inspection: [
      "quality_inspection_started",
      "Quality inspection started",
      "Order entered quality inspection.",
    ],
    ready_to_ship: ["packed", "Ready to ship", "Order is ready to ship."],
    shipped: ["shipped", "Order shipped", "Order was marked shipped."],
    delivered: ["delivered", "Order delivered", "Order was marked delivered."],
    cancelled: ["cancelled", "Order cancelled", "Order was cancelled."],
  };
  const [eventType, title, description] = lookup[normalized] || [
    "order_status_changed",
    "Order status updated",
    `Order status changed to ${toStatusLabel(normalized)}.`,
  ];
  return { eventType, title, description };
};

const getPaymentStatusEventPayload = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  const lookup = {
    pending: ["payment_status_changed", "Payment pending", "Payment status was set to pending."],
    deposit_paid: ["deposit_received", "Deposit received", "Deposit payment was recorded."],
    partially_paid: ["payment_status_changed", "Payment partially paid", "Payment status was set to partially paid."],
    paid: ["balance_received", "Payment received", "Payment was marked paid."],
    refunded: ["refunded", "Refund recorded", "Payment was marked refunded."],
  };
  const [eventType, title, description] = lookup[normalized] || [
    "payment_status_changed",
    "Payment status updated",
    `Payment status changed to ${toStatusLabel(normalized)}.`,
  ];
  return { eventType, title, description };
};

const getShippingStatusEventPayload = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  const lookup = {
    packed: ["packed", "Order packed", "Order was marked packed."],
    shipped: ["shipped", "Shipment sent", "Shipment was marked shipped."],
    delivered: ["delivered", "Shipment delivered", "Shipment was marked delivered."],
  };
  const [eventType, title, description] = lookup[normalized] || [
    "shipping_status_changed",
    "Shipping status updated",
    `Shipping status changed to ${toStatusLabel(normalized)}.`,
  ];
  return { eventType, title, description };
};

const markSupportUnavailable = (state, message) => {
  state.supported = false;
  state.checkedAt = nowMs();
  state.retryAfter = state.checkedAt + SUPPORT_RETRY_COOLDOWN_MS;
  state.lastError = String(message || "");
  state.pending = null;
};

const markSupportAvailable = (state) => {
  state.supported = true;
  state.checkedAt = nowMs();
  state.retryAfter = 0;
  state.lastError = "";
  state.pending = null;
};

const isOrderEventsUnavailableError = (error) => {
  const message = String(error?.message || "");
  return (
    (/relation\s+"?order_events"?/i.test(message) && /does not exist/i.test(message)) ||
    (/Could not find/i.test(message) && /order_events/i.test(message)) ||
    (/schema cache/i.test(message) && /order_events/i.test(message))
  );
};

const isShippingStatusUnavailableError = (error) => {
  const message = String(error?.message || "");
  return /shipping_status/i.test(message) && /schema cache|does not exist|Could not find/i.test(message);
};

const createAvailabilityError = (resource, message) => {
  const error = new Error(message || `${resource} is temporarily unavailable.`);
  error.status = 503;
  return error;
};

const verifyCachedSupport = async (state, verifyFn, unavailableMessage, options = {}) => {
  const requireAvailable = Boolean(options.requireAvailable);
  const force = Boolean(options.force);
  const currentTime = nowMs();

  if (!force && state.supported === true) {
    return true;
  }

  if (!force && state.supported === false && currentTime < state.retryAfter) {
    if (requireAvailable) {
      throw createAvailabilityError(unavailableMessage, state.lastError || unavailableMessage);
    }
    return false;
  }

  if (state.pending) {
    const supported = await state.pending;
    if (!supported && requireAvailable) {
      throw createAvailabilityError(unavailableMessage, state.lastError || unavailableMessage);
    }
    return supported;
  }

  state.pending = (async () => {
    try {
      await verifyFn();
      markSupportAvailable(state);
      return true;
    } catch (error) {
      markSupportUnavailable(state, error?.message || unavailableMessage);
      return false;
    }
  })();

  const supported = await state.pending;
  if (!supported && requireAvailable) {
    throw createAvailabilityError(unavailableMessage, state.lastError || unavailableMessage);
  }
  return supported;
};

const ensureOrderEventsAvailability = async (options = {}) =>
  verifyCachedSupport(
    orderEventsSupportState,
    () => requestSupabase("order_events?select=id&limit=1"),
    "order_events is temporarily unavailable.",
    options
  );

const ensureShippingStatusAvailability = async (options = {}) =>
  verifyCachedSupport(
    shippingStatusSupportState,
    () => requestSupabase("orders?select=shipping_status&limit=1"),
    "orders.shipping_status is temporarily unavailable.",
    options
  );

const mapOrderEventRow = (row) => ({
  id: String(row?.id || ""),
  orderId: String(row?.order_id || ""),
  eventType: String(row?.event_type || ""),
  title: String(row?.title || ""),
  description: String(row?.description || ""),
  createdBy: String(row?.created_by || ""),
  metadata: asObject(row?.metadata),
  createdAt: String(row?.created_at || ""),
});

const insertOrderEvent = async (orderId, event, options = {}) => {
  const strict = options.strict !== false;
  const supported = await ensureOrderEventsAvailability({
    requireAvailable: strict,
  });

  if (!supported) {
    return null;
  }

  try {
    const rows = await requestSupabase("order_events", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        order_id: orderId,
        event_type: String(event.eventType || "order_created"),
        title: String(event.title || "Order created"),
        description: String(event.description || ""),
        created_by: String(event.createdBy || "system"),
        metadata: asObject(event.metadata),
        created_at: String(event.createdAt || nowIso()),
      },
    });
    const createdRow = Array.isArray(rows) ? rows[0] : null;
    if (!createdRow?.id) {
      throw new Error("Supabase did not return the created order event.");
    }
    markSupportAvailable(orderEventsSupportState);
    return mapOrderEventRow(createdRow);
  } catch (error) {
    if (isOrderEventsUnavailableError(error)) {
      markSupportUnavailable(orderEventsSupportState, error?.message || "order_events unavailable");
      if (!strict) {
        return null;
      }
      throw createAvailabilityError("order_events", error?.message || "order_events is temporarily unavailable.");
    }
    throw error;
  }
};

const createOrderEventIfSupported = async (orderId, event) => insertOrderEvent(orderId, event, { strict: false });

const listOrderEvents = async (orderId) => {
  const normalizedOrderId = String(orderId || "").trim();
  if (!normalizedOrderId) {
    return [];
  }

  await ensureOrderEventsAvailability({
    requireAvailable: true,
  });

  const rows = await requestSupabase(
    `order_events?select=*&order_id=eq.${escapeFilterValue(normalizedOrderId)}&order=created_at.desc`
  );
  return Array.isArray(rows) ? rows.map(mapOrderEventRow) : [];
};

const createOrderEvent = async (orderId, event) => insertOrderEvent(orderId, event, { strict: true });

const logOrderCreateTimings = (timings) => {
  if (!ORDER_CREATE_TIMING_LOG) {
    return;
  }

  const entries = Object.entries(timings).map(([key, value]) => `${key}=${Number(value).toFixed(1)}ms`);
  console.log(`[orders:create] ${entries.join(" | ")}`);
};

const createOrder = async (input) => {
  const startedAt = performance.now();
  const timings = {};
  const mark = (label, from) => {
    timings[label] = performance.now() - from;
  };
  const payload = asObject(input);
  const purchaseMode = String(payload.purchaseMode || "retail").trim().toLowerCase() === "wholesale" ? "wholesale" : "retail";
  const quantity = Math.max(1, Number.parseInt(String(payload.quantity || "1"), 10) || 1);
  const productId = String(payload.productId || "").trim();

  if (!productId) {
    throw new Error("A product id is required.");
  }

  const [product, customer] = await Promise.all([
    (async () => {
      const productStartedAt = performance.now();
      const result = await selectLeanProduct(productId);
      mark("product_fetch", productStartedAt);
      return result;
    })(),
    (async () => {
      const customerStartedAt = performance.now();
      const result = await getOrCreateCustomer(payload);
      mark("customer_lookup_create", customerStartedAt);
      return result;
    })(),
  ]);
  if (!product?.id) {
    throw new Error("The selected product could not be found.");
  }
  const wholesaleTier = purchaseMode === "wholesale" ? getWholesaleTierForQuantity(product, quantity) : null;
  const wholesaleMoq = Math.max(1, Number(product?.b2b?.wholesaleMoq || product?.moqValue || 1));

  if (purchaseMode === "wholesale" && quantity < wholesaleMoq) {
    throw new Error(`Wholesale quantity must be at least ${wholesaleMoq} units.`);
  }

  const unitPriceValue =
    purchaseMode === "wholesale"
      ? Number(wholesaleTier?.unitPrice || 0)
      : Number(product?.b2c?.retailPrice || 0);
  const subtotalValue = unitPriceValue * quantity;
  const depositPercentage = purchaseMode === "wholesale" ? formatDepositValue(product?.b2b?.deposit || {}) : "";
  const depositNumeric = Number(String(product?.b2b?.deposit?.value || 0).replace(/[^\d.-]/g, "")) || 0;
  const depositAmountValue =
    purchaseMode === "wholesale" && product?.b2b?.deposit?.required && product?.b2b?.deposit?.type !== "fixed"
      ? subtotalValue * (depositNumeric / 100)
      : purchaseMode === "wholesale" && product?.b2b?.deposit?.required && product?.b2b?.deposit?.type === "fixed"
        ? depositNumeric
        : 0;
  const balanceAmountValue = Math.max(0, subtotalValue - depositAmountValue);
  const shippingCycle =
    purchaseMode === "wholesale"
      ? formatShippingTime(product?.b2b?.wholesaleLeadTime || product?.shippingDays || 0)
      : formatShippingTime(product?.shippingDays || 0) || String(product?.shippingTime || "");
  const paymentTerms =
    purchaseMode === "wholesale"
      ? String(product?.b2b?.deposit?.customPaymentTerms || product?.b2b?.depositTerms || "").trim()
      : "";
  const moqText =
    purchaseMode === "wholesale"
      ? `${wholesaleMoq} units`
      : "1 unit";
  const desiredOrderStatus = purchaseMode === "wholesale" ? "inquiry_received" : "pending_payment";
  const desiredPaymentStatus = "pending";
  const orderDateKey = currentDateStamp();
  const baseOrderRow = {
    source: "website",
    status: "unprocessed",
    order_status: desiredOrderStatus,
    payment_status: desiredPaymentStatus,
    purchase_mode: purchaseMode,
    currency: "USD",
    payment_terms: paymentTerms || null,
    deposit_percentage: depositPercentage || null,
    customer_id: customer?.id || null,
    customer_name: String(payload.customerName || "").trim() || null,
    country: String(payload.country || "").trim() || null,
    email: String(payload.email || "").trim().toLowerCase() || null,
    phone: String(payload.phone || "").trim() || null,
    shipping_address: String(payload.shippingAddress || "").trim() || null,
    product_id: product.id,
    product_name: product.name || null,
    quantity,
    unit_price: unitPriceValue,
    subtotal: subtotalValue,
    moq: moqText,
    budget: formatCurrency(subtotalValue),
    shipping_cycle: shippingCycle || null,
    message: String(payload.message || "").trim() || null,
    admin_note: "",
    payment_method: "",
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const orderInsertStartedAt = performance.now();
  const createdOrder = await createOrderHeaderWithNumber(baseOrderRow, orderDateKey);
  mark("orders_insert", orderInsertStartedAt);

  if (!createdOrder?.id || !createdOrder?.order_id) {
    throw new Error("Supabase did not return the created order.");
  }

  const orderNumber = String(createdOrder.order_id || "").trim();

  const orderItemRow = {
    order_id: createdOrder.id,
    product_id: product.id,
    product_name: product.name || "",
    purchase_mode: purchaseMode,
    quantity,
    unit_price: unitPriceValue,
    subtotal: subtotalValue,
    moq: moqText,
    shipping_cycle: shippingCycle || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const orderItemInsertStartedAt = performance.now();
  await requestSupabase("order_items", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: orderItemRow,
  });
  mark("order_items_insert", orderItemInsertStartedAt);

  const responseOrder = {
    id: String(createdOrder.id || ""),
    orderId: orderNumber,
    orderNumber,
    status: String(createdOrder.order_status || baseOrderRow.order_status || ""),
  };

  const totalBeforeEvent = performance.now() - startedAt;
  logOrderCreateTimings({
    ...timings,
    total_request: totalBeforeEvent,
  });

  const eventStartedAt = performance.now();
  void createOrderEventIfSupported(createdOrder.id, {
    eventType: "order_created",
    title: "Order created",
    description: `Order ${orderNumber} was created from the website checkout flow.`,
    createdBy: "system",
    metadata: {
      purchaseMode,
      salesChannel: purchaseMode === "wholesale" ? "wholesale" : "retail",
    },
  })
    .then((createdEvent) => {
      if (createdEvent?.id) {
        logOrderCreateTimings({
          order_events_insert: performance.now() - eventStartedAt,
          total_request: totalBeforeEvent,
        });
        return;
      }
      console.error("[orders:create] order_events insert skipped:", orderEventsSupportState.lastError || "unavailable");
    })
    .catch((error) => {
      console.error("[orders:create] order_events insert failed:", error?.message || error);
    });

  return responseOrder;
};

const updateOrder = async (id, partial, options = {}) => {
  const orderId = String(id || "").trim();
  if (!orderId) {
    throw new Error("Order id is required.");
  }

  const existing = await getOrderById(orderId);
  if (!existing?.id) {
    throw new Error("Order not found.");
  }

  const patch = {
    updated_at: nowIso(),
  };

  if (partial?.status !== undefined) {
    patch.status = validateInternalStatus(partial.status);
  }

  if (partial?.adminNote !== undefined) {
    patch.admin_note = String(partial.adminNote || "").trim();
  }

  if (partial?.paymentMethod !== undefined) {
    patch.payment_method = String(partial.paymentMethod || "").trim() || null;
  }

  if (partial?.orderStatus !== undefined) {
    patch.order_status = validateOrderStatus(existing.purchaseMode || "retail", partial.orderStatus);
  }

  if (partial?.paymentStatus !== undefined) {
    patch.payment_status = validatePaymentStatus(partial.paymentStatus);
  }

  if (partial?.shippingStatus !== undefined) {
    await ensureShippingStatusAvailability({
      requireAvailable: true,
    });
    patch.shipping_status = validateShippingStatus(partial.shippingStatus);
  }

  let rows;
  try {
    rows = await requestSupabase(`orders?id=eq.${escapeFilterValue(orderId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: patch,
    });
    if (Object.prototype.hasOwnProperty.call(patch, "shipping_status")) {
      markSupportAvailable(shippingStatusSupportState);
    }
  } catch (error) {
    if (isShippingStatusUnavailableError(error)) {
      markSupportUnavailable(shippingStatusSupportState, error?.message || "orders.shipping_status unavailable");
      console.error("[orders:update] shipping_status update failed:", error?.message || error);
      throw createAvailabilityError("orders.shipping_status", error?.message || "orders.shipping_status is temporarily unavailable.");
    }
    throw error;
  }

  const updatedRow = Array.isArray(rows) ? rows[0] : null;
  if (!updatedRow?.id) {
    throw new Error("Supabase did not return the updated order.");
  }

  const updated = await getOrderById(orderId);
  const shouldCreateEvents = options.createEvents !== false;
  const createdBy = String(options.createdBy || "admin");

  if (shouldCreateEvents) {
    const eventWrites = [];

    if (patch.order_status && patch.order_status !== existing.orderStatus) {
      const eventPayload = getOrderStatusEventPayload(patch.order_status);
      eventWrites.push(
        createOrderEventIfSupported(orderId, {
          ...eventPayload,
          createdBy,
          metadata: {
            previous: existing.orderStatus,
            next: patch.order_status,
          },
        })
      );
    }

    if (patch.payment_status && patch.payment_status !== existing.paymentStatus) {
      const eventPayload = getPaymentStatusEventPayload(patch.payment_status);
      eventWrites.push(
        createOrderEventIfSupported(orderId, {
          ...eventPayload,
          createdBy,
          metadata: {
            previous: existing.paymentStatus,
            next: patch.payment_status,
          },
        })
      );
    }

    if (patch.shipping_status && patch.shipping_status !== existing.shippingStatus) {
      const eventPayload = getShippingStatusEventPayload(patch.shipping_status);
      eventWrites.push(
        createOrderEventIfSupported(orderId, {
          ...eventPayload,
          createdBy,
          metadata: {
            previous: existing.shippingStatus,
            next: patch.shipping_status,
          },
        })
      );
    }

    if (
      partial?.adminNote !== undefined &&
      String(partial.adminNote || "").trim() &&
      String(partial.adminNote || "").trim() !== String(existing.adminNote || "").trim()
    ) {
      eventWrites.push(
        createOrderEventIfSupported(orderId, {
          eventType: "admin_note_added",
          title: "Admin note added",
          description: String(partial.adminNote || "").trim(),
          createdBy,
          metadata: {},
        })
      );
    }

    if (eventWrites.length) {
      const results = await Promise.allSettled(eventWrites);
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error("[orders:update] order_events insert failed:", result.reason?.message || result.reason);
          return;
        }

        if (!result.value?.id) {
          console.error("[orders:update] order_events insert skipped:", orderEventsSupportState.lastError || `event ${index + 1} unavailable`);
        }
      });
    }
  }

  return updated;
};

const updateOrderStatus = async (id, orderStatus, options = {}) =>
  updateOrder(id, { orderStatus }, options);

const updateOrderPaymentStatus = async (id, paymentStatus, options = {}) =>
  updateOrder(id, { paymentStatus }, options);

const updateOrderShippingStatus = async (id, shippingStatus, options = {}) =>
  updateOrder(id, { shippingStatus }, options);

const deleteOrder = async (id) => {
  const orderId = String(id || "").trim();
  if (!orderId) {
    throw new Error("Order id is required.");
  }

  await requestSupabase(`orders?id=eq.${escapeFilterValue(orderId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });

  return {
    deletedId: orderId,
  };
};

module.exports = {
  listOrders,
  getOrderById,
  getOrderByNumber,
  listOrderEvents,
  createOrderEvent,
  createOrder,
  updateOrder,
  updateOrderStatus,
  updateOrderPaymentStatus,
  updateOrderShippingStatus,
  deleteOrder,
};
