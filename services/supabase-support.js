const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ADMIN_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

const CONVERSATION_TYPES = new Set([
  "general_contact",
  "product_inquiry",
  "order_support",
  "wholesale_inquiry",
]);
const CONVERSATION_STATUSES = new Set([
  "open",
  "waiting_customer",
  "waiting_admin",
  "resolved",
  "closed",
]);
const MESSAGE_SENDERS = new Set(["customer", "admin", "system"]);

const requireConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
    throw new Error(
      "Supabase support service is not configured. Set SUPABASE_URL and either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
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
const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

const normalizeConversationType = (value) => {
  const normalized = String(value || "general_contact")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!CONVERSATION_TYPES.has(normalized)) {
    throw new Error("Invalid conversation type.");
  }
  return normalized;
};

const normalizeConversationStatus = (value) => {
  const normalized = String(value || "open")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!CONVERSATION_STATUSES.has(normalized)) {
    throw new Error("Invalid conversation status.");
  }
  return normalized;
};

const normalizeSender = (value) => {
  const normalized = String(value || "customer")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!MESSAGE_SENDERS.has(normalized)) {
    throw new Error("Invalid message sender.");
  }
  return normalized;
};

const normalizeMessageType = (value) => {
  const normalized = String(value || "text").trim().toLowerCase().replace(/\s+/g, "_");
  return normalized || "text";
};

const sanitizeText = (value) => String(value || "").trim();
const toNullableText = (value) => {
  const normalized = sanitizeText(value);
  return normalized ? normalized : null;
};
const nowMs = () => Date.now();
const durationMs = (startedAt) => nowMs() - startedAt;
const logTiming = (scope, timings) => {
  try {
    console.info(`[support][timing][${scope}] ${JSON.stringify(timings)}`);
  } catch (error) {
    console.info(`[support][timing][${scope}]`, timings);
  }
};

const getOrCreateCustomer = async (input) => {
  const startedAt = nowMs();
  const email = sanitizeText(input.email).toLowerCase();
  if (email) {
    const existingRows = await requestSupabase(`customers?select=*&email=eq.${escapeFilterValue(email)}&limit=1`);
    if (Array.isArray(existingRows) && existingRows[0]?.id) {
      return {
        customer: existingRows[0],
        timingMs: durationMs(startedAt),
        created: false,
      };
    }
  }

  const createdRows = await requestSupabase("customers", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      name: toNullableText(input.customerName),
      email: email || null,
      phone: toNullableText(input.customerPhone),
      country: toNullableText(input.customerCountry),
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  });

  return {
    customer: Array.isArray(createdRows) ? createdRows[0] : null,
    timingMs: durationMs(startedAt),
    created: true,
  };
};

const fetchOrderNumbersByIds = async (ids) => {
  const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((item) => sanitizeText(item)).filter(Boolean)));
  if (!normalizedIds.length) {
    return new Map();
  }

  const rows = await requestSupabase(
    `orders?select=id,order_id&or=(${normalizedIds.map((id) => `id.eq.${escapeFilterValue(id)}`).join(",")})`
  );
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.id || ""), String(row.order_id || row.id || "")]));
};

const fetchProductNamesByIds = async (ids) => {
  const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((item) => sanitizeText(item)).filter(Boolean)));
  if (!normalizedIds.length) {
    return new Map();
  }

  const rows = await requestSupabase(
    `products?select=id,name&or=(${normalizedIds.map((id) => `id.eq.${escapeFilterValue(id)}`).join(",")})`
  );
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.id || ""), String(row.name || "")]));
};

const fetchCustomersByIds = async (ids) => {
  const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((item) => sanitizeText(item)).filter(Boolean)));
  if (!normalizedIds.length) return new Map();
  const rows = await requestSupabase(`customers?select=*&or=(${normalizedIds.map((id) => `id.eq.${escapeFilterValue(id)}`).join(",")})`);
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.id || ""), row]));
};

const enrichConversationRows = async (rows) => {
  const items = Array.isArray(rows) ? rows : [];
  const [orderMap, productMap, customerMap] = await Promise.all([
    fetchOrderNumbersByIds(items.map((row) => row.related_order_id)),
    fetchProductNamesByIds(items.map((row) => row.related_product_id)),
    fetchCustomersByIds(items.map((row) => row.customer_id)),
  ]);
  return items.map((row) => mapConversationRow(row, orderMap, productMap, customerMap));
};

const mapConversationRow = (row, orderMap = new Map(), productMap = new Map(), customerMap = new Map()) => ({
  id: String(row?.id || ""),
  conversationId: String(row?.id || ""),
  customerId: String(row?.customer_id || ""),
  customerName: String(row?.customer_name || "").trim(),
  email: String(row?.email || "").trim(),
  customerPhone: String(row?.customer_phone || "").trim(),
  country: String(row?.country || "").trim(),
  source: String(row?.source || "support").trim(),
  conversationType: String(row?.conversation_type || "general_contact").trim(),
  relatedOrderId: String(row?.related_order_id || "").trim(),
  relatedOrderNumber: orderMap.get(String(row?.related_order_id || "").trim()) || "",
  relatedProductId: String(row?.related_product_id || "").trim(),
  relatedProductName: productMap.get(String(row?.related_product_id || "").trim()) || "",
  status: String(row?.status || "open").trim(),
  subject: String(row?.subject || "").trim(),
  lastMessageText: String(row?.last_message_text || "").trim(),
  lastMessageAt: String(row?.last_message_at || "").trim(),
  lastMessageSender: String(row?.last_message_sender || "").trim(),
  customerUnreadCount: Number(row?.customer_unread_count || 0),
  adminUnreadCount: Number(row?.admin_unread_count || 0),
  createdAt: String(row?.created_at || "").trim(),
  updatedAt: String(row?.updated_at || "").trim(),
  whatsapp: String(customerMap.get(String(row?.customer_id || ""))?.whatsapp || "").trim(),
  company: String(customerMap.get(String(row?.customer_id || ""))?.company || "").trim(),
  customerType: String(customerMap.get(String(row?.customer_id || ""))?.customer_type || "").trim(),
  customerStatus: String(customerMap.get(String(row?.customer_id || ""))?.customer_status || "").trim(),
  tags: Array.isArray(customerMap.get(String(row?.customer_id || ""))?.tags) ? customerMap.get(String(row?.customer_id || "")).tags : [],
  notes: String(customerMap.get(String(row?.customer_id || ""))?.notes || "").trim(),
  isVip: Boolean(customerMap.get(String(row?.customer_id || ""))?.is_vip),
  isBlacklisted: Boolean(customerMap.get(String(row?.customer_id || ""))?.is_blacklisted),
});

const mapMessageRow = (row) => ({
  id: String(row?.id || ""),
  messageId: String(row?.id || ""),
  conversationId: String(row?.conversation_id || ""),
  sender: String(row?.sender || "customer").trim(),
  text: String(row?.text || "").trim(),
  image: String(row?.image_url || "").trim(),
  imageUrl: String(row?.image_url || "").trim(),
  readAt: String(row?.read_at || "").trim(),
  messageType: String(row?.message_type || "text").trim(),
  metadata: asObject(row?.metadata),
  createdAt: String(row?.created_at || "").trim(),
});

const getRawConversationById = async (conversationId) => {
  const normalizedConversationId = sanitizeText(conversationId);
  if (!normalizedConversationId) {
    return null;
  }

  const rows = await requestSupabase(
    `support_conversations?select=*&id=eq.${escapeFilterValue(normalizedConversationId)}&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
};

const getConversationById = async (conversationId) => {
  const row = await getRawConversationById(conversationId);
  if (!row) {
    return null;
  }

  const [conversation] = await enrichConversationRows([row]);
  return conversation || null;
};

const listAdminConversations = async (filters = {}) => {
  const rows = await requestSupabase("support_conversations?select=*&order=last_message_at.desc.nullslast,updated_at.desc");
  const conversations = await enrichConversationRows(rows);
  const query = sanitizeText(filters.query).toLowerCase();
  const statusFilter = sanitizeText(filters.status).toLowerCase();
  const typeFilter = sanitizeText(filters.conversationType).toLowerCase();

  return conversations
    .filter((conversation) => {
      if (statusFilter && statusFilter !== "all" && conversation.status !== statusFilter) {
        return false;
      }

      if (typeFilter && typeFilter !== "all" && conversation.conversationType !== typeFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        conversation.customerName,
        conversation.email,
        conversation.customerPhone,
        conversation.country,
        conversation.subject,
        conversation.relatedOrderNumber,
        conversation.relatedProductName,
        conversation.lastMessageText,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    })
    .sort((left, right) => {
      const rightTime = new Date(right.lastMessageAt || right.updatedAt || right.createdAt).getTime();
      const leftTime = new Date(left.lastMessageAt || left.updatedAt || left.createdAt).getTime();
      return rightTime - leftTime;
    });
};

const listMessagesByConversation = async (conversationId) => {
  const normalizedConversationId = sanitizeText(conversationId);
  if (!normalizedConversationId) {
    return [];
  }

  const rows = await requestSupabase(
    `support_messages?select=*&conversation_id=eq.${escapeFilterValue(normalizedConversationId)}&order=created_at.asc`
  );
  return Array.isArray(rows) ? rows.map(mapMessageRow) : [];
};

const patchConversationRow = async (conversationId, patch) => {
  const startedAt = nowMs();
  const normalizedConversationId = sanitizeText(conversationId);
  if (!normalizedConversationId) {
    throw new Error("Conversation id is required.");
  }

  const rows = await requestSupabase(`support_conversations?id=eq.${escapeFilterValue(normalizedConversationId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: {
      ...patch,
      updated_at: nowIso(),
    },
  });

  if (!Array.isArray(rows) || !rows[0]?.id) {
    throw new Error("Supabase did not return the updated support conversation.");
  }

  return {
    conversation: mapConversationRow(rows[0]),
    timingMs: durationMs(startedAt),
  };
};

const insertMessageRow = async (conversationId, input) => {
  const startedAt = nowMs();
  const normalizedConversationId = sanitizeText(conversationId);
  if (!normalizedConversationId) {
    throw new Error("Conversation id is required.");
  }

  const sender = normalizeSender(input.sender);
  const text = sanitizeText(input.text);
  const imageUrl = sanitizeText(input.imageUrl || input.image);

  if (!text && !imageUrl) {
    throw new Error("Message text or image is required.");
  }

  const rows = await requestSupabase("support_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      conversation_id: normalizedConversationId,
      sender,
      text: text || null,
      image_url: imageUrl || null,
      created_at: nowIso(),
      read_at: null,
      message_type: normalizeMessageType(input.messageType || (imageUrl && text ? "mixed" : imageUrl ? "image" : "text")),
      metadata: asObject(input.metadata),
    },
  });

  if (!Array.isArray(rows) || !rows[0]?.id) {
    throw new Error("Supabase did not return the created support message.");
  }

  return {
    message: mapMessageRow(rows[0]),
    timingMs: durationMs(startedAt),
  };
};

const createConversationWithFirstMessage = async (input) => {
  const requestStartedAt = nowMs();
  const payload = asObject(input);
  const sender = normalizeSender(payload.sender || "customer");
  if (sender !== "customer") {
    throw new Error("Only customer-created support conversations are allowed on the public endpoint.");
  }

  const messageText = sanitizeText(payload.text || payload.message);
  const imageUrl = sanitizeText(payload.imageUrl || payload.image);
  if (!messageText && !imageUrl) {
    throw new Error("A first message is required.");
  }

  const customerResult = await getOrCreateCustomer({
    customerName: payload.customerName,
    email: payload.email,
    customerPhone: payload.customerPhone,
    customerCountry: payload.country,
  });
  const customer = customerResult.customer;

  const timestamp = nowIso();
  const conversationInsertStartedAt = nowMs();
  const conversationRows = await requestSupabase("support_conversations", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      customer_id: customer?.id || null,
      customer_name: toNullableText(payload.customerName) || "Website Visitor",
      email: toNullableText(payload.email),
      customer_phone: toNullableText(payload.customerPhone),
      country: toNullableText(payload.country),
      source: toNullableText(payload.source) || "support",
      conversation_type: normalizeConversationType(payload.conversationType),
      related_order_id: toNullableText(payload.relatedOrderId),
      related_product_id: toNullableText(payload.relatedProductId),
      status: "waiting_admin",
      subject: toNullableText(payload.subject),
      last_message_text: messageText || null,
      last_message_at: timestamp,
      last_message_sender: "customer",
      customer_unread_count: 0,
      admin_unread_count: 1,
      created_at: timestamp,
      updated_at: timestamp,
    },
  });
  const conversationInsertMs = durationMs(conversationInsertStartedAt);

  const createdConversationRow = Array.isArray(conversationRows) ? conversationRows[0] : null;
  if (!createdConversationRow?.id) {
    throw new Error("Supabase did not return the created support conversation.");
  }

  try {
    const messageResult = await insertMessageRow(createdConversationRow.id, {
      sender: "customer",
      text: messageText,
      imageUrl,
      metadata: payload.metadata,
    });
    const conversation = mapConversationRow(createdConversationRow);
    const message = messageResult.message;
    logTiming("public_create_conversation", {
      customer_lookup_ms: customerResult.timingMs,
      customer_created: customerResult.created,
      conversation_insert_ms: conversationInsertMs,
      first_message_insert_ms: messageResult.timingMs,
      conversation_snapshot_update_ms: 0,
      total_ms: durationMs(requestStartedAt),
    });
    return {
      conversation,
      message,
    };
  } catch (error) {
    await requestSupabase(`support_conversations?id=eq.${escapeFilterValue(createdConversationRow.id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }).catch(() => {});
    throw error;
  }
};

const addCustomerMessage = async (conversationId, input) => {
  const requestStartedAt = nowMs();
  const existingStartedAt = nowMs();
  const existingRow = await getRawConversationById(conversationId);
  const existingLookupMs = durationMs(existingStartedAt);
  if (!existingRow?.id) {
    throw new Error("Support conversation not found.");
  }

  const messageResult = await insertMessageRow(existingRow.id, {
    sender: "customer",
    text: input.text,
    imageUrl: input.imageUrl || input.image,
    metadata: input.metadata,
  });
  const message = messageResult.message;

  const patchResult = await patchConversationRow(existingRow.id, {
    status: "waiting_admin",
    last_message_text: message.text || null,
    last_message_at: message.createdAt || nowIso(),
    last_message_sender: "customer",
    admin_unread_count: Math.max(0, Number(existingRow.admin_unread_count || 0)) + 1,
  });
  logTiming("public_add_customer_message", {
    conversation_lookup_ms: existingLookupMs,
    message_insert_ms: messageResult.timingMs,
    conversation_snapshot_update_ms: patchResult.timingMs,
    total_ms: durationMs(requestStartedAt),
  });

  return {
    conversation: patchResult.conversation,
    message,
  };
};

const addAdminMessage = async (conversationId, input) => {
  const requestStartedAt = nowMs();
  const existingStartedAt = nowMs();
  const existingRow = await getRawConversationById(conversationId);
  const existingLookupMs = durationMs(existingStartedAt);
  if (!existingRow?.id) {
    throw new Error("Support conversation not found.");
  }

  const messageResult = await insertMessageRow(existingRow.id, {
    sender: "admin",
    text: input.text,
    imageUrl: input.imageUrl || input.image,
    metadata: input.metadata,
  });
  const message = messageResult.message;

  const patchResult = await patchConversationRow(existingRow.id, {
    status: "waiting_customer",
    last_message_text: message.text || null,
    last_message_at: message.createdAt || nowIso(),
    last_message_sender: "admin",
    admin_unread_count: 0,
    customer_unread_count: Math.max(0, Number(existingRow.customer_unread_count || 0)) + 1,
  });
  logTiming("admin_add_message", {
    conversation_lookup_ms: existingLookupMs,
    message_insert_ms: messageResult.timingMs,
    conversation_snapshot_update_ms: patchResult.timingMs,
    total_ms: durationMs(requestStartedAt),
  });

  return {
    conversation: patchResult.conversation,
    message,
  };
};

const updateConversationStatus = async (conversationId, status) => {
  const normalizedStatus = normalizeConversationStatus(status);
  const patchResult = await patchConversationRow(conversationId, {
    status: normalizedStatus,
  });
  return patchResult.conversation;
};

const markAdminRead = async (conversationId) => {
  const normalizedConversationId = sanitizeText(conversationId);
  const existing = await getConversationById(normalizedConversationId);
  if (!existing?.id) {
    throw new Error("Support conversation not found.");
  }

  const readAt = nowIso();
  await requestSupabase(
    `support_messages?conversation_id=eq.${escapeFilterValue(normalizedConversationId)}&sender=eq.customer&read_at=is.null`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: {
        read_at: readAt,
      },
    }
  );

  const patchResult = await patchConversationRow(normalizedConversationId, {
    admin_unread_count: 0,
  });
  return patchResult.conversation;
};

const markCustomerRead = async (conversationId) => {
  const normalizedConversationId = sanitizeText(conversationId);
  const existing = await getConversationById(normalizedConversationId);
  if (!existing?.id) {
    throw new Error("Support conversation not found.");
  }

  if (Number(existing.customerUnreadCount || 0) <= 0) {
    return existing;
  }

  const readAt = nowIso();
  await requestSupabase(
    `support_messages?conversation_id=eq.${escapeFilterValue(normalizedConversationId)}&sender=eq.admin&read_at=is.null`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: {
        read_at: readAt,
      },
    }
  );

  const patchResult = await patchConversationRow(normalizedConversationId, {
    customer_unread_count: 0,
  });
  return patchResult.conversation;
};

const updateCustomerProfile = async (customerId, input = {}) => {
  const normalizedId = sanitizeText(customerId);
  if (!normalizedId) throw new Error("Customer ID is required.");
  const allowedStatuses = new Set(["new", "active", "waiting_customer", "waiting_admin", "vip", "wholesale", "retail", "resolved", "closed", "blocked"]);
  const status = sanitizeText(input.customerStatus).toLowerCase().replace(/\s+/g, "_");
  if (status && !allowedStatuses.has(status)) throw new Error("Invalid customer status.");
  const body = {
    ...(status ? { customer_status: status } : {}),
    ...(input.customerType !== undefined ? { customer_type: sanitizeText(input.customerType) || "retail" } : {}),
    ...(input.whatsapp !== undefined ? { whatsapp: toNullableText(input.whatsapp) } : {}),
    ...(input.company !== undefined ? { company: toNullableText(input.company) } : {}),
    ...(input.notes !== undefined ? { notes: toNullableText(input.notes) } : {}),
    ...(input.tags !== undefined ? { tags: Array.isArray(input.tags) ? input.tags.map(sanitizeText).filter(Boolean) : [] } : {}),
    ...(input.isVip !== undefined ? { is_vip: Boolean(input.isVip) } : {}),
    ...(input.isBlacklisted !== undefined ? { is_blacklisted: Boolean(input.isBlacklisted) } : {}),
    updated_at: nowIso(),
  };
  const rows = await requestSupabase(`customers?id=eq.${escapeFilterValue(normalizedId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body });
  return Array.isArray(rows) ? rows[0] : null;
};

module.exports = {
  createConversationWithFirstMessage,
  getConversationById,
  listAdminConversations,
  listMessagesByConversation,
  addCustomerMessage,
  addAdminMessage,
  updateConversationStatus,
  markAdminRead,
  markCustomerRead,
  updateCustomerProfile,
};
