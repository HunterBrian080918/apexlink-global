const STORAGE_KEY = "northstar-platform-store-v1";

const navItems = [
  { id: "dashboard", label: "Dashboard", title: "Data Overview" },
  { id: "orders", label: "Orders", title: "Inquiry Management" },
  { id: "payments", label: "Payments", title: "Payment Records" },
  { id: "products", label: "Products", title: "Product Catalog" },
  { id: "media", label: "Media", title: "Media Library" },
  { id: "customers", label: "Customers", title: "Customer Support" },
  { id: "website", label: "Website", title: "Website Management" },
  { id: "settings", label: "Settings", title: "System Settings" },
  { id: "storefront", label: "Open Storefront", href: "/", external: true },
];
const productEditorTabs = [
  { id: "basic", label: "Basic" },
  { id: "media", label: "Media" },
  { id: "description", label: "Description" },
  { id: "specifications", label: "Specifications" },
  { id: "ai-match", label: "AI Match" },
  { id: "seo", label: "SEO" },
];

const adminState = {
  activeSection: "dashboard",
  theme: localStorage.getItem("northstar-admin-theme") || "light",
  orders: {
    query: "",
    status: "all",
    selectedId: null,
    timeline: {
      orderId: null,
      loading: false,
      error: "",
      items: [],
      requestId: 0,
    },
  },
  payments: {
    mode: "list",
    selectedId: null,
    query: "",
    status: "all",
    orderFilterId: "",
  },
  customers: {
    selectedId: null,
    query: "",
    status: "all",
    conversationType: "all",
  },
  products: {
    mode: "list",
    editingId: null,
    editorTab: "basic",
  },
  media: {
    query: "",
    usageType: "all",
    folder: "all",
  },
};
const ORDER_CENTER_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];
const ADMIN_SUPPORT_MESSAGE_POLL_MS = 2000;
const ADMIN_SUPPORT_LIST_POLL_MS = 5000;
const SUPPORT_QUICK_REPLIES = [
  "Thanks. We are reviewing your request now.",
  "Please confirm your target quantity and destination port.",
  "We can share pricing after MOQ and packaging are confirmed.",
];
const adminSupportRuntime = {
  conversations: [],
  selected: null,
  messages: [],
  customerOrders: [],
  detailError: "",
  sendStatusMessage: "",
  sendStatusType: "neutral",
  liveState: "offline",
  liveLabel: "",
  listPollTimer: null,
  messagePollTimer: null,
  isListPolling: false,
  isMessagePolling: false,
  isSending: false,
};

const shell = document.querySelector("#admin-shell");
const loginShell = document.querySelector("#admin-login-shell");
const loginForm = document.querySelector("#admin-login-form");
const loginError = document.querySelector("#admin-login-error");
const navRoot = document.querySelector("#admin-nav");
const contentRoot = document.querySelector("#admin-content");
const sectionLabel = document.querySelector("#admin-section-label");
const sectionTitle = document.querySelector("#admin-section-title");
const themeToggle = document.querySelector("#admin-theme-toggle");
const logoutButton = document.querySelector("#admin-logout-button");
const brandRoot = document.querySelector(".admin-brand");
const brandImage = brandRoot?.querySelector("img");
const brandStrong = brandRoot?.querySelector("strong");
const brandSmall = brandRoot?.querySelector("small");
const loginKicker = document.querySelector(".admin-kicker");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const nowMs = () => performance.now();
const durationMs = (startedAt) => Math.round(nowMs() - startedAt);
const logAdminSupportTiming = (scope, timings) => {
  try {
    console.info(`[support-admin][client][${scope}] ${JSON.stringify(timings)}`);
  } catch (error) {
    console.info(`[support-admin][client][${scope}]`, timings);
  }
};

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    throw new Error(String(payload?.error || `Request failed with status ${response.status}.`));
  }

  return payload;
};

const fetchAdminOrders = async () => {
  const payload = await requestJson("/api/orders", {
    method: "GET",
  });
  return Array.isArray(payload?.orders) ? payload.orders : [];
};

const fetchAdminOrder = async (orderId) => {
  const payload = await requestJson(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
  });
  return payload?.order || null;
};

const updateAdminOrder = async (orderId, order) => {
  const payload = await requestJson(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    body: JSON.stringify({ order }),
  });
  return payload?.order || null;
};

const updateAdminOrderPaymentStatus = async (orderId, paymentStatus) => {
  const payload = await requestJson(`/api/orders/${encodeURIComponent(orderId)}/payment-status`, {
    method: "PATCH",
    body: JSON.stringify({ paymentStatus }),
  });
  return payload?.order || null;
};

const fetchAdminOrderPayments = async (orderId) => {
  const payload = await requestJson(`/api/orders/${encodeURIComponent(orderId)}/payments`, {
    method: "GET",
  });
  return Array.isArray(payload?.payments) ? payload.payments : [];
};

const fetchAdminOrderEvents = async (orderId) => {
  const payload = await requestJson(`/api/orders/${encodeURIComponent(orderId)}/events`, {
    method: "GET",
  });
  return Array.isArray(payload?.events) ? payload.events : [];
};

const sortTimelineEvents = (items) =>
  (Array.isArray(items) ? items : [])
    .slice()
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

const loadAdminOrderTimeline = async (orderId) => {
  const normalizedOrderId = String(orderId || "").trim();

  if (!normalizedOrderId) {
    adminState.orders.timeline = {
      orderId: null,
      loading: false,
      error: "",
      items: [],
      requestId: 0,
    };
    return;
  }

  const requestId = Date.now();
  adminState.orders.timeline = {
    orderId: normalizedOrderId,
    loading: true,
    error: "",
    items: [],
    requestId,
  };

  try {
    const items = await fetchAdminOrderEvents(normalizedOrderId);

  if (
    adminState.orders.timeline.orderId !== normalizedOrderId ||
    adminState.orders.timeline.requestId !== requestId
  ) {
      return;
    }

    adminState.orders.timeline = {
      orderId: normalizedOrderId,
      loading: false,
      error: "",
      items: sortTimelineEvents(items),
      requestId,
    };
  } catch (error) {
    if (
      adminState.orders.timeline.orderId !== normalizedOrderId ||
      adminState.orders.timeline.requestId !== requestId
    ) {
      return;
    }

    adminState.orders.timeline = {
      orderId: normalizedOrderId,
      loading: false,
      error: error?.message || "Unknown error.",
      items: [],
      requestId,
    };
  }

  if (
    ["orders", "order"].includes(adminState.activeSection) &&
    adminState.orders.selectedId === normalizedOrderId
  ) {
    await renderCurrentSection();
  }
};

const deleteAdminOrder = async (orderId) =>
  requestJson(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: "DELETE",
    body: JSON.stringify({}),
  });

const fetchAdminPayments = async () => {
  const payload = await requestJson("/api/payments", {
    method: "GET",
  });
  return Array.isArray(payload?.payments) ? payload.payments : [];
};

const fetchAdminPayment = async (paymentId) => {
  const payload = await requestJson(`/api/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
  });
  return payload?.payment || null;
};

const updateAdminPayment = async (paymentId, payment) => {
  const payload = await requestJson(`/api/payments/${encodeURIComponent(paymentId)}`, {
    method: "PATCH",
    body: JSON.stringify({ payment }),
  });
  return payload?.payment || null;
};

const fetchAdminSupportConversations = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.query) {
    params.set("q", String(filters.query).trim());
  }
  if (filters.status && filters.status !== "all") {
    params.set("status", String(filters.status).trim());
  }
  if (filters.conversationType && filters.conversationType !== "all") {
    params.set("type", String(filters.conversationType).trim());
  }

  const payload = await requestJson(
    `/api/admin/support/conversations${params.toString() ? `?${params.toString()}` : ""}`,
    {
      method: "GET",
    }
  );
  return Array.isArray(payload?.conversations) ? payload.conversations : [];
};

const fetchAdminSupportConversation = async (conversationId) => {
  const payload = await requestJson(`/api/admin/support/conversations/${encodeURIComponent(conversationId)}`, {
    method: "GET",
  });
  return payload?.conversation || null;
};

const fetchAdminSupportMessages = async (conversationId) => {
  const payload = await requestJson(`/api/admin/support/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "GET",
  });
  return Array.isArray(payload?.messages) ? payload.messages : [];
};

const fetchAdminSupportMessageSnapshot = async (conversationId) => {
  const payload = await requestJson(`/api/admin/support/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "GET",
  });
  return {
    conversation: payload?.conversation || null,
    messages: Array.isArray(payload?.messages) ? payload.messages : [],
  };
};

const createAdminSupportMessage = async (conversationId, message) => {
  const payload = await requestJson(`/api/admin/support/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
  return {
    conversation: payload?.conversation || null,
    message: payload?.message || null,
  };
};

const updateAdminSupportConversation = async (conversationId, conversation) => {
  const payload = await requestJson(`/api/admin/support/conversations/${encodeURIComponent(conversationId)}`, {
    method: "PATCH",
    body: JSON.stringify({ conversation }),
  });
  return payload?.conversation || null;
};

const markAdminSupportConversationRead = async (conversationId) => {
  const payload = await requestJson(`/api/admin/support/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return payload?.conversation || null;
};

const getAdminSupportLiveLabel = (state) =>
  ({
    connecting: "Connecting...",
    connected: "Connected",
    reconnecting: "Reconnecting...",
    offline: "Offline",
  }[String(state || "").trim().toLowerCase()] || "");

const setAdminSupportLiveState = (state) => {
  adminSupportRuntime.liveState = String(state || "offline").trim().toLowerCase();
  adminSupportRuntime.liveLabel = getAdminSupportLiveLabel(adminSupportRuntime.liveState);

  const liveNode = document.querySelector("#admin-support-live-status");
  if (liveNode) {
    liveNode.textContent = adminSupportRuntime.liveLabel;
    liveNode.dataset.state = adminSupportRuntime.liveState;
  }
};

const getAdminSupportComposerDraft = () =>
  adminState.activeSection === "customers"
    ? String(contentRoot.querySelector("#customer-reply-form textarea")?.value || "")
    : "";

const getSelectedSupportConversation = () =>
  adminSupportRuntime.conversations.find((thread) => thread.id === adminState.customers.selectedId) || null;

const sortSupportConversations = (items) =>
  (Array.isArray(items) ? items : [])
    .slice()
    .sort((left, right) => {
      const rightTime = new Date(right.lastMessageAt || right.updatedAt || right.createdAt).getTime();
      const leftTime = new Date(left.lastMessageAt || left.updatedAt || left.createdAt).getTime();
      return rightTime - leftTime;
    });

const mergeAdminSupportConversation = (conversation) => {
  if (!conversation?.id) {
    return;
  }

  const nextItems = adminSupportRuntime.conversations.filter((item) => item.id !== conversation.id);
  nextItems.push({
    ...(adminSupportRuntime.conversations.find((item) => item.id === conversation.id) || {}),
    ...conversation,
  });
  adminSupportRuntime.conversations = sortSupportConversations(nextItems);

  if (adminState.customers.selectedId === conversation.id || !adminState.customers.selectedId) {
    adminSupportRuntime.selected = {
      ...(adminSupportRuntime.selected || {}),
      ...conversation,
    };
    if (!adminState.customers.selectedId) {
      adminState.customers.selectedId = conversation.id;
    }
  }
};

const mergeAdminSupportMessage = (message) => {
  if (!message?.id || !message?.conversationId || message.conversationId !== adminState.customers.selectedId) {
    return;
  }

  const nextMessages = adminSupportRuntime.messages.filter((item) => item.id !== message.id);
  nextMessages.push(message);
  nextMessages.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  adminSupportRuntime.messages = nextMessages;
};

const stopAdminSupportPolling = () => {
  if (adminSupportRuntime.messagePollTimer) {
    window.clearInterval(adminSupportRuntime.messagePollTimer);
    adminSupportRuntime.messagePollTimer = null;
  }
  if (adminSupportRuntime.listPollTimer) {
    window.clearInterval(adminSupportRuntime.listPollTimer);
    adminSupportRuntime.listPollTimer = null;
  }
};

const stopAdminSupportLiveSync = () => {
  stopAdminSupportPolling();
  setAdminSupportLiveState("offline");
};

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
};

const formatShortDate = (value) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "-"
    : parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
};

const formatCompactTime = (value) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatConversationListTime = (value) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  const now = new Date();
  const isSameDay =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate();

  return isSameDay
    ? formatCompactTime(value)
    : parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
};

const getAdminConversationPreview = (thread) =>
  String(
    thread?.lastMessageText ||
      thread?.relatedOrderNumber ||
      thread?.relatedProductName ||
      "Support conversation"
  ).trim();

const getAdminConversationContext = (thread) => {
  const segments = [
    formatStatusLabel(thread?.conversationType || "") || "Support conversation",
    thread?.relatedOrderNumber ? `Order ${thread.relatedOrderNumber}` : "",
    thread?.relatedProductName || "",
  ].filter(Boolean);

  return segments.join(" • ");
};

const isAdminChatNearBottom = (threshold = 72) => {
  const historyNode = contentRoot.querySelector(".admin-chat-history");
  if (!historyNode) {
    return true;
  }

  const remaining = historyNode.scrollHeight - historyNode.scrollTop - historyNode.clientHeight;
  return remaining <= threshold;
};

const scrollAdminChatToBottom = () => {
  const historyNode = contentRoot.querySelector(".admin-chat-history");
  if (historyNode) {
    historyNode.scrollTop = historyNode.scrollHeight;
  }
};

const createAdminChatMessageMarkup = (message, selectedConversation) => {
  const isCustomer = message.sender === "customer";
  const label =
    message.sender === "system"
      ? "System"
      : isCustomer
        ? selectedConversation?.customerName || "Customer"
        : "Admin";

  return `
    <article class="admin-chat-message ${isCustomer ? "is-customer" : "is-admin"}" data-message-id="${escapeHtml(
      message.id || ""
    )}">
      <div class="admin-chat-bubble">
        ${message.image ? `<img class="admin-chat-image" src="${escapeHtml(message.image)}" alt="Shared image">` : ""}
        ${message.text ? `<p>${escapeHtml(message.text)}</p>` : ""}
      </div>
      <div class="admin-chat-meta">
        <span>${escapeHtml(label)}</span>
        <small>${escapeHtml(formatCompactTime(message.createdAt))}</small>
      </div>
    </article>
  `;
};

const createAdminConversationRowMarkup = (thread, selectedId) => `
  <button
    type="button"
    class="admin-thread-row ${thread.id === selectedId ? "is-active" : ""}"
    data-thread-id="${escapeHtml(thread.id)}"
  >
    <div class="admin-thread-main">
      <strong>${escapeHtml(thread.customerName || "Website Visitor")}</strong>
      <span class="admin-thread-email">${escapeHtml(thread.email || "No email")}</span>
      <p class="admin-thread-preview">${escapeHtml(getAdminConversationPreview(thread))}</p>
    </div>
    <div class="admin-thread-side">
      <small>${escapeHtml(formatConversationListTime(thread.lastMessageAt || thread.updatedAt))}</small>
      ${thread.adminUnreadCount ? `<span class="admin-unread-badge">${formatNumber(thread.adminUnreadCount)}</span>` : ""}
    </div>
  </button>
`;

const formatNumber = (value) => new Intl.NumberFormat().format(Number(value || 0));
const formatMoney = (value, currency = "USD") => {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount)) {
    return "-";
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    return `${String(currency || "USD").toUpperCase()} ${amount.toFixed(2)}`;
  }
};
const toTextareaValue = (items) => (Array.isArray(items) ? items.join("\n") : "");

const parseTextList = (value) =>
  String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
const uniqueTextList = (items) =>
  Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );

const specsToTextarea = (specs) =>
  Object.entries(specs || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

const parseSpecs = (value) =>
  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((accumulator, line) => {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = line.slice(0, separatorIndex).trim();
      const entryValue = line.slice(separatorIndex + 1).trim();

      if (key && entryValue) {
        accumulator[key] = entryValue;
      }

      return accumulator;
    }, {});
const getSpecEntries = (specs) => {
  const entries = Object.entries(specs || {}).filter(([key, value]) => String(key || "").trim() || String(value || "").trim());
  return entries.length ? entries : [["", ""]];
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });

const getStatusClass = (status) => `status-${String(status || "").toLowerCase()}`;
const formatPaymentStatusLabel = (status) =>
  String(status || "")
    .replace(/_/g, "-")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Pending";
const STATUS_LABEL_CONFIG = {
  unprocessed: "Unprocessed",
  processed: "Processed",
  pending_payment: "Pending Payment",
  inquiry_received: "Inquiry Received",
  quote_pending: "Quote Pending",
  awaiting_confirmation: "Awaiting Confirmation",
  awaiting_deposit: "Awaiting Deposit",
  in_production: "In Production",
  quality_inspection: "Quality Inspection",
  awaiting_balance: "Awaiting Balance",
  ready_to_ship: "Ready to Ship",
  not_started: "Not Started",
  in_transit: "In Transit",
  deposit_paid: "Deposit Paid",
  partially_paid: "Partially Paid",
  partially_refunded: "Partially Refunded",
};
const formatPaymentTypeLabel = (type) =>
  ({
    deposit: "Deposit",
    "full-payment": "Full Payment",
    balance: "Balance",
    refund: "Refund",
  }[String(type || "").trim().toLowerCase()] || "Full Payment");
const formatStatusLabel = (value) =>
  STATUS_LABEL_CONFIG[String(value || "").trim().toLowerCase()] ||
  String(value || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (part) => part.toUpperCase()) || "-";
const INTERNAL_ORDER_STATUSES = ["unprocessed", "processed"];
const RETAIL_ORDER_STATUSES = ["pending_payment", "processing", "shipped", "delivered", "completed", "cancelled"];
const WHOLESALE_ORDER_STATUSES = [
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
];
const SUPPORT_CONVERSATION_STATUSES = ["open", "waiting_admin", "waiting_customer", "resolved", "closed"];
const SUPPORT_CONVERSATION_TYPES = [
  "general_contact",
  "product_inquiry",
  "order_support",
  "wholesale_inquiry",
];
const PAYMENT_STATUSES = [
  "unpaid",
  "pending",
  "deposit_paid",
  "partially_paid",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
  "cancelled",
];
const SHIPPING_STATUSES = ["not_started", "preparing", "packed", "shipped", "in_transit", "delivered", "exception"];
const PAYMENT_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid / Confirmed" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
];
const PAYMENT_REVIEW_STATUSES = ["pending", "paid", "failed", "refunded", "cancelled"];
const isCompactAdminViewport = () => window.matchMedia("(max-width: 1200px)").matches;
const normalizeStatusValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

const normalizeAdminSection = (value) => {
  const nextSection = String(value || "").trim().toLowerCase();
  if (nextSection === "order") {
    return "order";
  }
  return navItems.some((item) => item.id === nextSection && !item.href) ? nextSection : "dashboard";
};

const getAdminActiveNavSection = () => (adminState.activeSection === "order" ? "orders" : adminState.activeSection);

const getOrderListStatusLabel = (order) => {
  const orderStatus = normalizeStatusValue(order?.orderStatus);
  const paymentStatus = normalizeStatusValue(order?.paymentStatus);
  const shippingStatus = normalizeStatusValue(order?.shippingStatus);

  if (orderStatus === "cancelled") {
    return "Cancelled";
  }

  if (["paid", "deposit_paid", "partially_paid"].includes(paymentStatus)) {
    return "Paid";
  }

  if (["processing", "in_production", "quality_inspection", "awaiting_balance", "ready_to_ship"].includes(orderStatus)) {
    return "Processing";
  }

  if (["shipped", "in_transit"].includes(shippingStatus) || orderStatus === "shipped") {
    return "Shipped";
  }

  if (["completed", "delivered"].includes(orderStatus) || shippingStatus === "delivered") {
    return "Completed";
  }

  return "Pending";
};

const matchesAdminOrderListFilter = (order, filter) => {
  const normalizedFilter = normalizeStatusValue(filter || "all");
  if (normalizedFilter === "all") {
    return true;
  }

  const orderStatus = normalizeStatusValue(order?.orderStatus);
  const paymentStatus = normalizeStatusValue(order?.paymentStatus);
  const shippingStatus = normalizeStatusValue(order?.shippingStatus);

  if (normalizedFilter === "pending") {
    return [
      "pending_payment",
      "inquiry_received",
      "quote_pending",
      "awaiting_confirmation",
      "awaiting_deposit",
      "awaiting_payment",
      "payment_submitted",
      "unpaid",
    ].includes(orderStatus) || ["pending", "awaiting_payment", "payment_submitted", "unpaid"].includes(paymentStatus);
  }

  if (normalizedFilter === "paid") {
    return ["paid", "deposit_paid", "partially_paid"].includes(paymentStatus);
  }

  if (normalizedFilter === "processing") {
    return ["processing", "in_production", "quality_inspection", "awaiting_balance", "ready_to_ship"].includes(orderStatus);
  }

  if (normalizedFilter === "shipped") {
    return ["shipped", "in_transit"].includes(shippingStatus) || orderStatus === "shipped";
  }

  if (normalizedFilter === "completed") {
    return ["completed", "delivered"].includes(orderStatus) || shippingStatus === "delivered";
  }

  if (normalizedFilter === "cancelled") {
    return orderStatus === "cancelled";
  }

  return true;
};

const hydrateAdminRouteFromLocation = () => {
  const params = new URLSearchParams(window.location.search);
  adminState.activeSection = normalizeAdminSection(params.get("section"));

  if (adminState.activeSection === "orders" || adminState.activeSection === "order") {
    adminState.orders.selectedId =
      String(params.get("id") || params.get("orderId") || "").trim() || null;
  }

  if (adminState.activeSection === "payments") {
    adminState.payments.orderFilterId = String(params.get("orderId") || "").trim();
    adminState.payments.selectedId = null;
    adminState.payments.mode = "list";
  }
};

const syncAdminRoute = (mode = "replace") => {
  const params = new URLSearchParams();
  if (adminState.activeSection !== "dashboard") {
    params.set("section", adminState.activeSection);
  }

  if (adminState.activeSection === "order" && adminState.orders.selectedId) {
    params.set("id", adminState.orders.selectedId);
  }

  if (adminState.activeSection === "payments") {
    if (adminState.payments.orderFilterId) {
      params.set("orderId", adminState.payments.orderFilterId);
    }
    if (adminState.payments.selectedId) {
      params.set("paymentId", adminState.payments.selectedId);
    }
  }

  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl === currentUrl) {
    return;
  }

  const historyMethod = mode === "push" ? "pushState" : "replaceState";
  window.history[historyMethod]({}, "", nextUrl);
};

const buildPaymentFilterMatcher = (filter) => {
  const normalizedFilter = String(filter || "all").trim().toLowerCase();
  if (normalizedFilter === "pending") {
    return new Set(["pending", "unpaid", "awaiting_payment", "payment_submitted"]);
  }
  if (normalizedFilter === "paid") {
    return new Set(["paid", "confirmed", "deposit_paid", "partially_paid"]);
  }
  if (normalizedFilter === "failed") {
    return new Set(["failed"]);
  }
  if (normalizedFilter === "refunded") {
    return new Set(["refunded", "partially_refunded"]);
  }
  if (normalizedFilter === "cancelled") {
    return new Set(["cancelled"]);
  }
  return null;
};

const getPaymentStatusSelectOptions = (currentStatus) => {
  const normalizedCurrent = normalizeStatusValue(currentStatus);
  const options = normalizedCurrent && !PAYMENT_REVIEW_STATUSES.includes(normalizedCurrent)
    ? [normalizedCurrent, ...PAYMENT_REVIEW_STATUSES]
    : PAYMENT_REVIEW_STATUSES.slice();
  return [...new Set(options)];
};

const buildOrderProgressSteps = (order) => {
  const normalizedOrderStatus = normalizeStatusValue(order?.orderStatus);
  const normalizedPaymentStatus = normalizeStatusValue(order?.paymentStatus);
  const normalizedShippingStatus = normalizeStatusValue(order?.shippingStatus);
  const normalizedProcessingStatus = normalizeStatusValue(order?.status);
  const isWholesale = normalizeStatusValue(order?.purchaseMode) === "wholesale";
  const isCancelled = normalizedOrderStatus === "cancelled";
  const steps = isWholesale
    ? [
        { id: "inquiry_received", label: "Inquiry Received" },
        { id: "reviewing", label: "Reviewing" },
        { id: "quoted", label: "Quoted" },
        { id: "confirmed", label: "Confirmed" },
        { id: "production", label: "Production" },
        { id: "ready_to_ship", label: "Ready to Ship" },
        { id: "shipped", label: "Shipped" },
        { id: "completed", label: "Completed" },
      ]
    : [
        { id: "order_created", label: "Order Created" },
        { id: "payment_pending", label: "Payment Pending" },
        { id: "payment_confirmed", label: "Payment Confirmed" },
        { id: "processing", label: "Processing" },
        { id: "ready_to_ship", label: "Ready to Ship" },
        { id: "shipped", label: "Shipped" },
        { id: "completed", label: "Completed" },
      ];

  if (isCancelled) {
    return {
      cancelled: true,
      steps,
      currentIndex: -1,
    };
  }

  let currentStepId = isWholesale ? "inquiry_received" : "order_created";
  if (isWholesale) {
    if (["completed", "delivered"].includes(normalizedOrderStatus)) {
      currentStepId = "completed";
    } else if (normalizedOrderStatus === "shipped" || ["shipped", "in_transit", "delivered"].includes(normalizedShippingStatus)) {
      currentStepId = "shipped";
    } else if (
      normalizedOrderStatus === "ready_to_ship" ||
      ["packed", "preparing"].includes(normalizedShippingStatus)
    ) {
      currentStepId = "ready_to_ship";
    } else if (["in_production", "quality_inspection", "awaiting_balance"].includes(normalizedOrderStatus)) {
      currentStepId = "production";
    } else if (normalizedOrderStatus === "awaiting_deposit") {
      currentStepId = "confirmed";
    } else if (normalizedOrderStatus === "awaiting_confirmation") {
      currentStepId = "quoted";
    } else if (normalizedOrderStatus === "quote_pending") {
      currentStepId = "reviewing";
    }
  } else if (normalizedOrderStatus === "completed" || normalizedOrderStatus === "delivered") {
    currentStepId = "completed";
  } else if (
    normalizedOrderStatus === "shipped" ||
    ["shipped", "in_transit", "delivered"].includes(normalizedShippingStatus)
  ) {
    currentStepId = "shipped";
  } else if (["packed", "preparing"].includes(normalizedShippingStatus)) {
    currentStepId = "ready_to_ship";
  } else if (normalizedOrderStatus === "processing" || normalizedProcessingStatus === "processed") {
    currentStepId = "processing";
  } else if (["paid", "deposit_paid", "partially_paid"].includes(normalizedPaymentStatus)) {
    currentStepId = "payment_confirmed";
  } else if (["pending", "unpaid", "awaiting_payment", "payment_submitted"].includes(normalizedPaymentStatus)) {
    currentStepId = "payment_pending";
  }

  return {
    cancelled: false,
    steps,
    currentIndex: Math.max(
      0,
      steps.findIndex((step) => step.id === currentStepId)
    ),
  };
};

const formatOrderEventDescription = (event) => {
  const text = String(event?.description || "").trim();
  if (!text) {
    return "No description provided.";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const renderEmptyState = (title, text) => `
  <div class="admin-empty-state">
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(text)}</p>
  </div>
`;

const MEDIA_USAGE_OPTIONS = [
  { value: "all", label: "All Usage Types" },
  { value: "product_main", label: "Product Main" },
  { value: "product_gallery", label: "Product Gallery" },
  { value: "brand_logo", label: "Brand Logo" },
  { value: "favicon", label: "Favicon" },
  { value: "homepage_hero", label: "Homepage Hero" },
  { value: "about", label: "About" },
  { value: "support", label: "Support" },
  { value: "misc", label: "Misc" },
];
const MEDIA_FOLDER_OPTIONS = [
  { value: "all", label: "All Folders" },
  { value: "apexlink/products", label: "avelixlink/products" },
  { value: "apexlink/products/gallery", label: "avelixlink/products/gallery" },
  { value: "apexlink/brand", label: "avelixlink/brand" },
  { value: "apexlink/homepage", label: "avelixlink/homepage" },
  { value: "apexlink/about", label: "avelixlink/about" },
  { value: "apexlink/support", label: "avelixlink/support" },
  { value: "apexlink/misc", label: "avelixlink/misc" },
];
const CLOUDINARY_URL_PREFIX = "https://res.cloudinary.com/";
const LOGO_FALLBACK_SRC = "/assets/brand/avelixlink-mark.png";

const formatMediaBytes = (value) => {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatMediaDimensions = (asset) => {
  const width = Number(asset?.width || 0);
  const height = Number(asset?.height || 0);
  return width > 0 && height > 0 ? `${width} x ${height}` : "Unknown size";
};

const formatMediaTimestamp = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

const createMediaAssetCardMarkup = (asset, options = {}) => {
  const selectable = Boolean(options.selectable);
  const selected = Boolean(options.selected);
  const actions = options.actions || [];
  const cardAttributes = selectable
    ? ` role="button" tabindex="0" data-media-select-id="${escapeHtml(asset.id)}"`
    : "";
  return `
    <article class="admin-library-card ${selected ? "is-selected" : ""}"${cardAttributes}>
      <div class="admin-library-thumb-wrap">
        <img class="admin-library-thumb" src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.displayName || asset.name || "Media asset")}">
      </div>
      <div class="admin-library-card-body">
        <strong>${escapeHtml(asset.displayName || asset.name || "Untitled asset")}</strong>
        <p>${escapeHtml(asset.publicId || asset.folder || "Cloudinary asset")}</p>
        <div class="admin-library-meta">
          <span>${escapeHtml(formatStatusLabel(asset.usageType || "misc"))}</span>
          <span>${escapeHtml(asset.format?.toUpperCase?.() || "IMG")}</span>
          <span>${escapeHtml(formatMediaBytes(asset.bytes))}</span>
          <span>${escapeHtml(formatMediaDimensions(asset))}</span>
        </div>
        <div class="admin-library-actions">
          ${actions
            .map(
              (action) => `
                <button
                  class="${escapeHtml(action.className || "admin-ghost-button")}"
                  type="button"
                  data-media-action="${escapeHtml(action.action)}"
                  data-media-id="${escapeHtml(asset.id)}"
                >
                  ${escapeHtml(action.label)}
                </button>
              `
            )
            .join("")}
        </div>
      </div>
    </article>
  `;
};

const uploadAdminMediaFiles = async (files, usageType, extra = {}) => {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) {
    return [];
  }
  if (list.length === 1) {
    return [
      await window.NorthstarStore.uploadMediaAsset(list[0], {
        usageType,
        displayName: extra.displayName || list[0].name,
        altText: extra.altText || "",
      }),
    ];
  }
  return window.NorthstarStore.uploadMediaAssets(list, {
    usageType,
    displayName: extra.displayName || "",
    altText: extra.altText || "",
  });
};

const openMediaPicker = ({ title = "Select Media", usageType = "all", allowMultiple = false } = {}) =>
  new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "admin-media-picker";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close(null);
      }
    });

    const state = {
      assets: [],
      query: "",
      usageType,
      loading: false,
      submitting: false,
      selectedIds: new Set(),
      selectedAssets: new Map(),
    };

    const close = (value = null) => {
      overlay.remove();
      resolve(value);
    };

    const toggleSelected = (asset) => {
      if (!allowMultiple) {
        state.selectedIds = new Set([asset.id]);
        state.selectedAssets = new Map([[asset.id, asset]]);
        return;
      }
      if (state.selectedIds.has(asset.id)) {
        state.selectedIds.delete(asset.id);
        state.selectedAssets.delete(asset.id);
      } else {
        state.selectedIds.add(asset.id);
        state.selectedAssets.set(asset.id, asset);
      }
    };

    const render = () => {
      overlay.innerHTML = `
        <div class="admin-media-picker-dialog">
          <div class="admin-media-picker-head">
            <div>
              <h3>${escapeHtml(title)}</h3>
              <p>Reuse Cloudinary assets without uploading duplicates.</p>
            </div>
            <button class="admin-ghost-button" type="button" data-media-picker-close>Close</button>
          </div>
          <div class="admin-library-toolbar">
            <label class="admin-search-field">
              Search
              <input class="admin-search-input" type="search" data-media-picker-query value="${escapeHtml(state.query)}" placeholder="Search filename or public ID">
            </label>
            <label>
              Usage Type
              <select data-media-picker-usage>
                ${MEDIA_USAGE_OPTIONS.map(
                  (option) =>
                    `<option value="${escapeHtml(option.value)}" ${
                      option.value === state.usageType ? "selected" : ""
                    }>${escapeHtml(option.label)}</option>`
                ).join("")}
              </select>
            </label>
            <input class="admin-file-input-hidden" type="file" id="admin-media-picker-upload" accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif" ${
              allowMultiple ? "multiple" : ""
            }>
            <div class="admin-actions-inline">
              <button class="admin-secondary-button" type="button" data-media-picker-upload-trigger ${
                state.submitting ? "disabled" : ""
              }>${state.submitting ? "Uploading..." : "Upload New"}</button>
              <button class="admin-primary-button" type="button" data-media-picker-confirm ${
                state.selectedIds.size ? "" : "disabled"
              }>Use Selected</button>
            </div>
          </div>
          <p class="admin-media-status" data-media-picker-status>${state.loading ? "Loading media..." : ""}</p>
          <div class="admin-library-grid">
            ${
              state.loading
                ? ""
                : state.assets.length
                  ? state.assets
                      .map((asset) =>
                        createMediaAssetCardMarkup(asset, {
                          selectable: true,
                          selected: state.selectedIds.has(asset.id),
                        })
                      )
                      .join("")
                  : renderEmptyState("No media found", "Upload an asset or adjust your filters.")
            }
          </div>
        </div>
      `;

      overlay.querySelector("[data-media-picker-close]")?.addEventListener("click", () => close(null));
      overlay.querySelector("[data-media-picker-query]")?.addEventListener("input", async (event) => {
        state.query = event.target.value || "";
        await loadAssets();
      });
      overlay.querySelector("[data-media-picker-usage]")?.addEventListener("change", async (event) => {
        state.usageType = event.target.value || "all";
        await loadAssets();
      });
      overlay.querySelector("[data-media-picker-upload-trigger]")?.addEventListener("click", () => {
        overlay.querySelector("#admin-media-picker-upload")?.click();
      });
      overlay.querySelector("#admin-media-picker-upload")?.addEventListener("change", async (event) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) {
          return;
        }
        state.submitting = true;
        render();
        try {
          const uploadedAssets = await uploadAdminMediaFiles(files, state.usageType === "all" ? "misc" : state.usageType);
          uploadedAssets.forEach((asset) => {
            state.selectedIds.add(asset.id);
            state.selectedAssets.set(asset.id, asset);
          });
          await loadAssets(false);
        } catch (error) {
          state.loading = false;
          render();
          const statusNode = overlay.querySelector("[data-media-picker-status]");
          if (statusNode) {
            statusNode.textContent = error?.message || "Unable to upload media.";
            statusNode.dataset.state = "error";
          }
        } finally {
          state.submitting = false;
          event.target.value = "";
        }
      });
      overlay.querySelector("[data-media-picker-confirm]")?.addEventListener("click", () => {
        const items = Array.from(state.selectedIds)
          .map((id) => state.selectedAssets.get(id) || state.assets.find((asset) => asset.id === id))
          .filter(Boolean);
        close(allowMultiple ? items : items[0] || null);
      });
      overlay.querySelectorAll("[data-media-select-id]").forEach((card) => {
        const handleSelect = () => {
          const asset = state.assets.find((item) => item.id === card.dataset.mediaSelectId);
          if (!asset) {
            return;
          }
          toggleSelected(asset);
          render();
        };
        card.addEventListener("click", handleSelect);
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleSelect();
          }
        });
      });
    };

    const loadAssets = async (showLoading = true) => {
      state.loading = showLoading;
      render();
      try {
        state.assets = await window.NorthstarStore.listMedia({
          query: state.query,
          usageType: state.usageType,
        });
      } finally {
        state.loading = false;
        render();
      }
    };

    loadAssets();
  });

const buildOrderPaymentHistory = (order, payments) => {
  const items = Array.isArray(payments) ? payments : [];
  const history = items.map((payment) => ({
    id: payment.id,
    label:
      payment.paymentType === "deposit" && order?.depositPercentage
        ? `${escapeHtml(order.depositPercentage)} Deposit`
        : formatPaymentTypeLabel(payment.paymentType),
    status: formatPaymentStatusLabel(payment.status),
  }));

  if ((order?.purchaseMode || "") === "wholesale") {
    const depositExists = items.some((payment) => payment.paymentType === "deposit");
    const balanceExists = items.some((payment) => payment.paymentType === "balance");
    const depositLabel = order?.depositPercentage ? `${escapeHtml(order.depositPercentage)} Deposit` : "Deposit";
    const numericDeposit = Number(String(order?.depositPercentage || "").replace(/[^\d.]/g, ""));
    const balanceLabel =
      Number.isFinite(numericDeposit) && numericDeposit > 0 && numericDeposit < 100
        ? `${100 - numericDeposit}% Balance`
        : "Balance";

    if (!depositExists) {
      history.unshift({
        id: `${order?.id || "order"}-deposit-placeholder`,
        label: depositLabel,
        status: "Not Created",
        placeholder: true,
      });
    }

    if (!balanceExists) {
      history.push({
        id: `${order?.id || "order"}-balance-placeholder`,
        label: balanceLabel,
        status: "Not Created",
        placeholder: true,
      });
    }
  } else if (!items.some((payment) => payment.paymentType === "full-payment")) {
    history.push({
      id: `${order?.id || "order"}-full-placeholder`,
      label: "Full Payment",
      status: "Not Created",
      placeholder: true,
    });
  }

  return history;
};

const deriveOrderPaymentStatusFromPayments = (order, payments) => {
  const items = Array.isArray(payments) ? payments : [];
  const normalizedStatuses = items.map((payment) => String(payment.status || "").trim().toLowerCase().replace(/-/g, "_"));
  const hasRefunded = normalizedStatuses.includes("refunded");
  const hasPaidDeposit = items.some(
    (payment) =>
      payment.paymentType === "deposit" && String(payment.status || "").trim().toLowerCase().replace(/-/g, "_") === "paid"
  );
  const hasPaidBalance = items.some(
    (payment) =>
      payment.paymentType === "balance" && String(payment.status || "").trim().toLowerCase().replace(/-/g, "_") === "paid"
  );
  const hasPaidFull = items.some(
    (payment) =>
      payment.paymentType === "full-payment" && String(payment.status || "").trim().toLowerCase().replace(/-/g, "_") === "paid"
  );
  const hasPending = normalizedStatuses.some((status) => ["pending", "awaiting_payment", "payment_submitted"].includes(status));
  const isWholesale = (order?.purchaseMode || "") === "wholesale";

  if (hasRefunded) {
    return "refunded";
  }

  if (isWholesale) {
    if (hasPaidBalance || hasPaidFull) {
      return "paid";
    }
    if (hasPaidDeposit) {
      return "deposit_paid";
    }
    if (hasPending) {
      return "pending";
    }
    return "unpaid";
  }

  if (hasPaidFull) {
    return "paid";
  }

  if (hasPending) {
    return "pending";
  }

  return "unpaid";
};

const renderNav = () => {
  const activeNavSection = getAdminActiveNavSection();
  navRoot.innerHTML = navItems
    .map(
      (item) =>
        item.href
          ? `
            <a
              class="admin-nav-button admin-nav-link"
              href="${escapeHtml(item.href)}"
              ${item.external ? 'target="_blank" rel="noreferrer"' : ""}
            >
              <span>${escapeHtml(item.label)}</span>
            </a>
          `
          : `
            <button
              type="button"
              class="admin-nav-button ${activeNavSection === item.id ? "is-active" : ""}"
              data-section="${item.id}"
            >
              <span>${escapeHtml(item.label)}</span>
            </button>
          `
    )
    .join("");
};

const openAdminOrderDetail = async (orderId, routeMode = "push") => {
  const nextOrderId = String(orderId || "").trim();
  if (!nextOrderId) {
    return;
  }

  adminState.activeSection = "order";
  adminState.orders.selectedId = nextOrderId;
  adminState.payments.mode = "list";
  adminState.payments.selectedId = null;
  syncAdminRoute(routeMode);
  await renderCurrentSection();
};

const updateTitle = () => {
  const current = navItems.find((item) => item.id === getAdminActiveNavSection()) || navItems[0];
  sectionLabel.textContent = current.label;

  if (adminState.activeSection === "order") {
    sectionTitle.textContent = "Order Detail";
    return;
  }

  if (adminState.activeSection === "products" && adminState.products.mode === "edit") {
    sectionTitle.textContent = adminState.products.editingId ? "Edit Product" : "Add Product";
    return;
  }

  sectionTitle.textContent = current.title;
};

const applyTheme = () => {
  document.body.classList.toggle("theme-dark", adminState.theme === "dark");
  themeToggle.textContent = adminState.theme === "dark" ? "Light Mode" : "Dark Mode";
  localStorage.setItem("northstar-admin-theme", adminState.theme);
};

const applyBrand = (website) => {
  const brand = website?.brand || {};
  const brandName =
    !String(brand.name || "").trim() || ["ApexLink Global", "ApexLink"].includes(String(brand.name || "").trim())
      ? "AvelixLink"
      : String(brand.name || "").trim();
  const logoTop =
    !String(brand.logoTop || "").trim() || String(brand.logoTop || "").trim() === "ApexLink"
      ? "AvelixLink"
      : String(brand.logoTop || "").trim();
  const logoBottom =
    !String(brand.logoBottom || "").trim() || String(brand.logoBottom || "").trim() === "Global"
      ? ""
      : String(brand.logoBottom || "").trim();
  const rawLogoImage = String(brand.logoImage || "").trim();
  const logoImage =
    !rawLogoImage ||
    rawLogoImage === "assets/brand/apexlink-wordmark.png" ||
    rawLogoImage === "/assets/brand/apexlink-wordmark.png"
      ? LOGO_FALLBACK_SRC
      : rawLogoImage === "assets/brand/apexlink-mark.png" || rawLogoImage === "assets/brand/avelixlink-mark.png"
        ? LOGO_FALLBACK_SRC
        : rawLogoImage;

  if (brandImage) {
    brandImage.onerror = () => {
      brandImage.onerror = null;
      brandImage.src = LOGO_FALLBACK_SRC;
    };
    brandImage.src = logoImage;
    brandImage.alt = `${brandName} mark`;
  }

  if (brandStrong) {
    brandStrong.textContent = logoTop;
  }

  if (brandSmall) {
    brandSmall.textContent = logoBottom;
  }

  if (loginKicker) {
    loginKicker.textContent = brandName;
  }

  document.title = `${brandName} Admin`;
};

const showLogin = () => {
  shell?.classList.add("is-hidden");
  loginShell?.classList.remove("is-hidden");
};

const showShell = () => {
  loginShell?.classList.add("is-hidden");
  shell?.classList.remove("is-hidden");
};

const renderLoading = () => {
  contentRoot.innerHTML = `
    <section class="admin-panel">
      <p class="admin-muted">Loading...</p>
    </section>
  `;
};

const buildLineChart = (points) => {
  const values = points.map((item) => Number(item.value || 0));
  const max = Math.max(...values, 1);
  const coords = points
    .map((item, index) => {
      const x = 20 + (index * 280) / Math.max(points.length - 1, 1);
      const y = 128 - (Number(item.value || 0) / max) * 92;
      return { x, y, label: item.label, value: item.value };
    })
    .filter(Boolean);
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(" ");

  return `
    <div class="admin-chart-card">
      <svg viewBox="0 0 320 160" class="admin-chart-svg" aria-hidden="true">
        <path d="M20 128.5H300" class="admin-chart-axis"></path>
        <polyline points="${polyline}" class="admin-chart-line"></polyline>
        ${coords
          .map(
            (point) => `
              <circle cx="${point.x}" cy="${point.y}" r="4" class="admin-chart-dot"></circle>
            `
          )
          .join("")}
      </svg>
      <div class="admin-chart-legend">
        ${points
          .map(
            (point) => `
              <div>
                <span>${escapeHtml(point.label)}</span>
                <strong>${formatNumber(point.value)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
};

const buildBarChart = (points) => {
  const values = points.map((item) => Number(item.value || 0));
  const max = Math.max(...values, 1);
  const barWidth = 26;
  const gap = 14;
  const startX = 32;

  return `
    <div class="admin-chart-card">
      <svg viewBox="0 0 320 160" class="admin-chart-svg" aria-hidden="true">
        <path d="M20 128.5H300" class="admin-chart-axis"></path>
        ${points
          .map((point, index) => {
            const height = (Number(point.value || 0) / max) * 92;
            const x = startX + index * (barWidth + gap);
            const y = 128 - height;
            return `
              <rect
                x="${x}"
                y="${y}"
                width="${barWidth}"
                height="${height}"
                rx="8"
                class="admin-chart-bar"
              ></rect>
            `;
          })
          .join("")}
      </svg>
      <div class="admin-chart-legend">
        ${points
          .map(
            (point) => `
              <div>
                <span>${escapeHtml(point.label)}</span>
                <strong>${formatNumber(point.value)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
};

const toDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const lastSevenDateKeys = () => {
  const keys = [];
  const now = new Date();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const point = new Date(now);
    point.setDate(now.getDate() - offset);
    keys.push(toDateKey(point));
  }

  return keys;
};

const buildOrderTrend = (orders) => {
  const counts = orders.reduce((accumulator, order) => {
    const key = toDateKey(order.createdAt);

    if (key) {
      accumulator[key] = (accumulator[key] || 0) + 1;
    }

    return accumulator;
  }, {});

  return lastSevenDateKeys().map((key) => ({
    key,
    value: Number(counts[key] || 0),
  }));
};

const buildDashboardStats = async () => {
  const [analyticsStats, orders] = await Promise.all([window.NorthstarStore.getDashboardStats(), fetchAdminOrders()]);
  const todayKey = toDateKey();
  const recentOrders = orders
    .slice()
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 5);
  const pendingStatuses = new Set([
    "pending_payment",
    "awaiting_deposit",
    "awaiting_confirmation",
    "inquiry_received",
    "quote_pending",
  ]);
  const processingStatuses = new Set([
    "processing",
    "in_production",
    "quality_inspection",
    "awaiting_balance",
    "ready_to_ship",
  ]);

  return {
    today: {
      visits: analyticsStats?.today?.visits || 0,
      aiMatch: analyticsStats?.today?.aiMatch || 0,
      orders: orders.filter((order) => toDateKey(order.createdAt) === todayKey).length,
    },
    totals: {
      visits: analyticsStats?.totals?.visits || 0,
      aiMatch: analyticsStats?.totals?.aiMatch || 0,
      orders: orders.length,
      pendingOrders: orders.filter((order) => pendingStatuses.has(String(order.orderStatus || ""))).length,
      processingOrders: orders.filter((order) => processingStatuses.has(String(order.orderStatus || ""))).length,
      retailOrders: orders.filter((order) => String(order.purchaseMode || "") === "retail").length,
      wholesaleOrders: orders.filter((order) => String(order.purchaseMode || "") === "wholesale").length,
      products: analyticsStats?.totals?.products || 0,
    },
    trends: {
      visits: Array.isArray(analyticsStats?.trends?.visits) ? analyticsStats.trends.visits : [],
      orders: buildOrderTrend(orders),
    },
    recentOrders,
    environment: analyticsStats?.environment || {
      isDevelopment: false,
    },
  };
};

const renderDashboardSection = async () => {
  const stats = await buildDashboardStats();
  const visitTrend = stats.trends.visits.map((item) => ({
    label: formatShortDate(item.key),
    value: item.value,
  }));
  const orderTrend = stats.trends.orders.map((item) => ({
    label: formatShortDate(item.key),
    value: item.value,
  }));
  const showDevelopmentReset = Boolean(stats.environment?.isDevelopment);

  contentRoot.innerHTML = `
    <div class="admin-stack">
      <section class="admin-stat-grid">
        <article class="admin-stat-card">
          <span>Today Visits</span>
          <strong>${formatNumber(stats.today.visits)}</strong>
        </article>
        <article class="admin-stat-card">
          <span>Total Visits</span>
          <strong>${formatNumber(stats.totals.visits)}</strong>
        </article>
        <article class="admin-stat-card">
          <span>Today AI Match</span>
          <strong>${formatNumber(stats.today.aiMatch)}</strong>
        </article>
        <article class="admin-stat-card">
          <span>Total AI Match</span>
          <strong>${formatNumber(stats.totals.aiMatch)}</strong>
        </article>
        <article class="admin-stat-card">
          <span>Today Orders</span>
          <strong>${formatNumber(stats.today.orders)}</strong>
        </article>
        <article class="admin-stat-card">
          <span>Total Orders</span>
          <strong>${formatNumber(stats.totals.orders)}</strong>
        </article>
        <article class="admin-stat-card">
          <span>Pending Orders</span>
          <strong>${formatNumber(stats.totals.pendingOrders)}</strong>
        </article>
        <article class="admin-stat-card">
          <span>Processing Orders</span>
          <strong>${formatNumber(stats.totals.processingOrders)}</strong>
        </article>
        <article class="admin-stat-card">
          <span>Retail Orders</span>
          <strong>${formatNumber(stats.totals.retailOrders)}</strong>
        </article>
        <article class="admin-stat-card">
          <span>Wholesale Orders</span>
          <strong>${formatNumber(stats.totals.wholesaleOrders)}</strong>
        </article>
        <article class="admin-stat-card">
          <span>Total Products</span>
          <strong>${formatNumber(stats.totals.products)}</strong>
        </article>
      </section>

      <section class="admin-chart-grid">
        <article class="admin-panel">
          <div class="admin-panel-header">
            <div>
              <h3>Last 7 Days Visits</h3>
              <p>Traffic trend only. No editing actions on this page.</p>
            </div>
            ${
              showDevelopmentReset
                ? '<button class="admin-secondary-button" type="button" id="dashboard-reset-analytics">Reset Test Analytics</button>'
                : ""
            }
          </div>
          ${buildLineChart(visitTrend)}
        </article>

        <article class="admin-panel">
          <div class="admin-panel-header">
            <div>
              <h3>Last 7 Days Orders</h3>
              <p>Daily order volume from the live order API.</p>
            </div>
          </div>
          ${buildBarChart(orderTrend)}
        </article>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-header">
          <div>
            <h3>Latest 5 Orders</h3>
            <p>Newest orders and wholesale requests from the website.</p>
          </div>
        </div>
        ${
          stats.recentOrders.length
            ? `
              <div class="admin-recent-list">
                ${stats.recentOrders
                  .map(
                    (order) => `
                      <article class="admin-recent-item">
                        <div>
                          <strong>${escapeHtml(order.customerName || "Unknown Visitor")}</strong>
                          <p>${escapeHtml(order.productName || "Order")} · ${escapeHtml(
                            order.country || "No country"
                          )}</p>
                        </div>
                        <div class="admin-recent-meta">
                          <span class="admin-pill ${getStatusClass(order.orderStatus || order.status)}">${escapeHtml(
                            formatStatusLabel(order.orderStatus || order.status)
                          )}</span>
                          <small>${escapeHtml(formatDate(order.createdAt))}</small>
                        </div>
                      </article>
                    `
                  )
                  .join("")}
              </div>
            `
            : renderEmptyState("No orders yet", "New website orders will appear here.")
        }
      </section>
    </div>
  `;

  document.querySelector("#dashboard-reset-analytics")?.addEventListener("click", async () => {
    await window.NorthstarStore.resetDevelopmentAnalytics();
    await renderDashboardSection();
  });
};

const renderOrdersSectionLegacy = async () => {
  const orders = await fetchAdminOrders();
  const query = adminState.orders.query.trim().toLowerCase();
  const filtered = orders.filter((inquiry) => {
    const matchesStatus =
      adminState.orders.status === "all" ? true : inquiry.status === adminState.orders.status;

    if (!matchesStatus) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      inquiry.customerName,
      inquiry.country,
      inquiry.email,
      inquiry.phone,
      inquiry.productName,
      inquiry.message,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  if (!filtered.some((item) => item.id === adminState.orders.selectedId)) {
    adminState.orders.selectedId = filtered[0]?.id || null;
  }
  syncAdminRoute("replace");

  const selectedSummary = filtered.find((item) => item.id === adminState.orders.selectedId) || null;
  const [selected, selectedPayments] = selectedSummary
    ? await Promise.all([
      fetchAdminOrder(selectedSummary.id),
      fetchAdminOrderPayments(selectedSummary.id),
    ])
    : [null, []];
  if (!selectedSummary) {
    adminState.orders.timeline = {
      orderId: null,
      loading: false,
      error: "",
      items: [],
      requestId: 0,
    };
  } else if (
    adminState.orders.timeline.orderId !== selectedSummary.id &&
    !adminState.orders.timeline.loading
  ) {
    const nextRequestId = Date.now();
    adminState.orders.timeline = {
      orderId: selectedSummary.id,
      loading: true,
      error: "",
      items: [],
      requestId: nextRequestId,
    };
    void loadAdminOrderTimeline(selectedSummary.id);
  }
  const timelineState =
    selectedSummary && adminState.orders.timeline.orderId === selectedSummary.id
      ? adminState.orders.timeline
      : {
          orderId: selectedSummary?.id || null,
          loading: Boolean(selectedSummary),
          error: "",
          items: [],
          requestId: 0,
        };
  const paymentHistory = selected ? buildOrderPaymentHistory(selected, selectedPayments) : [];
  const orderStatusOptions =
    (selected?.purchaseMode || "") === "wholesale" ? WHOLESALE_ORDER_STATUSES : RETAIL_ORDER_STATUSES;

  contentRoot.innerHTML = `
    <div class="admin-stack">
      <section class="admin-toolbar">
        <label class="admin-search-field">
          <span>Search</span>
          <input
            id="orders-search"
            class="admin-search-input"
            type="search"
            placeholder="Search customer, product, country, email"
            value="${escapeHtml(adminState.orders.query)}"
          >
        </label>
        <div class="admin-filter-tabs">
          ${["all", ...INTERNAL_ORDER_STATUSES]
            .map(
              (status) => `
                <button
                  type="button"
                  class="admin-filter-chip ${adminState.orders.status === status ? "is-active" : ""}"
                  data-order-filter="${status}"
                >
                  ${escapeHtml(status === "all" ? "All" : status)}
                </button>
              `
            )
            .join("")}
        </div>
      </section>

      <div class="admin-split-layout">
        <section class="admin-panel admin-list-panel">
          <div class="admin-panel-header">
            <div>
              <h3>All Orders</h3>
              <p>${formatNumber(filtered.length)} result${filtered.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          ${
            filtered.length
              ? `
                <div class="admin-order-list">
                  ${filtered
                    .map(
                      (inquiry) => `
                        <button
                          type="button"
                          class="admin-order-row ${inquiry.id === selectedSummary?.id ? "is-active" : ""}"
                          data-order-id="${escapeHtml(inquiry.id)}"
                        >
                          <div class="admin-order-row-main">
                            <strong>${escapeHtml(inquiry.customerName || "Unknown Visitor")}</strong>
                            <p>${escapeHtml(inquiry.productName || "General Inquiry")}</p>
                          </div>
                          <div class="admin-order-row-meta">
                            <span>${escapeHtml(inquiry.orderNumber || inquiry.orderId || inquiry.id)}</span>
                            <span class="admin-pill ${getStatusClass(inquiry.status)}">${escapeHtml(formatStatusLabel(
                              inquiry.status
                            ))}</span>
                          </div>
                        </button>
                      `
                    )
                    .join("")}
                </div>
              `
              : renderEmptyState("No inquiries yet", "Filtered inquiry results will appear here.")
          }
        </section>

        <section class="admin-panel admin-detail-panel">
          ${
            selected
              ? `
                <div class="admin-panel-header">
                  <div>
                    <h3>${escapeHtml(selected.customerName || "Order Detail")}</h3>
                    <p>${escapeHtml(selected.orderNumber || selected.orderId || selected.id || "-")}</p>
                  </div>
                  <span class="admin-pill ${getStatusClass(selected.status)}">${escapeHtml(formatStatusLabel(
                    selected.status
                  ))}</span>
                </div>

                <form class="admin-form-stack" id="order-detail-form">
                  <input type="hidden" name="id" value="${escapeHtml(selected.id)}">
                  <div class="admin-kv-grid">
                    <div class="admin-kv-item"><span>Order Number</span><strong>${escapeHtml(
                      selected.orderNumber || selected.orderId || selected.id || "-"
                    )}</strong></div>
                    <div class="admin-kv-item"><span>Name</span><strong>${escapeHtml(selected.customerName || "-")}</strong></div>
                    <div class="admin-kv-item"><span>Country</span><strong>${escapeHtml(selected.country || "-")}</strong></div>
                    <div class="admin-kv-item"><span>Email</span><strong>${escapeHtml(selected.email || "-")}</strong></div>
                    <div class="admin-kv-item"><span>Phone</span><strong>${escapeHtml(selected.phone || "-")}</strong></div>
                    <div class="admin-kv-item"><span>Mode</span><strong>${escapeHtml(formatStatusLabel(
                      selected.purchaseMode || "-"
                    ))}</strong></div>
                    <div class="admin-kv-item"><span>Source</span><strong>${escapeHtml(selected.source || "-")}</strong></div>
                    <div class="admin-kv-item"><span>Product</span><strong>${escapeHtml(selected.productName || "-")}</strong></div>
                    <div class="admin-kv-item"><span>Quantity</span><strong>${escapeHtml(selected.quantity || "-")}</strong></div>
                    <div class="admin-kv-item"><span>Unit Price</span><strong>${escapeHtml(selected.unitPrice || "-")}</strong></div>
                    <div class="admin-kv-item"><span>Subtotal</span><strong>${escapeHtml(selected.subtotal || "-")}</strong></div>
                    <div class="admin-kv-item"><span>Total</span><strong>${escapeHtml(selected.totalAmount || selected.subtotal || "-")}</strong></div>
                    <div class="admin-kv-item"><span>MOQ</span><strong>${escapeHtml(selected.moq || "-")}</strong></div>
                    <div class="admin-kv-item"><span>Budget</span><strong>${escapeHtml(selected.budget || "-")}</strong></div>
                    <div class="admin-kv-item"><span>Lead Time</span><strong>${escapeHtml(
                      selected.shippingCycle || selected.leadTime || "-"
                    )}</strong></div>
                    <div class="admin-kv-item"><span>Order Status</span><strong>${escapeHtml(
                      formatStatusLabel(selected.orderStatus || "-")
                    )}</strong></div>
                    <div class="admin-kv-item"><span>Payment Status</span><strong>${escapeHtml(
                      formatStatusLabel(selected.paymentStatus || "-")
                    )}</strong></div>
                    <div class="admin-kv-item"><span>Shipping Status</span><strong>${escapeHtml(
                      formatStatusLabel(selected.shippingStatus || "-")
                    )}</strong></div>
                    <div class="admin-kv-item"><span>Deposit</span><strong>${escapeHtml(
                      selected.depositPercentage || "-"
                    )}</strong></div>
                    <div class="admin-kv-item"><span>Deposit Amount</span><strong>${escapeHtml(
                      selected.depositAmount || "-"
                    )}</strong></div>
                    <div class="admin-kv-item"><span>Balance Amount</span><strong>${escapeHtml(
                      selected.balanceAmount || "-"
                    )}</strong></div>
                    <div class="admin-kv-item"><span>Payment Terms</span><strong>${escapeHtml(
                      selected.paymentTerms || "-"
                    )}</strong></div>
                    <div class="admin-kv-item"><span>Created</span><strong>${escapeHtml(
                      formatDate(selected.createdAt)
                    )}</strong></div>
                    <div class="admin-kv-item"><span>Updated</span><strong>${escapeHtml(
                      formatDate(selected.updatedAt)
                    )}</strong></div>
                  </div>

                  <div class="admin-subsection">
                    <h4>Addresses</h4>
                    <div class="admin-kv-grid">
                      <div class="admin-kv-item"><span>Shipping Address</span><strong>${escapeHtml(
                        selected.shippingAddress || "-"
                      )}</strong></div>
                      <div class="admin-kv-item"><span>Billing Address</span><strong>${escapeHtml(
                        selected.billingAddress || selected.shippingAddress || "-"
                      )}</strong></div>
                    </div>
                  </div>

                  <div class="admin-subsection">
                    <h4>Item Snapshots</h4>
                    ${
                      Array.isArray(selected.items) && selected.items.length
                        ? `
                          <div class="admin-history-list">
                            ${selected.items
                              .map(
                                (item) => `
                                  <article class="admin-history-item">
                                    <div>
                                      <strong>${escapeHtml(item.productName || selected.productName || "-")}</strong>
                                      <p>${escapeHtml(
                                        `${item.quantity || selected.quantity || "-"} × ${item.unitPrice || selected.unitPrice || "-"}`
                                      )}</p>
                                    </div>
                                    <span>${escapeHtml(item.lineTotal || selected.subtotal || "-")}</span>
                                  </article>
                                `
                              )
                              .join("")}
                          </div>
                        `
                        : renderEmptyState("No items saved", "Order item snapshots will appear here.")
                    }
                  </div>

                  <div class="admin-subsection">
                    <h4>Payment History</h4>
                    ${
                      paymentHistory.length
                        ? `
                          <div class="admin-history-list">
                            ${paymentHistory
                              .map(
                                (item) => `
                                  <article class="admin-history-item ${item.placeholder ? "is-placeholder" : ""}">
                                    <div>
                                      <strong>${item.label}</strong>
                                    </div>
                                    <span class="admin-pill ${item.placeholder ? "" : getStatusClass(item.status)}">${escapeHtml(
                                      item.status
                                    )}</span>
                                  </article>
                                `
                              )
                              .join("")}
                          </div>
                        `
                        : renderEmptyState("No payment history", "Payment milestones for this order will appear here.")
                    }
                  </div>

                  <div class="admin-subsection">
                    <h4>Order Timeline</h4>
                    ${
                      timelineState.loading
                        ? '<p class="admin-muted">Loading timeline...</p>'
                        : timelineState.error
                          ? `<p class="admin-muted admin-error-text">Failed to load timeline: ${escapeHtml(
                              timelineState.error
                            )}</p>`
                          : timelineState.items.length
                        ? `
                          <div class="admin-timeline-list">
                            ${timelineState.items
                              .map(
                                (event) => `
                                  <article class="admin-timeline-item">
                                    <span class="admin-timeline-dot" aria-hidden="true"></span>
                                    <div class="admin-timeline-content">
                                      <strong>${escapeHtml(event.title || formatStatusLabel(event.eventType || "-"))}</strong>
                                      <p>${escapeHtml(event.description || "No description provided.")}</p>
                                      <div class="admin-timeline-meta">
                                        <span class="admin-timeline-type">${escapeHtml(event.eventType || "-")}</span>
                                        <small>${escapeHtml(formatDate(event.createdAt))}</small>
                                      </div>
                                    </div>
                                  </article>
                                `
                              )
                              .join("")}
                          </div>
                        `
                        : renderEmptyState("No timeline events yet", "Order events will appear here when the API returns them.")
                    }
                  </div>

                  <label class="full">
                    Customer Message
                    <textarea readonly>${escapeHtml(selected.message || "-")}</textarea>
                  </label>

                  <label>
                    Processing Status
                    <select name="status">
                      ${INTERNAL_ORDER_STATUSES.map(
                        (status) => `
                          <option value="${status}" ${selected.status === status ? "selected" : ""}>${formatStatusLabel(status)}</option>
                        `
                      ).join("")}
                    </select>
                  </label>

                  <label>
                    Order Status
                    <select name="orderStatus">
                      ${orderStatusOptions
                        .map(
                          (status) => `
                            <option value="${status}" ${selected.orderStatus === status ? "selected" : ""}>${formatStatusLabel(status)}</option>
                          `
                        )
                        .join("")}
                    </select>
                  </label>

                  <label>
                    Payment Status
                    <select name="paymentStatus">
                      ${PAYMENT_STATUSES
                        .map(
                          (status) => `
                            <option value="${status}" ${selected.paymentStatus === status ? "selected" : ""}>${formatStatusLabel(status)}</option>
                          `
                        )
                        .join("")}
                    </select>
                  </label>

                  <label>
                    Shipping Status
                    <select name="shippingStatus">
                      ${SHIPPING_STATUSES
                        .map(
                          (status) => `
                            <option value="${status}" ${selected.shippingStatus === status ? "selected" : ""}>${formatStatusLabel(status)}</option>
                          `
                        )
                        .join("")}
                    </select>
                  </label>

                  <label class="full">
                    Admin Note
                    <textarea name="adminNote" rows="5" placeholder="Internal follow-up note">${escapeHtml(
                      selected.adminNote || ""
                    )}</textarea>
                  </label>

                  <div class="admin-actions-inline">
                    <button class="admin-primary-button" type="submit">Save</button>
                    <button class="admin-secondary-button" type="button" id="order-status-toggle">
                      Mark ${selected.status === "processed" ? "Unprocessed" : "Processed"}
                    </button>
                    <button class="admin-danger-button" type="button" id="order-delete-button">Delete</button>
                  </div>
                </form>
              `
              : renderEmptyState("No inquiries yet", "Select an inquiry from the list to inspect details.")
          }
        </section>
      </div>
    </div>
  `;

  document.querySelector("#orders-search")?.addEventListener("input", async (event) => {
    adminState.orders.query = event.target.value;
    await renderCurrentSection();
  });

  contentRoot.querySelectorAll("[data-order-filter]").forEach((button) => {
    button.addEventListener("click", async () => {
      adminState.orders.status = button.dataset.orderFilter || "all";
      await renderCurrentSection();
    });
  });

  contentRoot.querySelectorAll("[data-order-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      adminState.orders.selectedId = button.dataset.orderId || null;
      await renderCurrentSection();
    });
  });

  document.querySelector("#order-detail-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await updateAdminOrder(formData.get("id"), {
      status: formData.get("status"),
      orderStatus: formData.get("orderStatus"),
      paymentStatus: formData.get("paymentStatus"),
      shippingStatus: formData.get("shippingStatus"),
      adminNote: formData.get("adminNote"),
    });
    await renderCurrentSection();
  });

  document.querySelector("#order-status-toggle")?.addEventListener("click", async () => {
    if (!selected?.id) {
      return;
    }

    await updateAdminOrder(selected.id, {
      status: selected.status === "processed" ? "unprocessed" : "processed",
    });
    await renderCurrentSection();
  });

  document.querySelector("#order-delete-button")?.addEventListener("click", async () => {
    if (!selected?.id) {
      return;
    }

    if (!window.confirm("Delete this inquiry?")) {
      return;
    }

    await deleteAdminOrder(selected.id);
    adminState.orders.selectedId = null;
    await renderCurrentSection();
  });
};

const renderPaymentsTableLegacy = (payments) => `
  <div class="admin-table-shell">
    <table class="admin-table">
      <thead>
        <tr>
          <th>Order ID</th>
          <th>Customer</th>
          <th>Product</th>
          <th>Amount</th>
          <th>Currency</th>
          <th>Payment Method</th>
          <th>Payment Type</th>
          <th>Status</th>
          <th>Created Time</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${payments
          .map(
            (payment) => `
              <tr>
                <td>${escapeHtml(payment.orderId || "-")}</td>
                <td>${escapeHtml(payment.customer || "-")}</td>
                <td>${escapeHtml(payment.product || "-")}</td>
                <td>${escapeHtml(formatMoney(payment.amount, payment.currency))}</td>
                <td>${escapeHtml(payment.currency || "USD")}</td>
                <td>${escapeHtml(payment.paymentMethod || "-")}</td>
                <td>${escapeHtml(formatPaymentTypeLabel(payment.paymentType))}</td>
                <td><span class="admin-pill ${getStatusClass(payment.status)}">${escapeHtml(
                  formatPaymentStatusLabel(payment.status)
                )}</span></td>
                <td>${escapeHtml(formatDate(payment.createdAt))}</td>
                <td>
                  <button class="admin-secondary-button" type="button" data-payment-view="${escapeHtml(payment.id)}">View</button>
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  </div>
`;

const renderPaymentDetailSectionLegacy = async () => {
  const paymentId = adminState.payments.selectedId;
  const payment = paymentId ? await fetchAdminPayment(paymentId) : null;

  if (!payment) {
    adminState.payments.mode = "list";
    adminState.payments.selectedId = null;
    await renderCurrentSection();
    return;
  }

  const [order, orderPayments] = await Promise.all([
    fetchAdminOrder(payment.orderId),
    fetchAdminOrderPayments(payment.orderId),
  ]);

  contentRoot.innerHTML = `
    <div class="admin-stack">
      <div class="admin-page-head">
        <div>
          <h2>Payment Detail</h2>
          <p>Review the linked order and update payment status.</p>
        </div>
      </div>

      <div class="admin-payment-detail-layout">
        <div class="admin-payment-detail-column">
          <section class="admin-panel admin-payment-card">
            <h4>Payment Information</h4>
            <div class="admin-kv-grid">
              <div class="admin-kv-item"><span>Payment ID</span><strong>${escapeHtml(payment.paymentId || payment.id)}</strong></div>
              <div class="admin-kv-item"><span>Payment Type</span><strong>${escapeHtml(
                formatPaymentTypeLabel(payment.paymentType)
              )}</strong></div>
              <div class="admin-kv-item"><span>Amount</span><strong>${escapeHtml(
                formatMoney(payment.amount, payment.currency)
              )}</strong></div>
              <div class="admin-kv-item"><span>Currency</span><strong>${escapeHtml(payment.currency || "USD")}</strong></div>
              <div class="admin-kv-item"><span>Payment Method</span><strong>${escapeHtml(payment.paymentMethod || "-")}</strong></div>
              <div class="admin-kv-item"><span>Status</span><strong>${escapeHtml(
                formatPaymentStatusLabel(payment.status)
              )}</strong></div>
            </div>
          </section>

          <section class="admin-panel admin-payment-card">
            <h4>Order Information</h4>
            <div class="admin-kv-grid">
              <div class="admin-kv-item"><span>Order ID</span><strong>${escapeHtml(order?.orderId || payment.orderId || "-")}</strong></div>
              <div class="admin-kv-item"><span>Product</span><strong>${escapeHtml(order?.productName || payment.product || "-")}</strong></div>
              <div class="admin-kv-item"><span>Mode</span><strong>${escapeHtml(order?.purchaseMode || payment.orderType || "-")}</strong></div>
              <div class="admin-kv-item"><span>Order Status</span><strong>${escapeHtml(order?.orderStatus || "-")}</strong></div>
            </div>
          </section>
        </div>

        <div class="admin-payment-detail-column">
          <section class="admin-panel admin-payment-card">
            <h4>Customer</h4>
            <div class="admin-kv-grid">
              <div class="admin-kv-item"><span>Name</span><strong>${escapeHtml(order?.customerName || payment.customer || "-")}</strong></div>
              <div class="admin-kv-item"><span>Email</span><strong>${escapeHtml(order?.email || payment.customerEmail || "-")}</strong></div>
              <div class="admin-kv-item"><span>Phone</span><strong>${escapeHtml(order?.phone || payment.customerPhone || "-")}</strong></div>
              <div class="admin-kv-item"><span>Country</span><strong>${escapeHtml(order?.country || "-")}</strong></div>
            </div>
          </section>

          <section class="admin-panel admin-payment-card">
            <h4>Billing Address</h4>
            <div class="admin-note-card">${escapeHtml(payment.billingAddress || order?.shippingAddress || "-")}</div>
          </section>

          <section class="admin-panel admin-payment-card">
            <h4>Payment Timeline</h4>
            <div class="admin-history-list">
              <article class="admin-history-item">
                <div>
                  <strong>Created</strong>
                  <p>${escapeHtml(formatDate(payment.createdAt))}</p>
                </div>
              </article>
              <article class="admin-history-item">
                <div>
                  <strong>Last Updated</strong>
                  <p>${escapeHtml(formatDate(payment.updatedAt))}</p>
                </div>
              </article>
              ${
                payment.paidAt
                  ? `
                    <article class="admin-history-item">
                      <div>
                        <strong>Paid</strong>
                        <p>${escapeHtml(formatDate(payment.paidAt))}</p>
                      </div>
                    </article>
                  `
                  : ""
              }
            </div>
          </section>
        </div>

        <div class="admin-payment-detail-column admin-payment-detail-column-sticky">
          <div class="admin-payment-sticky-stack">
            <section class="admin-panel admin-payment-card">
              <h4>Update Status</h4>
              <form class="admin-form-stack" id="payment-detail-form">
                <input type="hidden" name="id" value="${escapeHtml(payment.id)}">
                <label>
                  Status
                  <select name="status">
                    <option value="pending" ${payment.status === "pending" ? "selected" : ""}>Pending</option>
                    <option value="paid" ${payment.status === "paid" ? "selected" : ""}>Paid</option>
                    <option value="failed" ${payment.status === "failed" ? "selected" : ""}>Failed</option>
                    <option value="refunded" ${payment.status === "refunded" ? "selected" : ""}>Refunded</option>
                  </select>
                </label>
                <button class="admin-primary-button" type="submit">Save Status</button>
              </form>
            </section>

            <section class="admin-panel admin-payment-card">
              <h4>Order Payment History</h4>
              <div class="admin-history-list">
                ${buildOrderPaymentHistory(order, orderPayments)
                  .map(
                    (item) => `
                      <article class="admin-history-item ${item.placeholder ? "is-placeholder" : ""}">
                        <div>
                          <strong>${item.label}</strong>
                        </div>
                        <span class="admin-pill ${item.placeholder ? "" : getStatusClass(item.status)}">${escapeHtml(
                          item.status
                        )}</span>
                      </article>
                    `
                  )
                  .join("")}
              </div>
            </section>

            <section class="admin-panel admin-payment-card">
              <h4>Actions</h4>
              <div class="admin-actions-stack">
                <button class="admin-secondary-button" type="button" id="payments-view-order-button">View Order</button>
                <button class="admin-secondary-button" type="button" id="payments-back-button">Back to Payments</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  `;

  document.querySelector("#payments-back-button")?.addEventListener("click", async () => {
    adminState.payments.mode = "list";
    adminState.payments.selectedId = null;
    await renderCurrentSection();
  });

  document.querySelector("#payments-view-order-button")?.addEventListener("click", async () => {
    adminState.activeSection = "orders";
    adminState.orders.selectedId = payment.orderId;
    renderNav();
    updateTitle();
    await renderCurrentSection();
  });

  document.querySelector("#payment-detail-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const status = String(formData.get("status") || "pending");

    const updatedPayment = await updateAdminPayment(payment.id, {
      status,
      paidAt: status === "paid" ? new Date().toISOString() : "",
    });

    if (order?.id) {
      const nextPayments = orderPayments.map((item) => (item.id === updatedPayment.id ? updatedPayment : item));
      const nextPaymentStatus = deriveOrderPaymentStatusFromPayments(order, nextPayments);
      await updateAdminOrderPaymentStatus(order.id, nextPaymentStatus);
    }

    await renderCurrentSection();
  });
};

const renderPaymentsListSectionLegacy = async () => {
  const payments = await fetchAdminPayments();

  contentRoot.innerHTML = `
    <div class="admin-stack">
      <section class="admin-panel">
        <div class="admin-panel-header">
          <div>
            <h3>Payment Records</h3>
            <p>All customer payment records linked to orders.</p>
          </div>
        </div>
        ${
          payments.length
            ? renderPaymentsTable(payments)
            : renderEmptyState("No payment records", "Payment records will appear here after customers confirm a payment method.")
        }
      </section>
    </div>
  `;

  contentRoot.querySelectorAll("[data-payment-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      adminState.payments.mode = "detail";
      adminState.payments.selectedId = button.dataset.paymentView || null;
      await renderCurrentSection();
    });
  });
};

const renderPaymentsSectionLegacy = async () => {
  if (adminState.payments.mode === "detail" && adminState.payments.selectedId) {
    await renderPaymentDetailSection();
    return;
  }

  await renderPaymentsListSection();
};

const renderOrderListMarkup = (orders) =>
  orders.length
    ? `
      <div class="admin-order-list">
        ${orders
          .map((order) => {
            const displayStatus = getOrderListStatusLabel(order);
            return `
              <button type="button" class="admin-order-card" data-order-id="${escapeHtml(order.id)}">
                <div class="admin-order-card-head">
                  <div class="admin-order-card-copy">
                    <strong>${escapeHtml(order.customerName || "Unknown Customer")}</strong>
                    <span class="admin-mono">${escapeHtml(order.orderNumber || order.orderId || order.id || "-")}</span>
                  </div>
                  <span class="admin-pill ${getStatusClass(normalizeStatusValue(displayStatus))}">${escapeHtml(displayStatus)}</span>
                </div>
                <div class="admin-order-card-meta">
                  <span>${escapeHtml(order.totalAmount || order.subtotal || "-")}</span>
                  <span>${escapeHtml(formatDate(order.createdAt))}</span>
                </div>
              </button>
            `;
          })
          .join("")}
      </div>
    `
    : renderEmptyState("No orders yet", "Order records will appear here once customers place orders.");

const renderOrderDetailMarkup = ({ selected, selectedPayments, timelineState }) => {
  if (!selected) {
    return renderEmptyState("Order not found", "This order could not be loaded from the current data source.");
  }

  const orderStatusOptions =
    normalizeStatusValue(selected.purchaseMode) === "wholesale" ? WHOLESALE_ORDER_STATUSES : RETAIL_ORDER_STATUSES;
  const progressState = buildOrderProgressSteps(selected);
  const itemRows = Array.isArray(selected.items) && selected.items.length
    ? selected.items
    : [
        {
          id: `${selected.id}-fallback`,
          productName: selected.productName,
          sku: "",
          quantity: selected.quantity,
          unitPrice: selected.unitPrice,
          lineTotal: selected.subtotal,
          image: selected.productImage || selected.image || "",
        },
      ];
  const primaryPayment = Array.isArray(selectedPayments) && selectedPayments.length ? selectedPayments[0] : null;

  return `
    <div class="admin-stack">
      <div class="admin-page-actions">
        <button class="admin-secondary-button" type="button" id="order-back-button">Back to Orders</button>
      </div>

      <form class="admin-form-stack" id="order-detail-form">
        <input type="hidden" name="id" value="${escapeHtml(selected.id)}">

        <section class="admin-order-header-card">
          <div class="admin-order-header-copy">
            <div class="admin-order-header-meta">
              <p class="admin-order-overline">Order</p>
              <h3>${escapeHtml(selected.orderNumber || selected.orderId || selected.id || "-")}</h3>
              <div class="admin-order-header-subline">
                <span>${escapeHtml(selected.customerName || "-")}</span>
                <span>${escapeHtml(selected.totalAmount || selected.subtotal || "-")}</span>
                <span>${escapeHtml(formatDate(selected.createdAt))}</span>
              </div>
            </div>
            <div class="admin-order-header-badges">
              <span class="admin-pill ${getStatusClass(selected.orderStatus)}">${escapeHtml(formatStatusLabel(selected.orderStatus))}</span>
              <span class="admin-pill ${getStatusClass(selected.paymentStatus)}">${escapeHtml(
                formatPaymentStatusLabel(selected.paymentStatus)
              )}</span>
              <span class="admin-pill ${getStatusClass(selected.shippingStatus)}">${escapeHtml(
                formatStatusLabel(selected.shippingStatus)
              )}</span>
            </div>
          </div>
          <div class="admin-order-header-actions">
            <button class="admin-primary-button" type="submit">Save Changes</button>
            <details class="admin-inline-menu">
              <summary class="admin-secondary-button">More Actions</summary>
              <div class="admin-inline-menu-list">
                <button class="admin-inline-menu-item" type="button" id="order-status-toggle">
                  Mark ${selected.status === "processed" ? "Unprocessed" : "Processed"}
                </button>
                <button class="admin-inline-menu-item" type="button" id="order-cancel-button">Cancel Order</button>
                <button class="admin-inline-menu-item is-danger" type="button" id="order-delete-button">Delete Order</button>
              </div>
            </details>
          </div>
        </section>

        <section class="admin-subsection">
          <div class="admin-section-head">
            <h4>Timeline</h4>
            ${progressState?.cancelled ? `<span class="admin-pill ${getStatusClass("cancelled")}">Cancelled</span>` : ""}
          </div>
          <div class="admin-progress-strip">
            ${(progressState?.steps || [])
              .map((step, index) => {
                const stateClass = progressState?.cancelled
                  ? "is-upcoming"
                  : index < progressState.currentIndex
                    ? "is-complete"
                    : index === progressState.currentIndex
                      ? "is-current"
                      : "is-upcoming";
                return `
                  <article class="admin-progress-step ${stateClass}">
                    <span class="admin-progress-dot" aria-hidden="true"></span>
                    <strong>${escapeHtml(step.label)}</strong>
                  </article>
                `;
              })
              .join("")}
          </div>
        </section>

        <section class="admin-subsection">
          <div class="admin-section-head">
            <h4>Customer</h4>
          </div>
          <div class="admin-info-grid admin-info-grid-tight">
            <article class="admin-info-card">
              <h5>Customer Information</h5>
              <dl class="admin-description-grid">
                <div><dt>Name</dt><dd>${escapeHtml(selected.customerName || "-")}</dd></div>
                <div><dt>Email</dt><dd class="admin-break-anywhere">${escapeHtml(selected.email || "-")}</dd></div>
                <div><dt>Phone</dt><dd>${escapeHtml(selected.phone || "-")}</dd></div>
                <div><dt>Country</dt><dd>${escapeHtml(selected.country || "-")}</dd></div>
              </dl>
            </article>
            <article class="admin-info-card">
              <h5>Addresses</h5>
              <dl class="admin-description-grid">
                <div class="full"><dt>Shipping Address</dt><dd class="admin-break-anywhere">${escapeHtml(
                  selected.shippingAddress || "-"
                )}</dd></div>
                <div class="full"><dt>Billing Address</dt><dd class="admin-break-anywhere">${escapeHtml(
                  selected.billingAddress || selected.shippingAddress || "-"
                )}</dd></div>
              </dl>
            </article>
          </div>
        </section>

        <section class="admin-subsection">
          <div class="admin-section-head">
            <h4>Products</h4>
          </div>
          <div class="admin-table-shell">
            <table class="admin-table admin-order-items-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows
                  .map(
                    (item) => `
                      <tr>
                        <td>
                          <div class="admin-order-item-cell">
                            ${
                              item.image
                                ? `<img class="admin-order-item-thumb" src="${escapeHtml(item.image)}" alt="${escapeHtml(
                                    item.productName || selected.productName || "Product image"
                                  )}">`
                                : ""
                            }
                            <span>${escapeHtml(item.productName || selected.productName || "-")}</span>
                          </div>
                        </td>
                        <td class="admin-mono">${escapeHtml(item.sku || "-")}</td>
                        <td>${escapeHtml(item.quantity || selected.quantity || "-")}</td>
                        <td>${escapeHtml(item.unitPrice || selected.unitPrice || "-")}</td>
                        <td>${escapeHtml(item.lineTotal || selected.subtotal || "-")}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          <div class="admin-order-totals">
            <div class="admin-order-total-row"><span>Subtotal</span><strong>${escapeHtml(selected.subtotal || "-")}</strong></div>
            <div class="admin-order-total-row"><span>Shipping</span><strong>${escapeHtml(selected.shippingAmount || "$0.00")}</strong></div>
            <div class="admin-order-total-row"><span>Total</span><strong>${escapeHtml(
              selected.totalAmount || selected.subtotal || "-"
            )}</strong></div>
          </div>
        </section>

        <section class="admin-subsection">
          <div class="admin-section-head">
            <h4>Payment</h4>
            <button class="admin-secondary-button" type="button" id="order-view-all-payments">Open Payments</button>
          </div>
          <div class="admin-info-grid admin-info-grid-tight">
            <article class="admin-info-card">
              <h5>Payment Overview</h5>
              <dl class="admin-description-grid">
                <div><dt>Payment Method</dt><dd>${escapeHtml(primaryPayment?.paymentMethod || "-")}</dd></div>
                <div><dt>Transaction ID</dt><dd class="admin-break-anywhere admin-mono">${escapeHtml(
                  primaryPayment?.providerReference || primaryPayment?.paymentId || primaryPayment?.id || "-"
                )}</dd></div>
                <div><dt>Amount</dt><dd>${escapeHtml(
                  primaryPayment ? formatMoney(primaryPayment.amount, primaryPayment.currency) : selected.totalAmount || selected.subtotal || "-"
                )}</dd></div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <select name="paymentStatus">
                      ${PAYMENT_STATUSES.map(
                        (status) => `
                          <option value="${status}" ${selected.paymentStatus === status ? "selected" : ""}>${formatStatusLabel(status)}</option>
                        `
                      ).join("")}
                    </select>
                  </dd>
                </div>
              </dl>
              <div class="admin-actions-inline">
                <button class="admin-secondary-button" type="submit">Save Payment Status</button>
              </div>
            </article>
            <article class="admin-info-card">
              <h5>Payment Records</h5>
              ${
                Array.isArray(selectedPayments) && selectedPayments.length
                  ? `
                    <div class="admin-linked-record-list">
                      ${selectedPayments
                        .map(
                          (payment) => `
                            <article class="admin-linked-record-row admin-static-record-row">
                              <div class="admin-linked-record-main">
                                <strong>${escapeHtml(formatPaymentTypeLabel(payment.paymentType))}</strong>
                                <p>${escapeHtml(payment.paymentMethod || "Payment method not set")}</p>
                              </div>
                              <div class="admin-linked-record-side">
                                <span>${escapeHtml(formatMoney(payment.amount, payment.currency))}</span>
                                <span class="admin-pill ${getStatusClass(payment.status)}">${escapeHtml(
                                  formatPaymentStatusLabel(payment.status)
                                )}</span>
                              </div>
                            </article>
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : renderEmptyState("No payment records yet", "Payment records linked to this order will appear here.")
              }
            </article>
          </div>
        </section>

        <section class="admin-subsection">
          <div class="admin-section-head">
            <h4>Shipping</h4>
          </div>
          <div class="admin-info-grid admin-info-grid-tight">
            <article class="admin-info-card">
              <h5>Shipping Status</h5>
              <dl class="admin-description-grid">
                <div>
                  <dt>Shipping Status</dt>
                  <dd>
                    <select name="shippingStatus">
                      ${SHIPPING_STATUSES.map(
                        (status) => `
                          <option value="${status}" ${selected.shippingStatus === status ? "selected" : ""}>${formatStatusLabel(status)}</option>
                        `
                      ).join("")}
                    </select>
                  </dd>
                </div>
                <div><dt>Carrier</dt><dd>${escapeHtml(selected.shippingCarrier || selected.carrier || "-")}</dd></div>
                <div><dt>Tracking Number</dt><dd class="admin-break-anywhere">${escapeHtml(
                  selected.trackingNumber || selected.trackingNo || "-"
                )}</dd></div>
                <div><dt>Estimated Delivery</dt><dd>${escapeHtml(
                  selected.estimatedDelivery || selected.deliveryEstimate || "-"
                )}</dd></div>
              </dl>
            </article>
            <article class="admin-info-card">
              <h5>Operational Status</h5>
              <dl class="admin-description-grid">
                <div>
                  <dt>Order Status</dt>
                  <dd>
                    <select name="orderStatus">
                      ${orderStatusOptions
                        .map(
                          (status) => `
                            <option value="${status}" ${selected.orderStatus === status ? "selected" : ""}>${formatStatusLabel(status)}</option>
                          `
                        )
                        .join("")}
                    </select>
                  </dd>
                </div>
                <div>
                  <dt>Processing</dt>
                  <dd>
                    <select name="status">
                      ${INTERNAL_ORDER_STATUSES.map(
                        (status) => `
                          <option value="${status}" ${selected.status === status ? "selected" : ""}>${formatStatusLabel(status)}</option>
                        `
                      ).join("")}
                    </select>
                  </dd>
                </div>
              </dl>
              <div class="admin-actions-inline">
                <button class="admin-secondary-button" type="submit">Save Shipping Status</button>
              </div>
            </article>
          </div>
        </section>

        <section class="admin-subsection">
          <div class="admin-section-head">
            <h4>Order Timeline</h4>
          </div>
          ${
            timelineState.loading
              ? '<p class="admin-muted">Loading timeline...</p>'
              : timelineState.error
                ? `<p class="admin-muted admin-error-text">Failed to load timeline: ${escapeHtml(timelineState.error)}</p>`
                : timelineState.items.length
                  ? `
                    <div class="admin-timeline-list">
                      ${timelineState.items
                        .map(
                          (event) => `
                            <article class="admin-timeline-item">
                              <span class="admin-timeline-dot" aria-hidden="true"></span>
                              <div class="admin-timeline-content">
                                <strong>${escapeHtml(event.title || formatStatusLabel(event.eventType || "-"))}</strong>
                                <p>${escapeHtml(formatOrderEventDescription(event))}</p>
                                <div class="admin-timeline-meta">
                                  <span class="admin-timeline-type">${escapeHtml(formatStatusLabel(event.eventType || "-"))}</span>
                                  ${event.createdBy ? `<span>${escapeHtml(event.createdBy)}</span>` : ""}
                                  <small>${escapeHtml(formatDate(event.createdAt))}</small>
                                </div>
                              </div>
                            </article>
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : renderEmptyState("No timeline events yet", "Order events will appear here when the API returns them.")
          }
        </section>

        <section class="admin-subsection">
          <div class="admin-section-head">
            <h4>Internal Notes</h4>
          </div>
          <label class="full">
            Admin Note
            <textarea name="adminNote" rows="5" placeholder="Internal follow-up note">${escapeHtml(
              selected.adminNote || ""
            )}</textarea>
          </label>
          <label class="full">
            Customer Message
            <textarea readonly>${escapeHtml(selected.message || "-")}</textarea>
          </label>
          <div class="admin-actions-inline">
            <button class="admin-primary-button" type="submit">Save Changes</button>
          </div>
        </section>
      </form>
    </div>
  `;
};

const bindOrderDetailInteractions = (selected) => {
  document.querySelector("#order-back-button")?.addEventListener("click", async () => {
    adminState.activeSection = "orders";
    syncAdminRoute("push");
    await renderCurrentSection();
  });

  document.querySelector("#order-detail-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selected?.id) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const patch = {};
    if (String(formData.get("status") || "") !== String(selected.status || "")) {
      patch.status = formData.get("status");
    }
    if (String(formData.get("orderStatus") || "") !== String(selected.orderStatus || "")) {
      patch.orderStatus = formData.get("orderStatus");
    }
    if (String(formData.get("paymentStatus") || "") !== String(selected.paymentStatus || "")) {
      patch.paymentStatus = formData.get("paymentStatus");
    }
    if (String(formData.get("shippingStatus") || "") !== String(selected.shippingStatus || "")) {
      patch.shippingStatus = formData.get("shippingStatus");
    }
    if (String(formData.get("adminNote") || "") !== String(selected.adminNote || "")) {
      patch.adminNote = formData.get("adminNote");
    }

    if (!Object.keys(patch).length) {
      return;
    }

    await updateAdminOrder(selected.id, patch);
    await renderCurrentSection();
  });

  document.querySelector("#order-status-toggle")?.addEventListener("click", async () => {
    if (!selected?.id) {
      return;
    }

    await updateAdminOrder(selected.id, {
      status: selected.status === "processed" ? "unprocessed" : "processed",
    });
    await renderCurrentSection();
  });

  document.querySelector("#order-cancel-button")?.addEventListener("click", async () => {
    if (!selected?.id) {
      return;
    }

    if (!window.confirm("Cancel this order?")) {
      return;
    }

    await updateAdminOrder(selected.id, {
      orderStatus: "cancelled",
    });
    await renderCurrentSection();
  });

  document.querySelector("#order-delete-button")?.addEventListener("click", async () => {
    if (!selected?.id) {
      return;
    }

    if (!window.confirm("Delete this order? This action cannot be undone.")) {
      return;
    }

    await deleteAdminOrder(selected.id);
    adminState.orders.selectedId = null;
    adminState.activeSection = "orders";
    syncAdminRoute("replace");
    await renderCurrentSection();
  });

  document.querySelector("#order-view-all-payments")?.addEventListener("click", async () => {
    if (!selected?.id) {
      return;
    }

    adminState.activeSection = "payments";
    adminState.payments.mode = "list";
    adminState.payments.selectedId = null;
    adminState.payments.orderFilterId = selected.id;
    syncAdminRoute("push");
    await renderCurrentSection();
  });
};

const renderOrdersSection = async () => {
  const orders = await fetchAdminOrders();
  const query = adminState.orders.query.trim().toLowerCase();
  const filtered = orders.filter((order) => {
    if (!matchesAdminOrderListFilter(order, adminState.orders.status)) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      order.customerName,
      order.country,
      order.email,
      order.phone,
      order.productName,
      order.message,
      order.orderNumber,
      order.totalAmount,
      order.subtotal,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  contentRoot.innerHTML = `
    <div class="admin-stack">
      <section class="admin-toolbar">
        <label class="admin-search-field">
          <span>Search</span>
          <input
            id="orders-search"
            class="admin-search-input"
            type="search"
            placeholder="Search customer, order number, product, email"
            value="${escapeHtml(adminState.orders.query)}"
          >
        </label>
        <div class="admin-filter-tabs">
          ${ORDER_CENTER_FILTERS.map(
            (item) => `
              <button
                type="button"
                class="admin-filter-chip ${adminState.orders.status === item.value ? "is-active" : ""}"
                data-order-filter="${escapeHtml(item.value)}"
              >
                ${escapeHtml(item.label)}
              </button>
            `
          ).join("")}
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-header">
          <div>
            <h3>Orders</h3>
            <p>${formatNumber(filtered.length)} result${filtered.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        ${renderOrderListMarkup(filtered)}
      </section>
    </div>
  `;

  document.querySelector("#orders-search")?.addEventListener("input", async (event) => {
    adminState.orders.query = event.target.value;
    await renderCurrentSection();
  });

  contentRoot.querySelectorAll("[data-order-filter]").forEach((button) => {
    button.addEventListener("click", async () => {
      adminState.orders.status = button.dataset.orderFilter || "all";
      await renderCurrentSection();
    });
  });

  contentRoot.querySelectorAll("[data-order-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openAdminOrderDetail(button.dataset.orderId || null);
    });
  });
};

const renderOrderDetailSection = async () => {
  const orderId = String(adminState.orders.selectedId || "").trim();
  if (!orderId) {
    adminState.activeSection = "orders";
    syncAdminRoute("replace");
    await renderCurrentSection();
    return;
  }

  const [selected, selectedPayments] = await Promise.all([
    fetchAdminOrder(orderId),
    fetchAdminOrderPayments(orderId),
  ]);

  if (!selected) {
    contentRoot.innerHTML = `
      <section class="admin-panel">
        ${renderEmptyState("Order not found", "This order could not be loaded.")}
      </section>
    `;
    document.querySelector(".admin-empty-state")?.insertAdjacentHTML(
      "beforeend",
      '<div class="admin-actions-inline"><button class="admin-secondary-button" type="button" id="order-missing-back-button">Back to Orders</button></div>'
    );
    document.querySelector("#order-missing-back-button")?.addEventListener("click", async () => {
      adminState.activeSection = "orders";
      syncAdminRoute("replace");
      await renderCurrentSection();
    });
    return;
  }

  if (adminState.orders.timeline.orderId !== orderId && !adminState.orders.timeline.loading) {
    adminState.orders.timeline = {
      orderId,
      loading: true,
      error: "",
      items: [],
      requestId: Date.now(),
    };
    void loadAdminOrderTimeline(orderId);
  }

  const timelineState =
    adminState.orders.timeline.orderId === orderId
      ? adminState.orders.timeline
      : {
          orderId,
          loading: true,
          error: "",
          items: [],
          requestId: 0,
        };

  contentRoot.innerHTML = renderOrderDetailMarkup({
    selected,
    selectedPayments,
    timelineState,
  });

  bindOrderDetailInteractions(selected);
};

const renderPaymentListMarkup = (payments) =>
  payments.length
    ? `
      <div class="admin-payment-list">
        ${payments
          .map(
            (payment) => `
              <article class="admin-payment-row">
                <div class="admin-payment-row-main">
                  <strong>${escapeHtml(payment.customerDisplay || payment.customer || "Unknown Customer")}</strong>
                  <p>${escapeHtml(payment.orderNumberDisplay || payment.orderId || "-")}</p>
                  <small>${escapeHtml(payment.paymentMethod || "-")}</small>
                </div>
                <div class="admin-payment-row-side">
                  <span>${escapeHtml(formatMoney(payment.amount, payment.currency))}</span>
                  <span class="admin-pill ${getStatusClass(payment.status)}">${escapeHtml(
                    formatPaymentStatusLabel(payment.status)
                  )}</span>
                  <small>${escapeHtml(formatDate(payment.createdAt))}</small>
                  <button class="admin-secondary-button" type="button" data-payment-order-id="${escapeHtml(
                    payment.orderId || ""
                  )}">View Order</button>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    `
    : renderEmptyState("No payment records yet", "Payment records linked to customer orders will appear here.");

const renderPaymentTimelineMarkup = (payment) => {
  const events = [
    {
      title: "Payment record created",
      description: `${formatPaymentTypeLabel(payment.paymentType)} payment record was created.`,
      timestamp: payment.createdAt,
    },
  ];

  if (payment.updatedAt && payment.updatedAt !== payment.createdAt) {
    events.push({
      title: "Payment status updated",
      description: `Payment status is ${formatPaymentStatusLabel(payment.status)}.`,
      timestamp: payment.updatedAt,
    });
  }

  if (payment.paidAt) {
    events.push({
      title: "Payment confirmed",
      description: `${formatPaymentTypeLabel(payment.paymentType)} payment was marked paid.`,
      timestamp: payment.paidAt,
    });
  }

  if (normalizeStatusValue(payment.status) === "failed" && payment.note) {
    events.push({
      title: "Payment failed",
      description: payment.note,
      timestamp: payment.updatedAt || payment.createdAt,
    });
  }

  if (normalizeStatusValue(payment.status) === "refunded") {
    events.push({
      title: "Refund recorded",
      description: "This payment was marked refunded.",
      timestamp: payment.updatedAt || payment.createdAt,
    });
  }

  return `
    <div class="admin-timeline-list">
      ${events
        .map(
          (event) => `
            <article class="admin-timeline-item">
              <span class="admin-timeline-dot" aria-hidden="true"></span>
              <div class="admin-timeline-content">
                <strong>${escapeHtml(event.title)}</strong>
                <p>${escapeHtml(event.description)}</p>
                <div class="admin-timeline-meta">
                  <small>${escapeHtml(formatDate(event.timestamp))}</small>
                </div>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
};

const renderPaymentDetailMarkup = ({ payment, order, compact }) => {
  if (!payment) {
    return renderEmptyState("Select a payment", "Choose a payment record to review its status and linked order.");
  }

  return `
    <div class="admin-payment-detail-stack">
      <section class="admin-payment-header-card">
        <div class="admin-payment-header-copy">
          <div>
            <p class="admin-order-overline">${escapeHtml(formatPaymentTypeLabel(payment.paymentType))}</p>
            <h3>${escapeHtml(formatMoney(payment.amount, payment.currency))}</h3>
            <div class="admin-order-header-subline">
              <span>${escapeHtml(payment.currency || "USD")}</span>
              <span>${escapeHtml(payment.paymentMethod || "Payment method not set")}</span>
            </div>
          </div>
          <span class="admin-pill ${getStatusClass(payment.status)}">${escapeHtml(formatPaymentStatusLabel(payment.status))}</span>
        </div>
      </section>

      <div class="admin-payment-detail-layout">
        <div class="admin-payment-detail-column">
          <section class="admin-panel admin-payment-card">
            <div class="admin-section-head">
              <h4>Payment Information</h4>
            </div>
            <dl class="admin-description-grid">
              <div class="full">
                <dt>Payment ID</dt>
                <dd class="admin-break-anywhere admin-mono admin-inline-copy-field">
                  <span>${escapeHtml(payment.paymentId || payment.id)}</span>
                  <button class="admin-ghost-button" type="button" id="payment-copy-id-button">Copy</button>
                </dd>
              </div>
              <div>
                <dt>Created Time</dt>
                <dd>${escapeHtml(formatDate(payment.createdAt))}</dd>
              </div>
              <div>
                <dt>Last Updated</dt>
                <dd>${escapeHtml(formatDate(payment.updatedAt))}</dd>
              </div>
              <div>
                <dt>Paid Time</dt>
                <dd>${escapeHtml(payment.paidAt ? formatDate(payment.paidAt) : "-")}</dd>
              </div>
              <div>
                <dt>Payment Method</dt>
                <dd>${escapeHtml(payment.paymentMethod || "-")}</dd>
              </div>
              <div>
                <dt>Payment Type</dt>
                <dd>${escapeHtml(formatPaymentTypeLabel(payment.paymentType))}</dd>
              </div>
              <div>
                <dt>External Transaction ID</dt>
                <dd class="admin-break-anywhere admin-mono">${escapeHtml(payment.providerReference || "-")}</dd>
              </div>
              <div>
                <dt>Failure Reason</dt>
                <dd class="admin-break-anywhere">${escapeHtml(
                  normalizeStatusValue(payment.status) === "failed" ? payment.note || "-" : "-"
                )}</dd>
              </div>
              <div>
                <dt>Refund Amount</dt>
                <dd>${escapeHtml(
                  normalizeStatusValue(payment.status) === "refunded" ? formatMoney(payment.amount, payment.currency) : "-"
                )}</dd>
              </div>
            </dl>
          </section>

          <section class="admin-panel admin-payment-card">
            <div class="admin-section-head">
              <h4>Linked Order</h4>
            </div>
            ${
              order
                ? `
                  <button class="admin-linked-order-card" type="button" id="payments-view-order-button">
                    <div class="admin-linked-record-main">
                      <strong>${escapeHtml(order.orderNumber || order.orderId || order.id || "-")}</strong>
                      <p>${escapeHtml(order.customerName || payment.customer || "-")}</p>
                      <small>${escapeHtml(order.productName || payment.product || "-")}</small>
                    </div>
                    <div class="admin-linked-record-side">
                      <span>${escapeHtml(order.totalAmount || formatMoney(payment.amount, payment.currency))}</span>
                      <span class="admin-pill ${getStatusClass(order.orderStatus)}">${escapeHtml(
                        formatStatusLabel(order.orderStatus)
                      )}</span>
                      <span class="admin-link-hint">View Order →</span>
                    </div>
                  </button>
                `
                : renderEmptyState("Order not found", "The linked order could not be loaded.")
            }
          </section>

          <section class="admin-panel admin-payment-card">
            <div class="admin-section-head">
              <h4>Payment Timeline</h4>
            </div>
            ${renderPaymentTimelineMarkup(payment)}
          </section>
        </div>

        <div class="admin-payment-detail-column ${compact ? "" : "admin-payment-detail-column-sticky"}">
          <div class="admin-payment-sticky-stack">
            <section class="admin-panel admin-payment-card">
              <div class="admin-section-head">
                <h4>Payment Status</h4>
              </div>
              <form class="admin-form-stack" id="payment-detail-form">
                <input type="hidden" name="id" value="${escapeHtml(payment.id)}">
                <label>
                  Status
                  <select name="status">
                    ${getPaymentStatusSelectOptions(payment.status)
                      .map(
                        (status) => `
                          <option value="${status}" ${normalizeStatusValue(payment.status) === normalizeStatusValue(status) ? "selected" : ""}>
                            ${escapeHtml(formatStatusLabel(status))}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                </label>
                <button class="admin-primary-button" type="submit">Save Payment Status</button>
              </form>
            </section>

            ${
              compact
                ? `
                  <section class="admin-panel admin-payment-card">
                    <div class="admin-actions-stack">
                      <button class="admin-secondary-button" type="button" id="payments-back-button">Back to Payments</button>
                    </div>
                  </section>
                `
                : ""
            }
          </div>
        </div>
      </div>
    </div>
  `;
};

const renderPaymentsSection = async () => {
  const [payments, orders] = await Promise.all([fetchAdminPayments(), fetchAdminOrders()]);
  const orderMap = new Map(orders.map((order) => [String(order.id || ""), order]));
  const statusMatcher = buildPaymentFilterMatcher(adminState.payments.status);
  const query = adminState.payments.query.trim().toLowerCase();
  const filteredPayments = payments
    .map((payment) => {
      const linkedOrder = orderMap.get(String(payment.orderId || "")) || null;
      return {
        ...payment,
        linkedOrder,
        orderNumberDisplay: linkedOrder?.orderNumber || payment.orderId || "-",
        customerDisplay: payment.customer || linkedOrder?.customerName || "-",
        customerEmailDisplay: payment.customerEmail || linkedOrder?.email || "",
      };
    })
    .filter((payment) => {
      if (adminState.payments.orderFilterId && String(payment.orderId || "") !== adminState.payments.orderFilterId) {
        return false;
      }
      if (statusMatcher && !statusMatcher.has(normalizeStatusValue(payment.status))) {
        return false;
      }
      if (!query) {
        return true;
      }

      const haystack = [
        payment.paymentId,
        payment.id,
        payment.orderNumberDisplay,
        payment.customerDisplay,
        payment.customerEmailDisplay,
        payment.paymentMethod,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  syncAdminRoute("replace");

  contentRoot.innerHTML = `
    <div class="admin-stack">
      <section class="admin-panel">
        <div class="admin-panel-header">
          <div>
            <h3>Payments</h3>
            <p>Review payment records linked to customer orders.</p>
          </div>
          ${
            adminState.payments.orderFilterId
              ? '<button class="admin-secondary-button" type="button" id="payments-clear-order-filter">Clear Order Filter</button>'
              : ""
          }
        </div>

        <div class="admin-toolbar">
          <label class="admin-search-field">
            <span>Search</span>
            <input
              id="payments-search"
              class="admin-search-input"
              type="search"
              placeholder="Search payment ID, order number, customer, email or method"
              value="${escapeHtml(adminState.payments.query)}"
            >
          </label>
          <div class="admin-filter-tabs">
            ${PAYMENT_FILTER_OPTIONS.map(
              (item) => `
                <button
                  type="button"
                  class="admin-filter-chip ${adminState.payments.status === item.value ? "is-active" : ""}"
                  data-payment-filter="${escapeHtml(item.value)}"
                >
                  ${escapeHtml(item.label)}
                </button>
              `
            ).join("")}
          </div>
        </div>

        <div class="admin-panel-header">
          <div>
            <h4>Payment Records</h4>
            <p>${formatNumber(filteredPayments.length)} result${filteredPayments.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        ${renderPaymentListMarkup(filteredPayments)}
      </section>
    </div>
  `;

  document.querySelector("#payments-search")?.addEventListener("input", async (event) => {
    adminState.payments.query = event.target.value;
    await renderCurrentSection();
  });

  contentRoot.querySelectorAll("[data-payment-filter]").forEach((button) => {
    button.addEventListener("click", async () => {
      adminState.payments.status = button.dataset.paymentFilter || "all";
      await renderCurrentSection();
    });
  });

  contentRoot.querySelectorAll("[data-payment-order-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openAdminOrderDetail(button.dataset.paymentOrderId || null);
    });
  });

  document.querySelector("#payments-clear-order-filter")?.addEventListener("click", async () => {
    adminState.payments.orderFilterId = "";
    syncAdminRoute("push");
    await renderCurrentSection();
  });

};

const renderCustomersSectionLocalLegacy = async () => {
  let threads = await window.NorthstarStore.listCustomerThreads();

  if (!threads.some((thread) => thread.id === adminState.customers.selectedId)) {
    adminState.customers.selectedId = threads[0]?.id || null;
  }

  let selected = threads.find((thread) => thread.id === adminState.customers.selectedId) || null;

  if (selected?.unreadCount) {
    await window.NorthstarStore.markMessageThreadRead(selected.id);
    threads = await window.NorthstarStore.listCustomerThreads();
    selected = threads.find((thread) => thread.id === adminState.customers.selectedId) || null;
  }

  contentRoot.innerHTML = `
    <div class="admin-chat-layout">
      <section class="admin-panel admin-thread-panel">
        <div class="admin-panel-header">
          <div>
            <h3>Customer List</h3>
            <p>${formatNumber(threads.length)} active thread${threads.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        ${
          threads.length
            ? `
              <div class="admin-thread-list">
                ${threads
                  .map(
                    (thread) => `
                      <button
                        type="button"
                        class="admin-thread-row ${thread.id === selected?.id ? "is-active" : ""}"
                        data-thread-id="${escapeHtml(thread.id)}"
                      >
                        <div>
                          <strong>${escapeHtml(thread.customerName || "Website Visitor")}</strong>
                          <p>${escapeHtml(thread.email || thread.country || "Support chat")}</p>
                        </div>
                        <div class="admin-thread-side">
                          ${
                            thread.unreadCount
                              ? `<span class="admin-unread-badge">${formatNumber(thread.unreadCount)}</span>`
                              : ""
                          }
                          <small>${escapeHtml(formatShortDate(thread.updatedAt))}</small>
                        </div>
                      </button>
                    `
                  )
                  .join("")}
              </div>
            `
            : renderEmptyState("No customer conversations yet", "Support chats will appear here.")
        }
      </section>

      <section class="admin-panel admin-chat-panel">
        ${
          selected
            ? `
              <div class="admin-chat-header">
                <div>
                  <h3>${escapeHtml(selected.customerName || "Website Visitor")}</h3>
                  <p>${escapeHtml(selected.email || "No email")} · ${escapeHtml(selected.country || "No country")}</p>
                </div>
                <div class="admin-chat-header-actions">
                  <label>
                    <span>Status</span>
                    <select id="thread-status-select">
                      <option value="open" ${selected.status === "open" ? "selected" : ""}>open</option>
                      <option value="replied" ${selected.status === "replied" ? "selected" : ""}>replied</option>
                      <option value="closed" ${selected.status === "closed" ? "selected" : ""}>closed</option>
                    </select>
                  </label>
                  <button class="admin-danger-button" type="button" id="thread-delete-button">Delete</button>
                </div>
              </div>

              <div class="admin-chat-history">
                ${
                  selected.messages.length
                    ? selected.messages
                        .map((message) => {
                          const isCustomer = message.sender === "customer";
                          const label =
                            message.sender === "assistant"
                              ? "Auto Reply"
                              : isCustomer
                                ? selected.customerName || "Customer"
                                : "Admin";

                          return `
                            <article class="admin-chat-message ${isCustomer ? "is-customer" : "is-admin"}">
                              <div class="admin-chat-bubble">
                                ${message.image ? `<img class="admin-chat-image" src="${escapeHtml(message.image)}" alt="Shared image">` : ""}
                                ${message.text ? `<p>${escapeHtml(message.text)}</p>` : ""}
                              </div>
                              <div class="admin-chat-meta">
                                <span>${escapeHtml(label)}</span>
                                <small>${escapeHtml(formatDate(message.createdAt))}</small>
                              </div>
                            </article>
                          `;
                        })
                        .join("")
                    : renderEmptyState("No messages yet", "Send the first reply from this panel.")
                }
              </div>

              <div class="admin-quick-replies">
                ${[
                  "Thanks. We are reviewing your request now.",
                  "Please confirm your target quantity and destination port.",
                  "We can share pricing after MOQ and packaging are confirmed.",
                ]
                  .map(
                    (reply) => `
                      <button type="button" class="admin-quick-reply" data-quick-reply="${escapeHtml(reply)}">
                        ${escapeHtml(reply)}
                      </button>
                    `
                  )
                  .join("")}
              </div>

              <form class="admin-chat-composer" id="customer-reply-form">
                <textarea
                  name="text"
                  rows="4"
                  placeholder="Write a reply to the customer"
                ></textarea>
                <label class="admin-file-field">
                  <span>Send Image</span>
                  <input type="file" name="image" accept="image/*">
                </label>
                <div class="admin-actions-inline">
                  <button class="admin-primary-button" type="submit">Send Reply</button>
                </div>
              </form>
            `
            : renderEmptyState("No customer selected", "Choose a customer thread to open the chat window.")
        }
      </section>
    </div>
  `;

  contentRoot.querySelectorAll("[data-thread-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      adminState.customers.selectedId = button.dataset.threadId || null;
      await renderCurrentSection();
    });
  });

  contentRoot.querySelectorAll("[data-quick-reply]").forEach((button) => {
    button.addEventListener("click", () => {
      const textarea = contentRoot.querySelector("#customer-reply-form textarea");
      if (textarea) {
        textarea.value = button.dataset.quickReply || "";
        textarea.focus();
      }
    });
  });

  document.querySelector("#thread-status-select")?.addEventListener("change", async (event) => {
    if (!selected?.id) {
      return;
    }

    await window.NorthstarStore.updateMessageStatus(selected.id, event.target.value);
    await renderCurrentSection();
  });

  document.querySelector("#thread-delete-button")?.addEventListener("click", async () => {
    if (!selected?.id) {
      return;
    }

    if (!window.confirm("Delete this customer conversation?")) {
      return;
    }

    await window.NorthstarStore.deleteMessageThread(selected.id);
    adminState.customers.selectedId = null;
    await renderCurrentSection();
  });

  document.querySelector("#customer-reply-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selected?.id) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const text = String(formData.get("text") || "").trim();
    const file = formData.get("image");
    let image = "";

    if (file && typeof file === "object" && file.size) {
      image = await fileToDataUrl(file);
    }

    if (!text && !image) {
      return;
    }

    await window.NorthstarStore.appendMessage(selected.id, {
      sender: "admin",
      text,
      image,
    });

    form.reset();
    await renderCurrentSection();
  });
};

const renderCustomersSectionLegacy = async () => {
  let conversations = [];

  try {
    conversations = await fetchAdminSupportConversations({
      query: adminState.customers.query,
      status: adminState.customers.status,
      conversationType: adminState.customers.conversationType,
    });
  } catch (error) {
    contentRoot.innerHTML = `
      <section class="admin-panel">
        <div class="admin-panel-header">
          <div>
            <h3>Customer Support</h3>
            <p class="admin-error-text">Failed to load support conversations: ${escapeHtml(
              error?.message || "Unknown error."
            )}</p>
          </div>
        </div>
      </section>
    `;
    return;
  }

  if (!conversations.some((thread) => thread.id === adminState.customers.selectedId)) {
    adminState.customers.selectedId = conversations[0]?.id || null;
  }

  let selected = conversations.find((thread) => thread.id === adminState.customers.selectedId) || null;
  let messages = [];
  let detailError = "";

  if (selected?.id) {
    try {
      if (selected.adminUnreadCount > 0) {
        await markAdminSupportConversationRead(selected.id);
        conversations = await fetchAdminSupportConversations({
          query: adminState.customers.query,
          status: adminState.customers.status,
          conversationType: adminState.customers.conversationType,
        });
        selected = conversations.find((thread) => thread.id === adminState.customers.selectedId) || selected;
      }

      const [nextSelected, nextMessages] = await Promise.all([
        fetchAdminSupportConversation(selected.id),
        fetchAdminSupportMessages(selected.id),
      ]);
      selected = nextSelected || selected;
      messages = nextMessages;
    } catch (error) {
      detailError = error?.message || "Unknown error.";
    }
  }

  contentRoot.innerHTML = `
    <div class="admin-stack">
      <section class="admin-toolbar">
        <label class="admin-search-field">
          <span>Search</span>
          <input
            id="support-search"
            class="admin-search-input"
            type="search"
            placeholder="Search customer, email, order, product"
            value="${escapeHtml(adminState.customers.query)}"
          >
        </label>
        <label>
          <span>Status</span>
          <select id="support-status-filter">
            <option value="all" ${adminState.customers.status === "all" ? "selected" : ""}>All</option>
            ${SUPPORT_CONVERSATION_STATUSES.map(
              (status) => `
                <option value="${status}" ${adminState.customers.status === status ? "selected" : ""}>${formatStatusLabel(status)}</option>
              `
            ).join("")}
          </select>
        </label>
        <label>
          <span>Type</span>
          <select id="support-type-filter">
            <option value="all" ${adminState.customers.conversationType === "all" ? "selected" : ""}>All</option>
            ${SUPPORT_CONVERSATION_TYPES.map(
              (type) => `
                <option value="${type}" ${adminState.customers.conversationType === type ? "selected" : ""}>${formatStatusLabel(type)}</option>
              `
            ).join("")}
          </select>
        </label>
      </section>

      <div class="admin-chat-layout">
        <section class="admin-panel admin-thread-panel">
          <div class="admin-panel-header">
            <div>
              <h3>Customer List</h3>
              <p>${formatNumber(conversations.length)} active conversation${conversations.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <div class="admin-thread-list">
            ${conversations
              .map(
                (thread) => `
                  <button
                    type="button"
                    class="admin-thread-row ${thread.id === selected?.id ? "is-active" : ""}"
                    data-thread-id="${escapeHtml(thread.id)}"
                  >
                    <div>
                      <strong>${escapeHtml(thread.customerName || "Website Visitor")}</strong>
                      <p>${escapeHtml(thread.relatedOrderNumber || thread.relatedProductName || thread.email || "Support chat")}</p>
                    </div>
                    <div class="admin-thread-side">
                      ${thread.adminUnreadCount ? `<span class="admin-unread-badge">${formatNumber(thread.adminUnreadCount)}</span>` : ""}
                      <small>${escapeHtml(formatShortDate(thread.lastMessageAt || thread.updatedAt))}</small>
                    </div>
                  </button>
                `
              )
              .join("")}
          </div>
          <div class="admin-empty-state"${conversations.length ? " hidden" : ""}>
            <h4>No customer conversations yet</h4>
            <p>Support chats will appear here.</p>
          </div>
        </section>

        <section class="admin-panel admin-chat-panel">
          ${
            selected
              ? detailError
                ? `
                  <div class="admin-panel-header">
                    <div>
                      <h3>${escapeHtml(selected.customerName || "Website Visitor")}</h3>
                      <p class="admin-error-text">Failed to load conversation: ${escapeHtml(detailError)}</p>
                    </div>
                  </div>
                `
                : `
                  <div class="admin-chat-header">
                    <div>
                      <h3>${escapeHtml(selected.customerName || "Website Visitor")}</h3>
                      <p>${escapeHtml(selected.email || "No email")} · ${escapeHtml(selected.country || "No country")}</p>
                      <p>${escapeHtml(
                        [
                          selected.relatedOrderNumber ? `Order ${selected.relatedOrderNumber}` : "",
                          selected.relatedProductName || "",
                          formatStatusLabel(selected.conversationType || ""),
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Support conversation"
                      )}</p>
                    </div>
                    <div class="admin-chat-header-actions">
                      <label>
                        <span>Status</span>
                        <select id="thread-status-select">
                          ${SUPPORT_CONVERSATION_STATUSES.map(
                            (status) => `
                              <option value="${status}" ${selected.status === status ? "selected" : ""}>${formatStatusLabel(status)}</option>
                            `
                          ).join("")}
                        </select>
                      </label>
                      <button class="admin-secondary-button" type="button" id="thread-resolve-button">Mark Resolved</button>
                      <button class="admin-secondary-button" type="button" id="thread-reopen-button">Reopen</button>
                    </div>
                  </div>

                  <div class="admin-chat-history">
                    ${
                      messages.length
                        ? messages.map((message) => createAdminChatMessageMarkup(message, selected)).join("")
                        : renderEmptyState("No messages yet", "Send the first reply from this panel.")
                    }
                  </div>

                  <div class="admin-quick-replies">
                    ${[
                      "Thanks. We are reviewing your request now.",
                      "Please confirm your target quantity and destination port.",
                      "We can share pricing after MOQ and packaging are confirmed.",
                    ]
                      .map(
                        (reply) => `
                          <button type="button" class="admin-quick-reply" data-quick-reply="${escapeHtml(reply)}">
                            ${escapeHtml(reply)}
                          </button>
                        `
                      )
                      .join("")}
                  </div>

                  <form class="admin-chat-composer" id="customer-reply-form">
                    <textarea
                      name="text"
                      rows="4"
                      placeholder="Write a reply to the customer"
                    ></textarea>
                    <label class="admin-file-field">
                      <span>Send Image</span>
                      <input type="file" name="image" accept="image/*">
                    </label>
                    <div class="admin-actions-inline">
                      <button class="admin-primary-button" type="submit">Send Reply</button>
                    </div>
                  </form>
                `
              : renderEmptyState("No customer selected", "Choose a customer thread to open the chat window.")
          }
        </section>
      </div>
    </div>
  `;

  document.querySelector("#support-search")?.addEventListener("input", async (event) => {
    adminState.customers.query = event.target.value;
    await renderCurrentSection();
  });

  document.querySelector("#support-status-filter")?.addEventListener("change", async (event) => {
    adminState.customers.status = event.target.value || "all";
    await renderCurrentSection();
  });

  document.querySelector("#support-type-filter")?.addEventListener("change", async (event) => {
    adminState.customers.conversationType = event.target.value || "all";
    await renderCurrentSection();
  });

  contentRoot.querySelectorAll("[data-thread-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      adminState.customers.selectedId = button.dataset.threadId || null;
      await renderCurrentSection();
    });
  });

  contentRoot.querySelectorAll("[data-quick-reply]").forEach((button) => {
    button.addEventListener("click", () => {
      const textarea = contentRoot.querySelector("#customer-reply-form textarea");
      if (textarea) {
        textarea.value = button.dataset.quickReply || "";
        textarea.focus();
      }
    });
  });

  document.querySelector("#thread-status-select")?.addEventListener("change", async (event) => {
    if (!selected?.id) {
      return;
    }

    await updateAdminSupportConversation(selected.id, {
      status: event.target.value,
    });
    await renderCurrentSection();
  });

  document.querySelector("#thread-resolve-button")?.addEventListener("click", async () => {
    if (!selected?.id) {
      return;
    }

    await updateAdminSupportConversation(selected.id, {
      status: "resolved",
    });
    await renderCurrentSection();
  });

  document.querySelector("#thread-reopen-button")?.addEventListener("click", async () => {
    if (!selected?.id) {
      return;
    }

    await updateAdminSupportConversation(selected.id, {
      status: "waiting_admin",
    });
    await renderCurrentSection();
  });

  document.querySelector("#customer-reply-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selected?.id) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const text = String(formData.get("text") || "").trim();
    const file = formData.get("image");
    let image = "";

    if (file && typeof file === "object" && file.size) {
      image = await fileToDataUrl(file);
    }

    if (!text && !image) {
      return;
    }

    await createAdminSupportMessage(selected.id, {
      text,
      imageUrl: image,
    });

    form.reset();
    await renderCurrentSection();
  });
};

const getCustomerOrderHistory = (conversation, orders) => {
  if (!conversation || !Array.isArray(orders)) {
    return [];
  }

  const email = String(conversation.email || "").trim().toLowerCase();
  const phone = String(conversation.phone || "").trim();
  const customerName = String(conversation.customerName || "").trim().toLowerCase();
  const relatedOrderId = String(conversation.relatedOrderId || conversation.orderId || "").trim();

  return orders
    .filter((order) => {
      const orderId = String(order.id || "").trim();
      const orderEmail = String(order.email || "").trim().toLowerCase();
      const orderPhone = String(order.phone || "").trim();
      const orderCustomerName = String(order.customerName || "").trim().toLowerCase();

      if (relatedOrderId && orderId === relatedOrderId) {
        return true;
      }

      if (email && orderEmail && orderEmail === email) {
        return true;
      }

      if (phone && orderPhone && orderPhone === phone) {
        return true;
      }

      return Boolean(customerName && orderCustomerName && customerName === orderCustomerName);
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
};

const loadCustomersSectionData = async () => {
  let conversations = await fetchAdminSupportConversations({
    query: adminState.customers.query,
    status: adminState.customers.status,
    conversationType: adminState.customers.conversationType,
  });

  if (!conversations.some((thread) => thread.id === adminState.customers.selectedId)) {
    adminState.customers.selectedId = conversations[0]?.id || null;
  }

  let selected = conversations.find((thread) => thread.id === adminState.customers.selectedId) || null;
  let messages = [];
  let detailError = "";

  if (selected?.id) {
    try {
      if (selected.adminUnreadCount > 0) {
        const readConversation = await markAdminSupportConversationRead(selected.id);
        conversations = sortSupportConversations(
          conversations.map((thread) => (thread.id === readConversation?.id ? { ...thread, ...readConversation } : thread))
        );
        selected = conversations.find((thread) => thread.id === adminState.customers.selectedId) || selected;
      }

      const [nextSelected, nextMessages] = await Promise.all([
        fetchAdminSupportConversation(selected.id),
        fetchAdminSupportMessages(selected.id),
      ]);
      selected = nextSelected || selected;
      messages = nextMessages;
    } catch (error) {
      detailError = error?.message || "Unknown error.";
    }
  }

  adminSupportRuntime.conversations = sortSupportConversations(conversations);
  adminSupportRuntime.selected = selected;
  adminSupportRuntime.messages = Array.isArray(messages) ? messages : [];
  adminSupportRuntime.customerOrders = selected ? getCustomerOrderHistory(selected, await fetchAdminOrders()) : [];
  adminSupportRuntime.detailError = detailError;
};

const updateAdminConversationListDom = () => {
  const listRoot = contentRoot.querySelector(".admin-thread-list");
  const countNode = contentRoot.querySelector(".admin-thread-panel .admin-panel-header p");
  const emptyNode = contentRoot.querySelector(".admin-thread-panel .admin-empty-state");
  const conversations = adminSupportRuntime.conversations;
  const selectedId = adminState.customers.selectedId;

  if (countNode) {
    countNode.textContent = `${formatNumber(conversations.length)} active conversation${conversations.length === 1 ? "" : "s"}`;
  }

  if (!listRoot) {
    return;
  }

  if (!conversations.length) {
    listRoot.innerHTML = "";
    if (emptyNode) {
      emptyNode.hidden = false;
    }
    return;
  }

  if (emptyNode) {
    emptyNode.hidden = true;
  }

  listRoot.innerHTML = conversations
    .map((thread) => createAdminConversationRowMarkup(thread, selectedId))
    .join("");

  listRoot.querySelectorAll("[data-thread-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      adminState.customers.selectedId = button.dataset.threadId || null;
      adminSupportRuntime.sendStatusMessage = "";
      adminSupportRuntime.sendStatusType = "neutral";
      await renderCurrentSection();
    });
  });
};

const updateAdminSelectedConversationHeader = () => {
  const selected = getSelectedSupportConversation();
  if (!selected) {
    return;
  }

  const headerRoot = contentRoot.querySelector(".admin-chat-header");
  if (!headerRoot) {
    return;
  }

  const emailNode = headerRoot.querySelector(".admin-chat-header-email");
  if (emailNode) {
    emailNode.textContent = selected.email || "No email";
  }

  const summaryNode = headerRoot.querySelector(".admin-chat-header-summary");
  if (summaryNode) {
    summaryNode.textContent = getAdminConversationContext(selected) || "Support conversation";
  }

  const liveNode = headerRoot.querySelector("#admin-support-live-status");
  if (liveNode) {
    liveNode.textContent = getAdminSupportLiveLabel(adminSupportRuntime.liveState);
    liveNode.dataset.state = adminSupportRuntime.liveState || "idle";
  }

  const statusSelect = headerRoot.querySelector("#thread-status-select");
  if (statusSelect) {
    statusSelect.value = selected.status || "open";
  }
};

const appendAdminMessagesToDom = (messages, options = {}) => {
  const historyNode = contentRoot.querySelector(".admin-chat-history");
  const selected = getSelectedSupportConversation();
  if (!historyNode || !selected || !Array.isArray(messages) || !messages.length) {
    return;
  }

  const shouldScroll = options.forceScroll === true || (options.autoScroll !== false && isAdminChatNearBottom());
  const existingIds = new Set(
    Array.from(historyNode.querySelectorAll("[data-message-id]")).map((node) => String(node.dataset.messageId || ""))
  );
  const fragment = document.createDocumentFragment();

  messages.forEach((message) => {
    const normalizedId = String(message?.id || "");
    if (normalizedId && existingIds.has(normalizedId)) {
      return;
    }

    const template = document.createElement("template");
    template.innerHTML = createAdminChatMessageMarkup(message, selected).trim();
    if (template.content.firstElementChild) {
      fragment.appendChild(template.content.firstElementChild);
    }
  });

  if (!fragment.childNodes.length) {
    return;
  }

  if (historyNode.querySelector(".admin-empty-state")) {
    historyNode.innerHTML = "";
  }

  historyNode.appendChild(fragment);
  if (shouldScroll) {
    scrollAdminChatToBottom();
  }
};

const syncAdminReplyTextareaHeight = (textarea) => {
  if (!textarea) {
    return;
  }

  textarea.style.height = "auto";
  const maxHeight = 120;
  const nextHeight = Math.min(Math.max(textarea.scrollHeight, 52), maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
};

const setAdminReplyFormSendingState = (sending) => {
  const form = document.querySelector("#customer-reply-form");
  const submitButton = form?.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = Boolean(sending);
    submitButton.textContent = sending ? "Sending..." : "Send Reply";
  }
};

const renderCustomersSectionView = (options = {}) => {
  const preservedDraft = options.clearDraft ? "" : getAdminSupportComposerDraft();
  const conversations = adminSupportRuntime.conversations;
  const selected = getSelectedSupportConversation();
  const messages = adminSupportRuntime.messages;
  const customerOrders = Array.isArray(adminSupportRuntime.customerOrders) ? adminSupportRuntime.customerOrders : [];
  const detailError = adminSupportRuntime.detailError;
  const liveLabel = adminSupportRuntime.liveLabel || getAdminSupportLiveLabel(adminSupportRuntime.liveState);
  adminSupportRuntime.selected = selected;

  contentRoot.innerHTML = `
    <div class="admin-stack">
      <section class="admin-toolbar">
        <label class="admin-search-field">
          <span>Search</span>
          <input
            id="support-search"
            class="admin-search-input"
            type="search"
            placeholder="Search customer, email, order, product"
            value="${escapeHtml(adminState.customers.query)}"
          >
        </label>
        <label>
          <span>Status</span>
          <select id="support-status-filter">
            <option value="all" ${adminState.customers.status === "all" ? "selected" : ""}>All</option>
            ${SUPPORT_CONVERSATION_STATUSES.map(
              (status) => `
                <option value="${status}" ${adminState.customers.status === status ? "selected" : ""}>${formatStatusLabel(status)}</option>
              `
            ).join("")}
          </select>
        </label>
        <label>
          <span>Type</span>
          <select id="support-type-filter">
            <option value="all" ${adminState.customers.conversationType === "all" ? "selected" : ""}>All</option>
            ${SUPPORT_CONVERSATION_TYPES.map(
              (type) => `
                <option value="${type}" ${adminState.customers.conversationType === type ? "selected" : ""}>${formatStatusLabel(type)}</option>
              `
            ).join("")}
          </select>
        </label>
      </section>

      <div class="admin-chat-layout">
        <section class="admin-panel admin-thread-panel">
          <div class="admin-panel-header">
            <div>
              <h3>Customer List</h3>
              <p>${formatNumber(conversations.length)} active conversation${conversations.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          ${
            conversations.length
              ? `
                <div class="admin-thread-list">
                  ${conversations
                    .map((thread) => createAdminConversationRowMarkup(thread, selected?.id))
                    .join("")}
                </div>
              `
              : renderEmptyState("No customer conversations yet", "Support chats will appear here.")
          }
        </section>

        <section class="admin-panel admin-chat-panel">
          ${
            selected
              ? detailError
                ? `
                  <div class="admin-panel-header">
                    <div>
                      <h3>${escapeHtml(selected.customerName || "Website Visitor")}</h3>
                      <p class="admin-error-text">Failed to load conversation: ${escapeHtml(detailError)}</p>
                    </div>
                  </div>
                `
                : `
                  <div class="admin-chat-header">
                    <div class="admin-chat-header-main">
                      <h3>${escapeHtml(selected.customerName || "Website Visitor")}</h3>
                      <p class="admin-chat-header-email">${escapeHtml(selected.email || "No email")}</p>
                      <p class="admin-chat-header-summary">${escapeHtml(
                        getAdminConversationContext(selected) || "Support conversation"
                      )}</p>
                      <p class="admin-chat-header-subline">
                        ${selected.country ? `<span>${escapeHtml(selected.country)}</span><span>&bull;</span>` : ""}
                        <span id="admin-support-live-status" data-state="${escapeHtml(adminSupportRuntime.liveState)}">${escapeHtml(
                          liveLabel
                        )}</span>
                      </p>
                    </div>
                    <div class="admin-chat-header-actions">
                      <label>
                        <span>Status</span>
                        <select id="thread-status-select">
                          ${SUPPORT_CONVERSATION_STATUSES.map(
                            (status) => `
                              <option value="${status}" ${selected.status === status ? "selected" : ""}>${formatStatusLabel(status)}</option>
                            `
                          ).join("")}
                        </select>
                      </label>
                      <button class="admin-secondary-button" type="button" id="thread-resolve-button">Mark Resolved</button>
                      <button class="admin-secondary-button" type="button" id="thread-reopen-button">Reopen</button>
                    </div>
                  </div>

                  <div class="admin-info-grid admin-info-grid-tight admin-customer-detail-grid">
                    <article class="admin-info-card">
                      <h5>Customer Information</h5>
                      <dl class="admin-description-grid">
                        <div><dt>Name</dt><dd>${escapeHtml(selected.customerName || "-")}</dd></div>
                        <div><dt>Email</dt><dd class="admin-break-anywhere">${escapeHtml(selected.email || "-")}</dd></div>
                        <div><dt>Phone</dt><dd>${escapeHtml(selected.phone || "-")}</dd></div>
                        <div><dt>Country</dt><dd>${escapeHtml(selected.country || "-")}</dd></div>
                      </dl>
                    </article>
                    <article class="admin-info-card">
                      <div class="admin-section-head">
                        <h5>Order History</h5>
                      </div>
                      ${
                        customerOrders.length
                          ? `
                            <div class="admin-linked-record-list">
                              ${customerOrders
                                .map(
                                  (order) => `
                                    <button class="admin-linked-record-row" type="button" data-customer-order-id="${escapeHtml(
                                      order.id
                                    )}">
                                      <div class="admin-linked-record-main">
                                        <strong>${escapeHtml(order.orderNumber || order.orderId || order.id || "-")}</strong>
                                        <p>${escapeHtml(order.totalAmount || order.subtotal || "-")}</p>
                                      </div>
                                      <div class="admin-linked-record-side">
                                        <span class="admin-pill ${getStatusClass(order.orderStatus)}">${escapeHtml(
                                          formatStatusLabel(order.orderStatus)
                                        )}</span>
                                        <small>${escapeHtml(formatDate(order.createdAt))}</small>
                                        <span class="admin-link-hint">View Order →</span>
                                      </div>
                                    </button>
                                  `
                                )
                                .join("")}
                            </div>
                          `
                          : renderEmptyState("No orders yet", "This customer has no linked order history yet.")
                      }
                    </article>
                  </div>

                  <div class="admin-chat-history">
                    ${
                      messages.length
                        ? messages.map((message) => createAdminChatMessageMarkup(message, selected)).join("")
                        : renderEmptyState("No messages yet", "Send the first reply from this panel.")
                    }
                  </div>

                  <div class="admin-chat-footer">
                    <div class="admin-quick-replies">
                      ${SUPPORT_QUICK_REPLIES.map(
                        (reply) => `
                          <button type="button" class="admin-quick-reply" data-quick-reply="${escapeHtml(reply)}">
                            ${escapeHtml(reply)}
                          </button>
                        `
                      ).join("")}
                    </div>

                    <form class="admin-chat-composer" id="customer-reply-form">
                      <textarea
                        name="text"
                        rows="1"
                        placeholder="Write a reply to the customer"
                      ></textarea>
                      <div class="admin-chat-composer-actions">
                        <label class="admin-file-field admin-chat-attach">
                          <input type="file" name="image" accept="image/*">
                          <span>Attach Image</span>
                        </label>
                        <button class="admin-primary-button" type="submit" ${adminSupportRuntime.isSending ? "disabled" : ""}>${
                          adminSupportRuntime.isSending ? "Sending..." : "Send Reply"
                        }</button>
                      </div>
                      <p class="admin-form-status" id="admin-support-send-status" aria-live="polite"></p>
                    </form>
                  </div>
                `
              : renderEmptyState("No customer selected", "Choose a customer thread to open the chat window.")
          }
        </section>
      </div>
    </div>
  `;

  const statusNode = document.querySelector("#admin-support-send-status");
  if (statusNode) {
    statusNode.textContent = String(adminSupportRuntime.sendStatusMessage || "");
    statusNode.dataset.state = adminSupportRuntime.sendStatusType || "neutral";
  }

  const textarea = contentRoot.querySelector("#customer-reply-form textarea");
  if (textarea) {
    textarea.value = preservedDraft;
    syncAdminReplyTextareaHeight(textarea);
    textarea.addEventListener("input", () => {
      syncAdminReplyTextareaHeight(textarea);
    });
  }
  if (textarea && preservedDraft) {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  document.querySelector("#support-search")?.addEventListener("input", async (event) => {
    adminState.customers.query = event.target.value;
    await renderCurrentSection();
  });

  document.querySelector("#support-status-filter")?.addEventListener("change", async (event) => {
    adminState.customers.status = event.target.value || "all";
    await renderCurrentSection();
  });

  document.querySelector("#support-type-filter")?.addEventListener("change", async (event) => {
    adminState.customers.conversationType = event.target.value || "all";
    await renderCurrentSection();
  });

  updateAdminConversationListDom();

  contentRoot.querySelectorAll("[data-customer-order-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openAdminOrderDetail(button.dataset.customerOrderId || null);
    });
  });

  contentRoot.querySelectorAll("[data-quick-reply]").forEach((button) => {
    button.addEventListener("click", () => {
      const composer = contentRoot.querySelector("#customer-reply-form textarea");
      if (composer) {
        composer.value = button.dataset.quickReply || "";
        syncAdminReplyTextareaHeight(composer);
        composer.focus();
      }
    });
  });

  document.querySelector("#thread-status-select")?.addEventListener("change", async (event) => {
    if (!selected?.id) {
      return;
    }

    const conversation = await updateAdminSupportConversation(selected.id, {
      status: event.target.value,
    });
    mergeAdminSupportConversation(conversation);
    renderCustomersSectionView();
  });

  document.querySelector("#thread-resolve-button")?.addEventListener("click", async () => {
    if (!selected?.id) {
      return;
    }

    const conversation = await updateAdminSupportConversation(selected.id, {
      status: "resolved",
    });
    mergeAdminSupportConversation(conversation);
    renderCustomersSectionView();
  });

  document.querySelector("#thread-reopen-button")?.addEventListener("click", async () => {
    if (!selected?.id) {
      return;
    }

    const conversation = await updateAdminSupportConversation(selected.id, {
      status: "waiting_admin",
    });
    mergeAdminSupportConversation(conversation);
    renderCustomersSectionView();
  });

  document.querySelector("#customer-reply-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selected?.id || adminSupportRuntime.isSending) {
      return;
    }

    const form = event.currentTarget;
    const activeConversationId = String(selected.id || "");
    const formData = new FormData(form);
    const text = String(formData.get("text") || "").trim();
    const file = formData.get("image");
    let image = "";

    if (file && typeof file === "object" && file.size) {
      image = await fileToDataUrl(file);
    }

    if (!text && !image) {
      return;
    }

    adminSupportRuntime.isSending = true;
    adminSupportRuntime.sendStatusMessage = "";
    adminSupportRuntime.sendStatusType = "neutral";
    setAdminReplyFormSendingState(true);

    try {
      const postStartedAt = nowMs();
      const result = await createAdminSupportMessage(activeConversationId, {
        text,
        imageUrl: image,
      });
      const postDurationMs = durationMs(postStartedAt);
      const renderStartedAt = nowMs();
      mergeAdminSupportConversation(result.conversation);
      mergeAdminSupportMessage(result.message);
      adminSupportRuntime.sendStatusMessage = "Reply sent.";
      adminSupportRuntime.sendStatusType = "success";
      adminSupportRuntime.isSending = false;
      form.reset();
      syncAdminReplyTextareaHeight(form.querySelector('textarea'));
      setAdminReplyFormSendingState(false);
      appendAdminMessagesToDom([result.message], {
        forceScroll: true,
      });
      updateAdminConversationListDom();
      updateAdminSelectedConversationHeader();
      const statusNodeAfterSuccess = document.querySelector("#admin-support-send-status");
      if (statusNodeAfterSuccess) {
        statusNodeAfterSuccess.textContent = adminSupportRuntime.sendStatusMessage;
        statusNodeAfterSuccess.dataset.state = adminSupportRuntime.sendStatusType;
      }
      logAdminSupportTiming("send_reply", {
        click_to_post_start_ms: 0,
        post_duration_ms: postDurationMs,
        post_success_render_ms: durationMs(renderStartedAt),
        follow_up_get_duration_ms: 0,
      });
    } catch (error) {
      adminSupportRuntime.isSending = false;
      adminSupportRuntime.sendStatusMessage = error?.message || "Unable to send admin support reply.";
      adminSupportRuntime.sendStatusType = "error";
      setAdminReplyFormSendingState(false);
      const statusNodeAfterError = document.querySelector("#admin-support-send-status");
      if (statusNodeAfterError) {
        statusNodeAfterError.textContent = adminSupportRuntime.sendStatusMessage;
        statusNodeAfterError.dataset.state = adminSupportRuntime.sendStatusType;
      }
    }
  });
};

const reconcileCustomersSection = async () => {
  if (adminState.activeSection !== "customers" || adminSupportRuntime.isSending || adminSupportRuntime.isMessagePolling) {
    return;
  }

  const selectedConversationId = String(adminState.customers.selectedId || "").trim();
  if (!selectedConversationId) {
    return;
  }

  adminSupportRuntime.isMessagePolling = true;
  try {
    const snapshot = await fetchAdminSupportMessageSnapshot(selectedConversationId);
    const conversation = snapshot.conversation || null;
    const nextMessages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
    const existingIds = new Set((Array.isArray(adminSupportRuntime.messages) ? adminSupportRuntime.messages : []).map((item) => String(item?.id || "")));
    const nextIds = new Set(nextMessages.map((item) => String(item?.id || "")));
    const newMessages = nextMessages.filter((item) => !existingIds.has(String(item?.id || "")));
    const requiresFullSync =
      nextMessages.length < adminSupportRuntime.messages.length ||
      adminSupportRuntime.messages.some((item) => !nextIds.has(String(item?.id || "")));

    if (conversation?.id) {
      mergeAdminSupportConversation(conversation);
      updateAdminSelectedConversationHeader();
      updateAdminConversationListDom();
    }

    if (requiresFullSync) {
      adminSupportRuntime.messages = nextMessages;
      renderCustomersSectionView();
      setAdminSupportLiveState("connected");
      return;
    }

    if (newMessages.length) {
      adminSupportRuntime.messages = [...adminSupportRuntime.messages, ...newMessages];
      appendAdminMessagesToDom(newMessages, {
        autoScroll: true,
      });

      if (newMessages.some((message) => message.sender === "customer")) {
        const readConversation = await markAdminSupportConversationRead(selectedConversationId);
        mergeAdminSupportConversation(readConversation);
        updateAdminSelectedConversationHeader();
        updateAdminConversationListDom();
      }
    } else {
      adminSupportRuntime.messages = nextMessages;
    }

    setAdminSupportLiveState("connected");
  } catch (error) {
    setAdminSupportLiveState(window.navigator.onLine === false ? "offline" : "reconnecting");
    console.warn("[support-admin] reconcile failed:", error);
  } finally {
    adminSupportRuntime.isMessagePolling = false;
  }
};

const pollAdminConversationList = async () => {
  if (adminState.activeSection !== "customers" || adminSupportRuntime.isListPolling) {
    return;
  }

  adminSupportRuntime.isListPolling = true;
  try {
    const conversations = sortSupportConversations(
      await fetchAdminSupportConversations({
        query: adminState.customers.query,
        status: adminState.customers.status,
        conversationType: adminState.customers.conversationType,
      })
    );
    adminSupportRuntime.conversations = conversations;

    if (!conversations.some((thread) => thread.id === adminState.customers.selectedId)) {
      adminState.customers.selectedId = conversations[0]?.id || null;
      await renderCurrentSection();
      return;
    }

    updateAdminConversationListDom();
    updateAdminSelectedConversationHeader();
    setAdminSupportLiveState("connected");
  } catch (error) {
    setAdminSupportLiveState(window.navigator.onLine === false ? "offline" : "reconnecting");
    console.warn("[support-admin] conversation list poll failed:", error);
  } finally {
    adminSupportRuntime.isListPolling = false;
  }
};

const startAdminSupportPolling = () => {
  stopAdminSupportPolling();
  if (adminState.activeSection !== "customers") {
    return;
  }

  adminSupportRuntime.messagePollTimer = window.setInterval(() => {
    reconcileCustomersSection();
  }, ADMIN_SUPPORT_MESSAGE_POLL_MS);
  adminSupportRuntime.listPollTimer = window.setInterval(() => {
    pollAdminConversationList();
  }, ADMIN_SUPPORT_LIST_POLL_MS);
};

const startAdminSupportLiveSync = () => {
  setAdminSupportLiveState("connected");
  startAdminSupportPolling();
};

const renderCustomersSection = async () => {
  try {
    await loadCustomersSectionData();
  } catch (error) {
    contentRoot.innerHTML = `
      <section class="admin-panel">
        <div class="admin-panel-header">
          <div>
            <h3>Customer Support</h3>
            <p class="admin-error-text">Failed to load support conversations: ${escapeHtml(
              error?.message || "Unknown error."
            )}</p>
          </div>
        </div>
      </section>
    `;
    return;
  }

  renderCustomersSectionView();
  startAdminSupportLiveSync();
};

const renderProductTable = (products) => `
  <div class="admin-table-shell">
    <table class="admin-table">
      <thead>
        <tr>
          <th>Image</th>
          <th>Name</th>
          <th>Category</th>
          <th>Price</th>
          <th>MOQ</th>
          <th>Shipping</th>
          <th>Stock</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${products
          .map(
            (product) => `
              <tr>
                <td><img class="admin-image-thumb" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}"></td>
                <td>${escapeHtml(product.name)}</td>
                <td>${escapeHtml(product.category)}</td>
                <td>${escapeHtml(product.price)}</td>
                <td>${escapeHtml(product.moq)}</td>
                <td>${escapeHtml(product.shippingTime)}</td>
                <td>${escapeHtml(product.stock)}</td>
                <td><span class="admin-pill ${getStatusClass(product.status)}">${escapeHtml(product.status)}</span></td>
                <td>
                  <div class="admin-actions-inline">
                    <button class="admin-secondary-button" type="button" data-product-edit="${escapeHtml(product.id)}">Edit</button>
                    <button class="admin-danger-button" type="button" data-product-delete="${escapeHtml(product.id)}">Delete</button>
                  </div>
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  </div>
`;

const renderProductListSection = async () => {
  const products = await window.NorthstarStore.getProducts();

  contentRoot.innerHTML = `
    <div class="admin-stack">
      <section class="admin-panel">
        <div class="admin-panel-header">
          <div>
            <h3>Products</h3>
            <p>All storefront product pages read from this catalog.</p>
          </div>
          <button class="admin-primary-button" type="button" id="add-product-button">Add Product</button>
        </div>
        ${
          products.length
            ? renderProductTable(products)
            : renderEmptyState("No products yet", "Use Add Product to create the first catalog item.")
        }
      </section>
    </div>
  `;

  document.querySelector("#add-product-button")?.addEventListener("click", async () => {
    adminState.products.mode = "edit";
    adminState.products.editingId = null;
    await renderCurrentSection();
  });

  contentRoot.querySelectorAll("[data-product-edit]").forEach((button) => {
    button.addEventListener("click", async () => {
      adminState.products.mode = "edit";
      adminState.products.editingId = button.dataset.productEdit || null;
      await renderCurrentSection();
    });
  });

  contentRoot.querySelectorAll("[data-product-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Delete this product?")) {
        return;
      }

      try {
        await window.NorthstarStore.deleteProduct(button.dataset.productDelete);
        await renderCurrentSection();
      } catch (error) {
        window.alert(error?.message || "Unable to delete product.");
      }
    });
  });
};

const renderProductEditorSection = async () => {
  const currentProduct = adminState.products.editingId
    ? await window.NorthstarStore.getProductById(adminState.products.editingId)
    : null;

  const product = currentProduct || {
    id: "",
    slug: "",
    name: "",
    category: "",
    image: "",
    mainImagePublicId: "",
    priceValue: "",
    moqValue: 1,
    shippingDays: 1,
    stock: 0,
    status: "active",
    b2c: {
      enabled: true,
      retailPrice: "",
      compareAtPrice: "",
      retailStock: 0,
      minimumQuantity: 1,
    },
    b2b: {
      enabled: true,
      wholesaleMoq: 1,
      wholesaleLeadTime: 1,
      priceTiers: [],
      depositTerms: "30% Deposit, 70% Before Shipment",
      deposit: {
        required: true,
        type: "percentage",
        value: "",
        balanceDueStage: "before-shipment",
        customPaymentTerms: "30% Deposit, 70% Before Shipment",
        refundable: false,
        notes: "",
      },
    },
    description: "",
    detailDescription: "",
    seoTitle: "",
    metaDescription: "",
    keywords: [],
    functions: [],
    scenarios: [],
    markets: [],
    tags: [],
    specs: {},
    detailImages: [],
  };
  const initialDetailImages = (product.detailImages || [])
    .filter((item) => item?.url)
    .map((item, index) => ({
      id: String(item.id || `existing-${index + 1}`),
      kind: "existing",
      url: String(item.url || "").trim(),
      publicId: String(item.publicId || "").trim(),
    }));
  const wholesaleCapacityKey = "Monthly Production Capacity";
  const wholesaleCapacityValue = String(product.specs?.[wholesaleCapacityKey] || "").trim();
  const specEntries = getSpecEntries(product.specs || {}).filter(([key]) => key !== wholesaleCapacityKey);
  const defaultPaymentTerms = "30% Deposit, 70% Before Shipment";
  const createChipEditorMarkup = (field, label, items) => `
    <div class="admin-chip-editor" data-chip-editor="${field}">
      <span class="admin-chip-editor-label">${escapeHtml(label)}</span>
      <div class="admin-chip-list" data-chip-list>
        ${uniqueTextList(items)
          .map(
            (item) => `
              <button class="admin-chip" type="button" data-chip-value="${escapeHtml(item)}">
                <span>${escapeHtml(item)}</span>
                <span aria-hidden="true">x</span>
              </button>
            `
          )
          .join("")}
      </div>
      <div class="admin-chip-composer">
        <input type="text" data-chip-input placeholder="Add ${escapeHtml(label.toLowerCase())}">
        <button class="admin-secondary-button" type="button" data-chip-add>Add</button>
      </div>
    </div>
  `;

  contentRoot.innerHTML = `
    <div class="admin-stack">
      <div class="admin-page-head">
        <div>
          <h2>${adminState.products.editingId ? "Edit Product" : "Add Product"}</h2>
          <p>Changes sync to homepage, product detail, checkout, and AI Match.</p>
        </div>
        <button class="admin-secondary-button" type="button" id="product-back-button">Back to Products</button>
      </div>

      <form class="admin-form-stack" id="product-editor-form">
        <input type="hidden" name="id" value="${escapeHtml(product.id || "")}">
        <input type="hidden" name="createdAt" value="${escapeHtml(product.createdAt || "")}">

        <div class="admin-editor-tabs" role="tablist" aria-label="Product editor tabs">
          ${productEditorTabs
            .map(
              (tab) => `
                <button
                  type="button"
                  class="admin-editor-tab ${adminState.products.editorTab === tab.id ? "is-active" : ""}"
                  data-editor-tab="${tab.id}"
                  aria-selected="${adminState.products.editorTab === tab.id ? "true" : "false"}"
                >
                  ${escapeHtml(tab.label)}
                </button>
              `
            )
            .join("")}
        </div>

        <div class="admin-section-grid admin-editor-panels">
          <section class="admin-panel admin-editor-panel ${adminState.products.editorTab === "basic" ? "is-active" : ""}" data-editor-panel="basic">
            <div class="admin-panel-header">
              <div>
                <h3>Core Fields</h3>
                <p>Simple catalog information used across the storefront.</p>
              </div>
            </div>
            <div class="admin-form-grid">
              <label>
                Product Name
                <input type="text" name="name" value="${escapeHtml(product.name || "")}" required>
              </label>
              <label>
                Category
                <input type="text" name="category" value="${escapeHtml(product.category || "")}" required>
              </label>
              <label>
                Status
                <select name="status">
                  <option value="active" ${product.status === "active" ? "selected" : ""}>active</option>
                  <option value="draft" ${product.status === "draft" ? "selected" : ""}>draft</option>
                  <option value="archived" ${product.status === "archived" ? "selected" : ""}>archived</option>
                </select>
              </label>
            </div>

            <div class="admin-pricing-shell">
              <div class="admin-pricing-header">
                <div>
                  <h3>Sales Configuration</h3>
                  <p>Separate direct-to-consumer retail settings from wholesale trade settings.</p>
                </div>
              </div>
              <div class="admin-pricing-tabs" role="tablist" aria-label="Pricing mode tabs">
                <button type="button" class="admin-pricing-tab is-active" data-pricing-tab="retail" aria-selected="true">Retail</button>
                <button type="button" class="admin-pricing-tab" data-pricing-tab="wholesale" aria-selected="false">Wholesale</button>
              </div>

              <section class="admin-pricing-panel is-active" data-pricing-panel="retail">
                <div class="admin-pricing-section-head">
                  <h4>Retail</h4>
                  <p>Fields used for B2C pricing, inventory and shipping.</p>
                </div>
                <div class="admin-form-grid">
                  <label class="admin-checkbox-field full">
                    <input type="checkbox" name="b2cEnabled" ${product.b2c?.enabled ? "checked" : ""}>
                    <span>Enable Retail</span>
                  </label>
                  <label>
                    Retail Price
                    <input type="number" name="b2cRetailPrice" min="0" step="0.01" value="${escapeHtml(
                      product.b2c?.retailPrice ?? ""
                    )}">
                  </label>
                  <label>
                    Shipping Time (Days)
                    <input type="number" name="shippingDays" min="1" step="1" value="${escapeHtml(
                      product.shippingDays || 1
                    )}" required>
                  </label>
                </div>
              </section>

              <section class="admin-pricing-panel" data-pricing-panel="wholesale">
                <div class="admin-pricing-section-head">
                  <h4>Wholesale</h4>
                  <p>Fields used for MOQ, trade lead time, production capacity and tiered pricing.</p>
                </div>
                <div class="admin-form-grid">
                  <label class="admin-checkbox-field full">
                    <input type="checkbox" name="b2bEnabled" ${product.b2b?.enabled ? "checked" : ""}>
                    <span>Enable Wholesale</span>
                  </label>
                  <label>
                    MOQ
                    <input type="number" name="b2bWholesaleMoq" min="1" step="1" value="${escapeHtml(
                      product.b2b?.wholesaleMoq ?? product.moqValue ?? 1
                    )}">
                  </label>
                  <label>
                    Lead Time (Days)
                    <input type="number" name="b2bWholesaleLeadTime" min="1" step="1" value="${escapeHtml(
                      product.b2b?.wholesaleLeadTime ?? product.shippingDays ?? 1
                    )}">
                  </label>
                  <label>
                    Deposit Percentage
                    <input type="number" name="b2bDepositValue" min="0" step="0.01" value="${escapeHtml(
                      product.b2b?.deposit?.value ?? ""
                    )}">
                  </label>
                  <label class="full">
                    Payment Terms
                    <textarea name="b2bCustomPaymentTerms" rows="4">${escapeHtml(
                      product.b2b?.deposit?.customPaymentTerms || product.b2b?.depositTerms || defaultPaymentTerms
                    )}</textarea>
                  </label>
                </div>

                <div class="admin-pricing-tier-shell">
                  <div class="admin-panel-header">
                    <div>
                      <h4>Wholesale Price Tiers</h4>
                      <p>Set quantity ranges and unit pricing for wholesale buyers.</p>
                    </div>
                  </div>
                  <div class="admin-tier-list" id="product-tier-list">
                    ${(Array.isArray(product.b2b?.priceTiers) && product.b2b.priceTiers.length
                      ? product.b2b.priceTiers
                      : [{ id: "", minQuantity: product.b2b?.wholesaleMoq ?? product.moqValue ?? 1, maxQuantity: 0, unitPrice: "" }])
                      .map(
                        (tier, index) => `
                          <div class="admin-tier-row" data-tier-row>
                            <input type="hidden" data-tier-id value="${escapeHtml(tier.id || "")}">
                            <label>
                              Min Quantity
                              <input type="number" data-tier-min min="1" step="1" value="${escapeHtml(tier.minQuantity ?? 1)}">
                            </label>
                            <label>
                              Max Quantity
                              <input type="number" data-tier-max min="0" step="1" value="${escapeHtml(tier.maxQuantity ?? 0)}" placeholder="0 for open ended">
                            </label>
                            <label>
                              Unit Price
                              <input type="number" data-tier-price min="0" step="0.01" value="${escapeHtml(tier.unitPrice ?? "")}">
                            </label>
                            <button class="admin-ghost-button" type="button" data-tier-delete aria-label="Delete wholesale price tier ${index + 1}">Delete</button>
                          </div>
                        `
                      )
                      .join("")}
                  </div>
                  <div class="admin-actions-inline">
                    <button class="admin-secondary-button" type="button" id="product-tier-add">Add Tier</button>
                  </div>
                </div>
              </section>
            </div>
          </section>

          <section class="admin-panel admin-editor-panel ${adminState.products.editorTab === "media" ? "is-active" : ""}" data-editor-panel="media">
            <div class="admin-panel-header">
              <div>
                <h3>Media</h3>
                <p>Manage the main image and gallery without using image URLs.</p>
              </div>
            </div>
            <div class="admin-media-stack">
              <section class="admin-media-section">
                <div class="admin-media-header">
                  <div>
                    <h4>Main Image</h4>
                    <p>${product.image ? "1 file" : "0 files"}</p>
                  </div>
                </div>
                <input class="admin-file-input-hidden" type="file" id="product-main-upload" accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif">
                <div class="admin-image-preview-wrap">
                  <div id="product-image-preview"></div>
                </div>
                <div class="admin-media-button-row">
                  <button class="admin-secondary-button" type="button" id="product-main-upload-trigger">Upload</button>
                  <button class="admin-secondary-button" type="button" id="product-main-select-trigger">Select Existing</button>
                  <button class="admin-secondary-button" type="button" id="product-main-replace-trigger">Replace</button>
                  <button class="admin-ghost-button" type="button" id="product-main-delete">Delete</button>
                </div>
              </section>

              <section class="admin-media-section">
                <div class="admin-media-header">
                  <div>
                    <h4>Gallery</h4>
                    <p>${initialDetailImages.length} image${initialDetailImages.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <input class="admin-file-input-hidden" type="file" id="product-detail-upload" accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif" multiple>
                <div class="admin-media-button-row">
                  <button class="admin-secondary-button" type="button" id="product-detail-select-trigger">Select Existing</button>
                </div>
                <div class="admin-image-preview-wrap">
                  <div class="admin-media-gallery" id="product-detail-preview"></div>
                </div>
              </section>
            </div>
            <p class="admin-media-status" id="product-media-status" aria-live="polite"></p>
            <div class="admin-media-lightbox" id="product-media-lightbox" hidden>
              <button class="admin-media-lightbox-close" type="button" id="product-media-lightbox-close" aria-label="Close preview">x</button>
              <img class="admin-media-lightbox-image" id="product-media-lightbox-image" alt="Media preview">
            </div>
          </section>

          <section class="admin-panel admin-editor-panel ${adminState.products.editorTab === "description" ? "is-active" : ""}" data-editor-panel="description">
            <div class="admin-panel-header">
              <div>
                <h3>Descriptions</h3>
                <p>Public copy used on catalog and detail pages.</p>
              </div>
            </div>
            <div class="admin-form-grid">
              <label class="full">
                Product Introduction
                <textarea name="description" rows="4">${escapeHtml(product.description || "")}</textarea>
              </label>
              <label class="full">
                Detail Description
                <textarea name="detailDescription" rows="6">${escapeHtml(product.detailDescription || "")}</textarea>
              </label>
            </div>
          </section>

          <section class="admin-panel admin-editor-panel ${adminState.products.editorTab === "specifications" ? "is-active" : ""}" data-editor-panel="specifications">
            <div class="admin-panel-header">
              <div>
                <h3>Product Parameters</h3>
                <p>Each specification is managed as its own editable row.</p>
              </div>
            </div>
            <div class="admin-spec-list" id="product-spec-list">
              ${specEntries
                .map(
                  ([key, value]) => `
                    <div class="admin-spec-row">
                      <input type="text" data-spec-key placeholder="Parameter name" value="${escapeHtml(key)}">
                      <input type="text" data-spec-value placeholder="Parameter value" value="${escapeHtml(value)}">
                      <button class="admin-ghost-button" type="button" data-spec-delete>Delete Parameter</button>
                    </div>
                  `
                )
                .join("")}
            </div>
            <div class="admin-actions-inline">
              <button class="admin-secondary-button" type="button" id="product-spec-add">Add Parameter</button>
            </div>
          </section>

          <section class="admin-panel admin-editor-panel ${adminState.products.editorTab === "ai-match" ? "is-active" : ""}" data-editor-panel="ai-match">
            <div class="admin-panel-header">
              <div>
                <h3>AI Match</h3>
                <p>Fields used across matching, filtering, and recommendation context.</p>
              </div>
            </div>
            <div class="admin-form-grid">
              <div class="full">${createChipEditorMarkup("markets", "Markets", product.markets || [])}</div>
              <div class="full">${createChipEditorMarkup("functions", "Functions", product.functions || [])}</div>
              <div class="full">${createChipEditorMarkup("scenarios", "Scenarios", product.scenarios || [])}</div>
            </div>
          </section>

          <section class="admin-panel admin-editor-panel ${adminState.products.editorTab === "seo" ? "is-active" : ""}" data-editor-panel="seo">
            <div class="admin-panel-header">
              <div>
                <h3>SEO</h3>
                <p>Search metadata for this product page.</p>
              </div>
            </div>
            <div class="admin-form-grid">
              <label>
                SEO Title
                <input type="text" name="seoTitle" value="${escapeHtml(product.seoTitle || "")}">
              </label>
              <label>
                Slug
                <input type="text" name="slug" value="${escapeHtml(product.slug || product.id || "")}">
              </label>
              <label class="full">
                Meta Description
                <textarea name="metaDescription" rows="5">${escapeHtml(product.metaDescription || "")}</textarea>
              </label>
              <div class="full">${createChipEditorMarkup("keywords", "Keywords", product.keywords || product.tags || [])}</div>
            </div>
          </section>
        </div>

        <div class="admin-sticky-action-bar">
          <div class="admin-sticky-action-bar-inner">
            ${
              adminState.products.editingId
                ? `<button class="admin-danger-button" type="button" id="product-delete-button">Delete Product</button>`
                : `<span></span>`
            }
            <div class="admin-actions-inline">
              <button class="admin-ghost-button" type="button" id="product-cancel-button">Cancel</button>
              <button class="admin-secondary-button" type="button" id="product-save-draft-button">Save Draft</button>
              <button class="admin-primary-button" type="button" id="product-publish-button">Publish</button>
            </div>
          </div>
        </div>
      </form>
    </div>
  `;

  const preview = document.querySelector("#product-image-preview");
  const detailPreview = document.querySelector("#product-detail-preview");
  const mediaStatus = document.querySelector("#product-media-status");
  const mediaLightbox = document.querySelector("#product-media-lightbox");
  const mediaLightboxImage = document.querySelector("#product-media-lightbox-image");
  const specList = document.querySelector("#product-spec-list");
  const tierList = document.querySelector("#product-tier-list");
  const productEditorForm = document.querySelector("#product-editor-form");
  const statusField = productEditorForm?.querySelector('select[name="status"]');
  const cancelButton = document.querySelector("#product-cancel-button");
  const saveDraftButton = document.querySelector("#product-save-draft-button");
  const publishButton = document.querySelector("#product-publish-button");
  const mainUploadButton = document.querySelector("#product-main-upload-trigger");
  const mainSelectButton = document.querySelector("#product-main-select-trigger");
  const mainReplaceButton = document.querySelector("#product-main-replace-trigger");
  const mainDeleteButton = document.querySelector("#product-main-delete");
  const detailSelectButton = document.querySelector("#product-detail-select-trigger");
  let mainImageValue = product.image || "";
  let mainImagePublicIdValue = product.mainImagePublicId || "";
  let pendingMainImageFile = null;
  let pendingMainPreviewUrl = "";
  let mainImageRemoved = false;
  let detailImageItems = initialDetailImages.slice();
  let isSubmittingProduct = false;
  let submitIntent = "publish";
  const allowedUploadTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
  const maxUploadBytes = 10 * 1024 * 1024;
  const createSpecRowMarkup = (key = "", value = "") => `
    <div class="admin-spec-row">
      <input type="text" data-spec-key placeholder="Parameter name" value="${escapeHtml(key)}">
      <input type="text" data-spec-value placeholder="Parameter value" value="${escapeHtml(value)}">
      <button class="admin-ghost-button" type="button" data-spec-delete>Delete Parameter</button>
    </div>
  `;
  const createTierRowMarkup = (tier = {}) => `
    <div class="admin-tier-row" data-tier-row>
      <input type="hidden" data-tier-id value="${escapeHtml(tier.id || "")}">
      <label>
        Min Quantity
        <input type="number" data-tier-min min="1" step="1" value="${escapeHtml(tier.minQuantity ?? 1)}">
      </label>
      <label>
        Max Quantity
        <input type="number" data-tier-max min="0" step="1" value="${escapeHtml(tier.maxQuantity ?? 0)}" placeholder="0 for open ended">
      </label>
      <label>
        Unit Price
        <input type="number" data-tier-price min="0" step="0.01" value="${escapeHtml(tier.unitPrice ?? "")}">
      </label>
      <button class="admin-ghost-button" type="button" data-tier-delete>Delete</button>
    </div>
  `;
  const revokeObjectUrl = (value) => {
    if (value && value.startsWith("blob:")) {
      URL.revokeObjectURL(value);
    }
  };
  const setMediaStatus = (message = "", tone = "") => {
    if (!mediaStatus) {
      return;
    }

    mediaStatus.textContent = message;
    mediaStatus.dataset.state = tone;
  };
  const validateImageFile = (file) => {
    if (!file) {
      return "No image file selected.";
    }

    if (!allowedUploadTypes.has(String(file.type || "").toLowerCase())) {
      return "Only JPG, JPEG, PNG, WEBP, and AVIF images are supported.";
    }

    if (Number(file.size || 0) > maxUploadBytes) {
      return "Image size must be 10MB or less.";
    }

    return "";
  };
  const getDisplayedMainImageUrl = () => pendingMainPreviewUrl || (mainImageRemoved ? "" : mainImageValue);
  const setSubmittingState = (submitting, label = "Saving...") => {
    isSubmittingProduct = submitting;
    [
      cancelButton,
      saveDraftButton,
      publishButton,
      mainUploadButton,
      mainSelectButton,
      mainReplaceButton,
      mainDeleteButton,
      detailSelectButton,
    ].forEach((button) => {
      if (button) {
        button.disabled = submitting;
      }
    });

    if (saveDraftButton) {
      saveDraftButton.textContent = submitting && submitIntent === "draft" ? label : "Save Draft";
    }

    if (publishButton) {
      publishButton.textContent = submitting && submitIntent === "publish" ? label : "Publish";
    }
  };
  const createPendingGalleryItem = (file) => ({
    id: `pending-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    kind: "pending",
    file,
    url: URL.createObjectURL(file),
  });

  const updatePreview = (value) => {
    if (!preview) {
      return;
    }

    if (value) {
      preview.innerHTML = `
        <div class="admin-media-main-card">
          <img class="admin-image-preview" src="${escapeHtml(value)}" alt="${escapeHtml(product.name || "Product preview")}">
        </div>
      `;
      const countNode = contentRoot.querySelector(".admin-media-section:first-child .admin-media-header p");
      if (countNode) {
        countNode.textContent = "1 file";
      }
      return;
    }

    preview.innerHTML = '<div class="admin-image-preview placeholder">No main image uploaded</div>';
    const countNode = contentRoot.querySelector(".admin-media-section:first-child .admin-media-header p");
    if (countNode) {
      countNode.textContent = "0 files";
    }
  };

  const createChipMarkup = (value) => `
    <button class="admin-chip" type="button" data-chip-value="${escapeHtml(value)}">
      <span>${escapeHtml(value)}</span>
      <span aria-hidden="true">x</span>
    </button>
  `;

  const getChipValues = (field) =>
    Array.from(contentRoot.querySelectorAll(`[data-chip-editor="${field}"] [data-chip-value]`)).map((item) =>
      String(item.dataset.chipValue || "").trim()
    );

  const attachChipEditor = (field) => {
    const editor = contentRoot.querySelector(`[data-chip-editor="${field}"]`);
    const list = editor?.querySelector("[data-chip-list]");
    const input = editor?.querySelector("[data-chip-input]");
    const addButton = editor?.querySelector("[data-chip-add]");

    if (!editor || !list || !input || !addButton) {
      return;
    }

    const addChip = () => {
      const value = String(input.value || "").trim();

      if (!value) {
        return;
      }

      const current = new Set(getChipValues(field));

      if (current.has(value)) {
        input.value = "";
        return;
      }

      list.insertAdjacentHTML("beforeend", createChipMarkup(value));
      input.value = "";
      input.focus();
    };

    addButton.addEventListener("click", addChip);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addChip();
      }
    });

    list.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-chip-value]");

      if (!chip) {
        return;
      }

      chip.remove();
    });
  };

  const renderDetailPreview = (values) => {
    if (!detailPreview) {
      return;
    }

    detailPreview.innerHTML = `
      ${values
        .map(
          (item, index) => `
            <article class="admin-media-gallery-item" draggable="true" data-gallery-index="${index}" title="Drag to reorder">
              <button class="admin-media-thumb-button" type="button" data-gallery-preview="${index}">
                <img
                  class="admin-image-preview admin-image-preview-detail"
                  src="${escapeHtml(item.url)}"
                  alt="${escapeHtml(product.name || "Product detail preview")} ${index + 1}"
                >
              </button>
              <button class="admin-media-thumb-delete" type="button" data-gallery-delete="${index}" aria-label="Delete image ${index + 1}">x</button>
            </article>
          `
        )
        .join("")}
      <button class="admin-media-gallery-add" type="button" id="product-detail-upload-tile" aria-label="Upload gallery images">
        <span>+</span>
      </button>
    `;

    const countNode = contentRoot.querySelector(".admin-media-section:nth-child(2) .admin-media-header p");
    if (countNode) {
      countNode.textContent = `${values.length} image${values.length === 1 ? "" : "s"}`;
    }
  };

  updatePreview(getDisplayedMainImageUrl());
  renderDetailPreview(detailImageItems);

  document.querySelector("#product-back-button")?.addEventListener("click", async () => {
    adminState.products.mode = "list";
    adminState.products.editingId = null;
    await renderCurrentSection();
  });

  document.querySelector("#product-cancel-button")?.addEventListener("click", async () => {
    adminState.products.mode = "list";
    adminState.products.editingId = null;
    await renderCurrentSection();
  });

  document.querySelector("#product-save-draft-button")?.addEventListener("click", () => {
    if (isSubmittingProduct) {
      return;
    }

    submitIntent = "draft";
    if (statusField) {
      statusField.value = "draft";
    }

    productEditorForm?.requestSubmit();
  });

  document.querySelector("#product-publish-button")?.addEventListener("click", () => {
    if (isSubmittingProduct) {
      return;
    }

    submitIntent = "publish";
    if (statusField) {
      statusField.value = "active";
    }

    productEditorForm?.requestSubmit();
  });

  contentRoot.querySelectorAll("[data-editor-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      adminState.products.editorTab = button.dataset.editorTab || "basic";
      contentRoot.querySelectorAll("[data-editor-tab]").forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      contentRoot.querySelectorAll("[data-editor-panel]").forEach((panel) => {
        panel.classList.toggle("is-active", panel.dataset.editorPanel === adminState.products.editorTab);
      });
    });
  });

  contentRoot.querySelectorAll("[data-pricing-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTab = button.dataset.pricingTab || "retail";
      contentRoot.querySelectorAll("[data-pricing-tab]").forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      contentRoot.querySelectorAll("[data-pricing-panel]").forEach((panel) => {
        panel.classList.toggle("is-active", panel.dataset.pricingPanel === nextTab);
      });
    });
  });

  document.querySelector("#product-spec-add")?.addEventListener("click", () => {
    if (!specList) {
      return;
    }

    specList.insertAdjacentHTML("beforeend", createSpecRowMarkup());
  });

  document.querySelector("#product-tier-add")?.addEventListener("click", () => {
    if (!tierList) {
      return;
    }

    tierList.insertAdjacentHTML(
      "beforeend",
      createTierRowMarkup({
        id: "",
        minQuantity: product.b2b?.wholesaleMoq ?? product.moqValue ?? 1,
        maxQuantity: 0,
        unitPrice: "",
      })
    );
  });

  specList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-spec-delete]");

    if (!button) {
      return;
    }

    const rows = specList.querySelectorAll(".admin-spec-row");

    if (rows.length <= 1) {
      const row = rows[0];
      row?.querySelector("[data-spec-key]")?.setAttribute("value", "");
      row?.querySelector("[data-spec-value]")?.setAttribute("value", "");
      const keyInput = row?.querySelector("[data-spec-key]");
      const valueInput = row?.querySelector("[data-spec-value]");
      if (keyInput) {
        keyInput.value = "";
      }
      if (valueInput) {
        valueInput.value = "";
      }
      return;
    }

    button.closest(".admin-spec-row")?.remove();
  });

  tierList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tier-delete]");

    if (!button) {
      return;
    }

    const rows = tierList.querySelectorAll("[data-tier-row]");

    if (rows.length <= 1) {
      const row = rows[0];
      row?.querySelector("[data-tier-id]")?.setAttribute("value", "");
      const minInput = row?.querySelector("[data-tier-min]");
      const maxInput = row?.querySelector("[data-tier-max]");
      const priceInput = row?.querySelector("[data-tier-price]");
      if (minInput) {
        minInput.value = String(product.b2b?.wholesaleMoq ?? product.moqValue ?? 1);
      }
      if (maxInput) {
        maxInput.value = "0";
      }
      if (priceInput) {
        priceInput.value = "";
      }
      return;
    }

    button.closest("[data-tier-row]")?.remove();
  });

  ["keywords", "functions", "scenarios", "markets"].forEach(attachChipEditor);

  document.querySelector("#product-main-upload-trigger")?.addEventListener("click", () => {
    if (isSubmittingProduct) {
      return;
    }
    document.querySelector("#product-main-upload")?.click();
  });

  document.querySelector("#product-main-replace-trigger")?.addEventListener("click", () => {
    if (isSubmittingProduct) {
      return;
    }
    document.querySelector("#product-main-upload")?.click();
  });

  document.querySelector("#product-main-select-trigger")?.addEventListener("click", async () => {
    if (isSubmittingProduct) {
      return;
    }
    const asset = await openMediaPicker({
      title: "Select Main Image",
      usageType: "product_main",
    });
    if (!asset) {
      return;
    }
    revokeObjectUrl(pendingMainPreviewUrl);
    pendingMainPreviewUrl = "";
    pendingMainImageFile = null;
    mainImageRemoved = false;
    mainImageValue = asset.url;
    mainImagePublicIdValue = asset.publicId || "";
    setMediaStatus("Selected existing Cloudinary asset.", "success");
    updatePreview(getDisplayedMainImageUrl());
  });

  document.querySelector("#product-detail-upload-trigger")?.addEventListener("click", () => {
    document.querySelector("#product-detail-upload")?.click();
  });

  document.querySelector("#product-main-delete")?.addEventListener("click", () => {
    revokeObjectUrl(pendingMainPreviewUrl);
    pendingMainPreviewUrl = "";
    pendingMainImageFile = null;
    mainImageRemoved = true;
    mainImagePublicIdValue = "";
    setMediaStatus("");
    updatePreview(getDisplayedMainImageUrl());
  });

  document.querySelector("#product-main-upload")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const validationMessage = validateImageFile(file);

    if (validationMessage) {
      console.error("[product-upload] Main image validation failed:", validationMessage);
      setMediaStatus(validationMessage, "error");
      event.target.value = "";
      return;
    }

    revokeObjectUrl(pendingMainPreviewUrl);
    pendingMainPreviewUrl = URL.createObjectURL(file);
    pendingMainImageFile = file;
    mainImageRemoved = false;
    mainImagePublicIdValue = "";
    setMediaStatus("Local preview ready. Save the product to upload the image.", "info");
    updatePreview(getDisplayedMainImageUrl());
    event.target.value = "";
  });

  document.querySelector("#product-detail-select-trigger")?.addEventListener("click", async () => {
    const assets = await openMediaPicker({
      title: "Select Gallery Images",
      usageType: "product_gallery",
      allowMultiple: true,
    });
    if (!assets || !assets.length) {
      return;
    }
    detailImageItems = [
      ...detailImageItems,
      ...assets.map((asset, index) => ({
        id: asset.id || `selected-${Date.now()}-${index + 1}`,
        kind: "existing",
        url: asset.url,
        publicId: asset.publicId || "",
      })),
    ];
    setMediaStatus("Selected existing Cloudinary assets.", "success");
    renderDetailPreview(detailImageItems);
  });

  document.querySelector("#product-detail-upload")?.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);

    if (!files.length) {
      return;
    }

    for (const file of files) {
      const validationMessage = validateImageFile(file);

      if (validationMessage) {
        console.error("[product-upload] Gallery image validation failed:", validationMessage);
        setMediaStatus(validationMessage, "error");
        event.target.value = "";
        return;
      }
    }

    detailImageItems = [...detailImageItems, ...files.map(createPendingGalleryItem)];
    setMediaStatus("Local previews ready. Save the product to upload gallery images.", "info");
    renderDetailPreview(detailImageItems);
    event.target.value = "";
  });

  detailPreview?.addEventListener("click", (event) => {
    const previewButton = event.target.closest("[data-gallery-preview]");
    if (previewButton) {
      const index = Number(previewButton.dataset.galleryPreview);
      const value = detailImageItems[index]?.url;
      if (value && mediaLightbox && mediaLightboxImage) {
        mediaLightboxImage.src = value;
        mediaLightbox.hidden = false;
      }
      return;
    }

    const uploadTile = event.target.closest("#product-detail-upload-tile");
    if (uploadTile) {
      document.querySelector("#product-detail-upload")?.click();
      return;
    }

    const button = event.target.closest("[data-gallery-delete]");

    if (!button) {
      return;
    }

    const index = Number(button.dataset.galleryDelete);

    if (!Number.isInteger(index)) {
      return;
    }

    const removed = detailImageItems[index];
    if (removed?.kind === "pending") {
      revokeObjectUrl(removed.url);
    }

    detailImageItems = detailImageItems.filter((_, itemIndex) => itemIndex !== index);
    renderDetailPreview(detailImageItems);
  });

  document.querySelector("#product-media-lightbox-close")?.addEventListener("click", () => {
    if (mediaLightbox) {
      mediaLightbox.hidden = true;
    }
  });

  mediaLightbox?.addEventListener("click", (event) => {
    if (event.target === mediaLightbox) {
      mediaLightbox.hidden = true;
    }
  });

  let draggingIndex = null;

  detailPreview?.addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-gallery-index]");

    if (!item) {
      return;
    }

    draggingIndex = Number(item.dataset.galleryIndex);
    item.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
  });

  detailPreview?.addEventListener("dragover", (event) => {
    const item = event.target.closest("[data-gallery-index]");

    if (!item) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });

  detailPreview?.addEventListener("drop", (event) => {
    const item = event.target.closest("[data-gallery-index]");

    if (!item || draggingIndex === null) {
      return;
    }

    event.preventDefault();
    const targetIndex = Number(item.dataset.galleryIndex);

    if (!Number.isInteger(targetIndex) || targetIndex === draggingIndex) {
      draggingIndex = null;
      renderDetailPreview(detailImageItems);
      return;
    }

    const nextValues = [...detailImageItems];
    const [moved] = nextValues.splice(draggingIndex, 1);
    nextValues.splice(targetIndex, 0, moved);
    detailImageItems = nextValues;
    draggingIndex = null;
    renderDetailPreview(detailImageItems);
  });

  detailPreview?.addEventListener("dragend", () => {
    draggingIndex = null;
    detailPreview.querySelectorAll(".admin-media-gallery-item").forEach((item) => {
      item.classList.remove("is-dragging");
    });
  });

  productEditorForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmittingProduct) {
      return;
    }

    setSubmittingState(true, "Uploading...");
    setMediaStatus("");

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const id = String(formData.get("id") || "").trim() || window.NorthstarStore.slugify(name);
    const specs = Object.fromEntries(
      Array.from(specList?.querySelectorAll(".admin-spec-row") || [])
        .map((row) => {
          const key = String(row.querySelector("[data-spec-key]")?.value || "").trim();
          const value = String(row.querySelector("[data-spec-value]")?.value || "").trim();
          return [key, value];
        })
        .filter(([key, value]) => key && value)
    );
    const monthlyProductionCapacity = formData.has("b2bMonthlyProductionCapacity")
      ? String(formData.get("b2bMonthlyProductionCapacity") || "").trim()
      : wholesaleCapacityValue;
    if (monthlyProductionCapacity) {
      specs[wholesaleCapacityKey] = monthlyProductionCapacity;
    } else if (formData.has("b2bMonthlyProductionCapacity")) {
      delete specs[wholesaleCapacityKey];
    }
    const depositValue = formData.get("b2bDepositValue") || 0;
    const paymentTerms = String(formData.get("b2bCustomPaymentTerms") || "").trim() || defaultPaymentTerms;
    const wholesalePriceTiers = Array.from(tierList?.querySelectorAll("[data-tier-row]") || [])
      .map((row, index) => ({
        id: String(row.querySelector("[data-tier-id]")?.value || `${id}-tier-${index + 1}`).trim(),
        minQuantity: String(row.querySelector("[data-tier-min]")?.value || "").trim(),
        maxQuantity: String(row.querySelector("[data-tier-max]")?.value || "").trim(),
        unitPrice: String(row.querySelector("[data-tier-price]")?.value || "").trim(),
      }))
      .filter((tier) => tier.minQuantity && tier.unitPrice);
    const retailStock = formData.has("b2cRetailStock")
      ? formData.get("b2cRetailStock") || 0
      : product.b2c?.retailStock ?? product.stock ?? 0;

    try {
      let finalMainImageUrl = mainImageRemoved ? "" : mainImageValue;
      let finalMainImagePublicId = mainImageRemoved ? "" : mainImagePublicIdValue;

      if (pendingMainImageFile) {
        const uploadedMainImage = await window.NorthstarStore.uploadMediaAsset(pendingMainImageFile, {
          usageType: "product_main",
          displayName: pendingMainImageFile.name,
        });
        finalMainImageUrl = uploadedMainImage.url;
        finalMainImagePublicId = uploadedMainImage.publicId || "";
      }

      const finalDetailImages = [];
      const pendingGalleryFiles = detailImageItems.filter((item) => item.kind === "pending").map((item) => item.file);
      let uploadedGalleryAssets = [];

      if (pendingGalleryFiles.length) {
        uploadedGalleryAssets = await window.NorthstarStore.uploadMediaAssets(pendingGalleryFiles, {
          usageType: "product_gallery",
        });
      }

      let uploadedGalleryIndex = 0;

      for (const item of detailImageItems) {
        if (item.kind === "existing") {
          finalDetailImages.push({
            url: item.url,
            publicId: item.publicId || "",
          });
          continue;
        }

        const uploadedGalleryImage = uploadedGalleryAssets[uploadedGalleryIndex];
        uploadedGalleryIndex += 1;

        if (!uploadedGalleryImage?.url) {
          throw new Error("One or more gallery images failed to upload.");
        }

        finalDetailImages.push({
          url: uploadedGalleryImage.url,
          publicId: uploadedGalleryImage.publicId || "",
        });
      }

      await window.NorthstarStore.upsertProduct({
        id,
        createdAt: formData.get("createdAt") || undefined,
        name,
        slug: formData.get("slug"),
        category: formData.get("category"),
        image: finalMainImageUrl,
        mainImagePublicId: finalMainImagePublicId,
        priceValue: formData.get("b2cRetailPrice") || product.priceValue || 0,
        moqValue: formData.get("b2bWholesaleMoq") || product.moqValue || 1,
        shippingDays: formData.get("shippingDays"),
        stock: retailStock,
        status: formData.get("status"),
        b2c: {
          enabled: Boolean(productEditorForm?.querySelector('input[name="b2cEnabled"]')?.checked),
          retailPrice: formData.get("b2cRetailPrice"),
          compareAtPrice: product.b2c?.compareAtPrice || 0,
          retailStock,
          minimumQuantity: product.b2c?.minimumQuantity ?? 1,
        },
        b2b: {
          enabled: Boolean(productEditorForm?.querySelector('input[name="b2bEnabled"]')?.checked),
          wholesaleMoq: formData.get("b2bWholesaleMoq") || 1,
          wholesaleLeadTime: formData.get("b2bWholesaleLeadTime") || 1,
          priceTiers: wholesalePriceTiers,
          depositTerms: paymentTerms,
          deposit: {
            required: Number(depositValue) > 0,
            type: "percentage",
            value: depositValue,
            balanceDueStage: product.b2b?.deposit?.balanceDueStage || "before-shipment",
            customPaymentTerms: paymentTerms,
            refundable: Boolean(product.b2b?.deposit?.refundable),
            notes: product.b2b?.deposit?.notes || "",
          },
        },
        description: formData.get("description"),
        detailDescription: formData.get("detailDescription"),
        seoTitle: formData.get("seoTitle"),
        metaDescription: formData.get("metaDescription"),
        tags: getChipValues("keywords"),
        keywords: getChipValues("keywords"),
        markets: getChipValues("markets"),
        functions: getChipValues("functions"),
        scenarios: getChipValues("scenarios"),
        specs,
        detailImages: finalDetailImages.map((item, index) => ({
          id: `${id}-detail-${index + 1}`,
          title: index === 0 ? "Product View" : `Detail ${index + 1}`,
          text: "Uploaded product visual",
          url: item.url,
          publicId: item.publicId || "",
        })),
      });

      if (pendingMainPreviewUrl) {
        revokeObjectUrl(pendingMainPreviewUrl);
      }
      detailImageItems.forEach((item) => {
        if (item.kind === "pending") {
          revokeObjectUrl(item.url);
        }
      });

      adminState.products.editingId = id;
      adminState.products.mode = "edit";
      await renderCurrentSection();
    } catch (error) {
      console.error("[product-upload] Save failed:", error);
      setMediaStatus(error?.message || "Image upload failed.", "error");
    } finally {
      setSubmittingState(false);
    }
  });

  document.querySelector("#product-delete-button")?.addEventListener("click", async () => {
    if (!adminState.products.editingId) {
      return;
    }

    if (!window.confirm("Delete this product?")) {
      return;
    }

    try {
      await window.NorthstarStore.deleteProduct(adminState.products.editingId);
      adminState.products.mode = "list";
      adminState.products.editingId = null;
      await renderCurrentSection();
    } catch (error) {
      console.error("[products] Delete failed:", error);
      setMediaStatus(error?.message || "Unable to delete product.", "error");
    }
  });
};

const renderProductsSection = async () => {
  if (adminState.products.mode === "edit") {
    await renderProductEditorSection();
    return;
  }

  await renderProductListSection();
};

const renderMediaSection = async () => {
  const loadMedia = async () =>
    window.NorthstarStore.listMedia({
      query: adminState.media.query,
      usageType: adminState.media.usageType,
      folder: adminState.media.folder,
    });

  let assets = [];
  let loadError = "";

  try {
    assets = await loadMedia();
  } catch (error) {
    loadError = error?.message || "Unable to load media.";
  }

  contentRoot.innerHTML = `
    <div class="admin-stack">
      <div class="admin-page-head">
        <div>
          <h2>Media Library</h2>
          <p>Upload to Cloudinary once, then reuse the same HTTPS assets across products and website content.</p>
        </div>
      </div>

      <section class="admin-panel">
        <div class="admin-library-toolbar">
          <label class="admin-search-field">
            Search
            <input class="admin-search-input" type="search" id="admin-media-search" value="${escapeHtml(
              adminState.media.query
            )}" placeholder="Filename, display name, or public ID">
          </label>
          <label>
            Usage Type
            <select id="admin-media-usage-filter">
              ${MEDIA_USAGE_OPTIONS.map(
                (option) =>
                  `<option value="${escapeHtml(option.value)}" ${
                    option.value === adminState.media.usageType ? "selected" : ""
                  }>${escapeHtml(option.label)}</option>`
              ).join("")}
            </select>
          </label>
          <label>
            Folder
            <select id="admin-media-folder-filter">
              ${MEDIA_FOLDER_OPTIONS.map(
                (option) =>
                  `<option value="${escapeHtml(option.value)}" ${
                    option.value === adminState.media.folder ? "selected" : ""
                  }>${escapeHtml(option.label)}</option>`
              ).join("")}
            </select>
          </label>
          <input class="admin-file-input-hidden" type="file" id="admin-media-upload-input" accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif" multiple>
          <div class="admin-actions-inline">
            <button class="admin-secondary-button" type="button" id="admin-media-upload-trigger">Upload from Computer</button>
          </div>
        </div>
        <div class="admin-library-dropzone" id="admin-media-dropzone">
          <strong>Drag and drop images here</strong>
          <p>JPG, JPEG, PNG, WEBP, or AVIF up to 10MB each.</p>
        </div>
        <p class="admin-media-status" id="admin-media-library-status" data-state="${loadError ? "error" : ""}">${
          loadError || ""
        }</p>
        <div class="admin-library-grid">
          ${
            loadError
              ? ""
              : assets.length
                ? assets
                    .map((asset) =>
                      createMediaAssetCardMarkup(asset, {
                        actions: [
                          { action: "copy", label: "Copy URL", className: "admin-ghost-button" },
                          { action: "delete", label: "Delete", className: "admin-secondary-button" },
                        ],
                      })
                    )
                    .join("")
                : renderEmptyState("No media yet", "Upload images here to reuse them across the storefront and CMS.")
          }
        </div>
      </section>
    </div>
  `;

  const statusNode = document.querySelector("#admin-media-library-status");
  const setStatus = (message = "", tone = "") => {
    if (!statusNode) {
      return;
    }
    statusNode.textContent = message;
    statusNode.dataset.state = tone;
  };

  const reload = async () => {
    await renderMediaSection();
  };

  const handleUpload = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) {
      return;
    }

    setStatus("Uploading media...", "info");
    try {
      await uploadAdminMediaFiles(list, adminState.media.usageType === "all" ? "misc" : adminState.media.usageType);
      setStatus("Media uploaded.", "success");
      await reload();
    } catch (error) {
      setStatus(error?.message || "Unable to upload media.", "error");
    }
  };

  document.querySelector("#admin-media-search")?.addEventListener("input", async (event) => {
    adminState.media.query = event.target.value || "";
    await reload();
  });

  document.querySelector("#admin-media-usage-filter")?.addEventListener("change", async (event) => {
    adminState.media.usageType = event.target.value || "all";
    await reload();
  });

  document.querySelector("#admin-media-folder-filter")?.addEventListener("change", async (event) => {
    adminState.media.folder = event.target.value || "all";
    await reload();
  });

  document.querySelector("#admin-media-upload-trigger")?.addEventListener("click", () => {
    document.querySelector("#admin-media-upload-input")?.click();
  });

  document.querySelector("#admin-media-upload-input")?.addEventListener("change", async (event) => {
    await handleUpload(event.target.files || []);
    event.target.value = "";
  });

  const dropzone = document.querySelector("#admin-media-dropzone");
  dropzone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  });
  dropzone?.addEventListener("dragleave", () => {
    dropzone.classList.remove("is-dragging");
  });
  dropzone?.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
    await handleUpload(event.dataTransfer?.files || []);
  });

  contentRoot.querySelectorAll("[data-media-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const assetId = button.dataset.mediaId || "";
      const asset = assets.find((item) => item.id === assetId);

      if (!asset) {
        return;
      }

      if (button.dataset.mediaAction === "copy") {
        try {
          await navigator.clipboard.writeText(asset.url || "");
          setStatus("Copied Cloudinary URL.", "success");
        } catch (error) {
          setStatus("Unable to copy URL.", "error");
        }
        return;
      }

      if (button.dataset.mediaAction === "delete") {
        if (!window.confirm("Delete this Cloudinary asset? Existing references may break.")) {
          return;
        }
        try {
          await window.NorthstarStore.deleteMedia(asset.publicId || asset.id);
          setStatus("Media asset deleted.", "success");
          await reload();
        } catch (error) {
          if (String(error?.message || "").includes("still referenced")) {
            if (!window.confirm("This asset is still referenced. Force delete anyway?")) {
              return;
            }
            await window.NorthstarStore.deleteMedia(asset.publicId || asset.id, { force: true });
            setStatus("Referenced asset deleted.", "warning");
            await reload();
            return;
          }
          setStatus(error?.message || "Unable to delete media.", "error");
        }
      }
    });
  });
};

const renderWebsiteSection = async () => {
  const website = await window.NorthstarStore.getWebsiteSettings();

  contentRoot.innerHTML = `
    <form class="admin-form-stack" id="website-form">
      <div class="admin-section-grid">
        <section class="admin-panel">
          <div class="admin-panel-header">
            <div>
              <h3>Brand</h3>
              <p>Logo, website name, browser title, and favicon.</p>
            </div>
          </div>
          <div class="admin-form-grid">
            <label>
              Website Name
              <input type="text" name="brandName" value="${escapeHtml(website.brand.name || "")}">
            </label>
            <label>
              Logo Top Line
              <input type="text" name="logoTop" value="${escapeHtml(website.brand.logoTop || "")}">
            </label>
            <label>
              Logo Bottom Line
              <input type="text" name="logoBottom" value="${escapeHtml(website.brand.logoBottom || "")}">
            </label>
            <label class="full">
              Brand Subtitle
              <input type="text" name="brandSubtitle" value="${escapeHtml(website.brand.subtitle || "")}">
            </label>
            <label class="full">
              Browser Title
              <input type="text" name="browserTitle" value="${escapeHtml(website.brand.browserTitle || "")}">
            </label>
            <label class="full">
              Logo Image URL
              <input type="text" id="website-logo-input" name="logoImage" value="${escapeHtml(
                website.brand.logoImage || ""
              )}">
            </label>
            <input type="hidden" id="website-logo-public-id" name="logoPublicId" value="${escapeHtml(
              website.brand.logoPublicId || ""
            )}">
            <div class="full admin-inline-media-field">
              <div class="admin-inline-media-preview" id="website-logo-preview">
                ${
                  website.brand.logoImage
                    ? `<img src="${escapeHtml(website.brand.logoImage)}" alt="Website logo preview">`
                    : `<div class="admin-image-preview placeholder">No logo uploaded</div>`
                }
              </div>
              <input type="file" id="website-logo-upload" accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif" class="admin-file-input-hidden">
              <div class="admin-media-button-row">
                <button class="admin-secondary-button" type="button" id="website-logo-upload-trigger">Upload New</button>
                <button class="admin-secondary-button" type="button" id="website-logo-select-trigger">Select Existing</button>
              </div>
            </div>
            <label class="full">
              Favicon URL
              <input type="text" id="website-favicon-input" name="favicon" value="${escapeHtml(
                website.brand.favicon || ""
              )}">
            </label>
            <input type="hidden" id="website-favicon-public-id" name="faviconPublicId" value="${escapeHtml(
              website.brand.faviconPublicId || ""
            )}">
            <div class="full admin-inline-media-field">
              <div class="admin-inline-media-preview" id="website-favicon-preview">
                ${
                  website.brand.favicon
                    ? `<img src="${escapeHtml(website.brand.favicon)}" alt="Favicon preview">`
                    : `<div class="admin-image-preview placeholder">No favicon uploaded</div>`
                }
              </div>
              <input type="file" id="website-favicon-upload" accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif" class="admin-file-input-hidden">
              <div class="admin-media-button-row">
                <button class="admin-secondary-button" type="button" id="website-favicon-upload-trigger">Upload New</button>
                <button class="admin-secondary-button" type="button" id="website-favicon-select-trigger">Select Existing</button>
              </div>
            </div>
          </div>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-header">
            <div>
              <h3>Homepage Hero</h3>
              <p>Text, banner, and background used on the homepage.</p>
            </div>
          </div>
          <div class="admin-form-grid">
            <label>
              Hero Eyebrow
              <input type="text" name="heroEyebrow" value="${escapeHtml(website.hero.eyebrow || "")}">
            </label>
            <label class="full">
              Hero Title
              <input type="text" name="heroTitle" value="${escapeHtml(website.hero.title || "")}">
            </label>
            <label class="full">
              Hero Subtitle
              <textarea name="heroSubtitle" rows="5">${escapeHtml(website.hero.subtitle || "")}</textarea>
            </label>
            <label class="full">
              Banner
              <input type="text" name="heroBanner" value="${escapeHtml(website.hero.banner || "")}">
            </label>
            <label class="full">
              Hero Background URL
              <input type="text" id="website-hero-input" name="heroBackgroundImage" value="${escapeHtml(
                website.hero.backgroundImage || ""
              )}">
            </label>
            <input type="hidden" id="website-hero-public-id" name="heroBackgroundImagePublicId" value="${escapeHtml(
              website.hero.backgroundImagePublicId || ""
            )}">
            <div class="full admin-inline-media-field">
              <div class="admin-inline-media-preview admin-inline-media-preview-hero" id="website-hero-preview">
                ${
                  website.hero.backgroundImage
                    ? `<img src="${escapeHtml(website.hero.backgroundImage)}" alt="Hero background preview">`
                    : `<div class="admin-image-preview placeholder">No hero background uploaded</div>`
                }
              </div>
              <input type="file" id="website-hero-upload" accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif" class="admin-file-input-hidden">
              <div class="admin-media-button-row">
                <button class="admin-secondary-button" type="button" id="website-hero-upload-trigger">Upload New</button>
                <button class="admin-secondary-button" type="button" id="website-hero-select-trigger">Select Existing</button>
              </div>
            </div>
          </div>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-header">
            <div>
              <h3>Footer and Contact</h3>
              <p>Contact info and footer copy only. No product fields here.</p>
            </div>
          </div>
          <div class="admin-form-grid">
            <label class="full">
              Footer Tagline
              <textarea name="footerTagline" rows="4">${escapeHtml(website.footer.tagline || "")}</textarea>
            </label>
            <label class="full">
              Copyright
              <input type="text" name="footerCopyright" value="${escapeHtml(website.footer.copyright || "")}">
            </label>
            <label>
              Contact Email
              <input type="email" name="contactEmail" value="${escapeHtml(website.contact.email || "")}">
            </label>
            <label>
              Contact Phone
              <input type="text" name="contactPhone" value="${escapeHtml(website.contact.phone || "")}">
            </label>
            <label class="full">
              Contact Address
              <textarea name="contactAddress" rows="4">${escapeHtml(website.contact.address || "")}</textarea>
            </label>
          </div>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-header">
            <div>
              <h3>Social and SEO</h3>
              <p>Public-facing social links and metadata.</p>
            </div>
          </div>
          <div class="admin-form-grid">
            <label>
              LinkedIn
              <input type="url" name="linkedin" value="${escapeHtml(website.social.linkedin || "")}">
            </label>
            <label>
              WhatsApp
              <input type="text" name="whatsapp" value="${escapeHtml(website.social.whatsapp || "")}">
            </label>
            <label>
              Instagram
              <input type="url" name="instagram" value="${escapeHtml(website.social.instagram || "")}">
            </label>
            <label>
              X
              <input type="url" name="x" value="${escapeHtml(website.social.x || "")}">
            </label>
            <label class="full">
              Meta Description
              <textarea name="metaDescription" rows="4">${escapeHtml(website.seo.metaDescription || "")}</textarea>
            </label>
            <label class="full">
              Meta Keywords
              <textarea name="metaKeywords" rows="4">${escapeHtml(website.seo.metaKeywords || "")}</textarea>
            </label>
          </div>
        </section>
      </div>

      <div class="admin-actions-inline">
        <button class="admin-primary-button" type="submit">Save Website</button>
      </div>
      <p class="admin-form-status" id="website-form-status"></p>
    </form>
  `;

  const statusNode = document.querySelector("#website-form-status");
  const setStatus = (message = "", tone = "") => {
    if (!statusNode) {
      return;
    }
    statusNode.textContent = message;
    statusNode.dataset.state = tone;
  };

  const setMediaFieldValue = (prefix, asset) => {
    const urlField = document.querySelector(`#website-${prefix}-input`);
    const publicIdField = document.querySelector(`#website-${prefix}-public-id`);
    const previewNode = document.querySelector(`#website-${prefix}-preview`);
    if (urlField) {
      urlField.value = asset?.url || "";
    }
    if (publicIdField) {
      publicIdField.value = asset?.publicId || "";
    }
    if (previewNode) {
      previewNode.innerHTML = asset?.url
        ? `<img src="${escapeHtml(asset.url)}" alt="${escapeHtml(prefix)} preview">`
        : `<div class="admin-image-preview placeholder">No ${escapeHtml(prefix)} uploaded</div>`;
    }
  };

  const bindCloudinaryUpload = (prefix, usageType, title) => {
    const uploadInput = document.querySelector(`#website-${prefix}-upload`);
    document.querySelector(`#website-${prefix}-upload-trigger`)?.addEventListener("click", () => {
      uploadInput?.click();
    });
    uploadInput?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      setStatus(`Uploading ${title.toLowerCase()}...`, "info");
      try {
        const asset = await window.NorthstarStore.uploadMediaAsset(file, {
          usageType,
          displayName: file.name,
        });
        setMediaFieldValue(prefix, asset);
        setStatus(`${title} uploaded to Cloudinary.`, "success");
      } catch (error) {
        setStatus(error?.message || `Unable to upload ${title.toLowerCase()}.`, "error");
      } finally {
        event.target.value = "";
      }
    });
    document.querySelector(`#website-${prefix}-select-trigger`)?.addEventListener("click", async () => {
      const asset = await openMediaPicker({
        title: `Select ${title}`,
        usageType,
      });
      if (!asset) {
        return;
      }
      setMediaFieldValue(prefix, asset);
      setStatus(`${title} selected from Media Library.`, "success");
    });
  };

  bindCloudinaryUpload("logo", "brand_logo", "Logo");
  bindCloudinaryUpload("favicon", "favicon", "Favicon");
  bindCloudinaryUpload("hero", "homepage_hero", "Hero image");

  document.querySelector("#website-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const submitButton = form.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
    }
    setStatus("Saving website configuration...", "saving");

    try {
      const logoImage = String(formData.get("logoImage") || "").trim();
      const favicon = String(formData.get("favicon") || "").trim();
      const heroBackgroundImage = String(formData.get("heroBackgroundImage") || "").trim();
      const validateCloudinarySetting = (value, label) => {
        if (!value) {
          return;
        }
        if (!value.startsWith(CLOUDINARY_URL_PREFIX)) {
          throw new Error(`${label} must be a Cloudinary HTTPS URL. Upload or select an asset from Media Library.`);
        }
      };

      validateCloudinarySetting(logoImage, "Logo image");
      validateCloudinarySetting(favicon, "Favicon");
      validateCloudinarySetting(heroBackgroundImage, "Hero background");

      const updated = await window.NorthstarStore.updateWebsiteSettings({
        brand: {
          name: formData.get("brandName"),
          logoTop: formData.get("logoTop"),
          logoBottom: formData.get("logoBottom"),
          subtitle: formData.get("brandSubtitle"),
          browserTitle: formData.get("browserTitle"),
          logoImage,
          logoPublicId: formData.get("logoPublicId"),
          favicon,
          faviconPublicId: formData.get("faviconPublicId"),
        },
        hero: {
          eyebrow: formData.get("heroEyebrow"),
          title: formData.get("heroTitle"),
          subtitle: formData.get("heroSubtitle"),
          banner: formData.get("heroBanner"),
          backgroundImage: heroBackgroundImage,
          backgroundImagePublicId: formData.get("heroBackgroundImagePublicId"),
        },
        footer: {
          tagline: formData.get("footerTagline"),
          copyright: formData.get("footerCopyright"),
        },
        contact: {
          email: formData.get("contactEmail"),
          phone: formData.get("contactPhone"),
          address: formData.get("contactAddress"),
        },
        social: {
          linkedin: formData.get("linkedin"),
          whatsapp: formData.get("whatsapp"),
          instagram: formData.get("instagram"),
          x: formData.get("x"),
        },
        seo: {
          metaDescription: formData.get("metaDescription"),
          metaKeywords: formData.get("metaKeywords"),
        },
      });

      applyBrand(updated);
      setStatus("Website configuration saved.", "success");
      await renderCurrentSection();
    } catch (error) {
      setStatus(error?.message || "Unable to save website configuration.", "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Save Website";
      }
    }
  });
};

const renderSettingsSection = async () => {
  const settings = await window.NorthstarStore.getSettings();

  contentRoot.innerHTML = `
    <form class="admin-form-stack" id="settings-form">
      <div class="admin-section-grid">
        <section class="admin-panel">
          <div class="admin-panel-header">
            <div>
              <h3>Administrator</h3>
              <p>Credentials and recovery email used for admin access.</p>
            </div>
          </div>
          <div class="admin-form-grid">
            <label>
              Admin Email
              <input type="email" name="adminEmail" value="${escapeHtml(settings.adminEmail || "")}" required>
            </label>
            <label>
              Password
              <input type="password" name="adminPassword" value="${escapeHtml(settings.adminPassword || "")}" required autocomplete="new-password">
            </label>
            <label class="full">
              Recovery Email
              <input type="email" name="recoveryEmail" value="${escapeHtml(settings.recoveryEmail || "")}">
            </label>
          </div>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-header">
            <div>
              <h3>Payments and Locale</h3>
              <p>Payment methods, language, and theme color.</p>
            </div>
          </div>
          <div class="admin-form-grid">
            <label class="full">
              Payment Methods
              <textarea name="paymentMethods" rows="5">${escapeHtml(
                toTextareaValue(settings.paymentMethods || [])
              )}</textarea>
            </label>
            <label>
              Website Language
              <input type="text" name="language" value="${escapeHtml(settings.language || "")}">
            </label>
            <label>
              Theme Color
              <input type="text" name="themeColor" value="${escapeHtml(settings.themeColor || "")}">
            </label>
          </div>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-header">
            <div>
              <h3>System Configuration</h3>
              <p>Free-form config notes for operations.</p>
            </div>
          </div>
          <label class="full">
            System Config
            <textarea name="systemConfig" rows="10">${escapeHtml(settings.systemConfig || "")}</textarea>
          </label>
        </section>
      </div>

      <div class="admin-actions-inline">
        <button class="admin-primary-button" type="submit">Save Settings</button>
      </div>
      <p class="admin-form-status" id="settings-form-status"></p>
    </form>
  `;

  document.querySelector("#settings-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const submitButton = form.querySelector('button[type="submit"]');
    const statusNode = document.querySelector("#settings-form-status");

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
    }
    if (statusNode) {
      statusNode.textContent = "Saving settings...";
      statusNode.dataset.state = "saving";
    }

    try {
      const updatedSettings = await window.NorthstarStore.updateSettings({
        adminEmail: formData.get("adminEmail"),
        adminPassword: formData.get("adminPassword"),
        recoveryEmail: formData.get("recoveryEmail"),
        paymentMethods: parseTextList(formData.get("paymentMethods")),
        language: formData.get("language"),
        themeColor: formData.get("themeColor"),
        systemConfig: formData.get("systemConfig"),
      });

      if (updatedSettings?.reauthRequired) {
        showLogin();
        return;
      }

      if (statusNode) {
        statusNode.textContent = "Settings saved.";
        statusNode.dataset.state = "success";
      }

      await renderCurrentSection();
    } catch (error) {
      if (statusNode) {
        statusNode.textContent = error?.message || "Unable to save settings.";
        statusNode.dataset.state = "error";
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Save Settings";
      }
    }
  });
};

const renderCurrentSection = async () => {
  const session = await window.NorthstarStore?.refreshAdminSession?.();

  if (!session?.email) {
    stopAdminSupportLiveSync();
    showLogin();
    return;
  }

  if (adminState.activeSection !== "customers") {
    stopAdminSupportLiveSync();
  }

  syncAdminRoute("replace");
  renderNav();
  updateTitle();
  renderLoading();

  if (adminState.activeSection === "dashboard") {
    await renderDashboardSection();
    return;
  }

  if (adminState.activeSection === "order") {
    await renderOrderDetailSection();
    return;
  }

  if (adminState.activeSection === "orders") {
    await renderOrdersSection();
    return;
  }

  if (adminState.activeSection === "payments") {
    await renderPaymentsSection();
    return;
  }

  if (adminState.activeSection === "customers") {
    await renderCustomersSection();
    return;
  }

  if (adminState.activeSection === "products") {
    await renderProductsSection();
    return;
  }

  if (adminState.activeSection === "media") {
    await renderMediaSection();
    return;
  }

  if (adminState.activeSection === "website") {
    await renderWebsiteSection();
    return;
  }

  await renderSettingsSection();
};

const boot = async () => {
  if (!window.NorthstarStore) {
    return;
  }

  await window.NorthstarStore.ready;
  hydrateAdminRouteFromLocation();
  applyTheme();
  applyBrand(await window.NorthstarStore.getWebsiteSettings());

  const session = await window.NorthstarStore.refreshAdminSession();

  if (session?.email) {
    showShell();
    await renderCurrentSection();
  } else {
    showLogin();
  }
};

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || adminState.activeSection !== "customers") {
    return;
  }

  reconcileCustomersSection();
  pollAdminConversationList();
});

window.addEventListener("online", () => {
  if (adminState.activeSection === "customers") {
    setAdminSupportLiveState("reconnecting");
    reconcileCustomersSection();
    pollAdminConversationList();
  }
});

window.addEventListener("offline", () => {
  if (adminState.activeSection === "customers") {
    setAdminSupportLiveState("offline");
  }
});

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!window.NorthstarStore) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const result = await window.NorthstarStore.loginAdmin(email, password);

  if (!result?.ok) {
    loginError.textContent = result?.message || "Invalid email or password.";
    return;
  }

  loginError.textContent = "";
  showShell();
  await renderCurrentSection();
});

navRoot?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-section]");

  if (!button) {
    return;
  }

  const nextSection = button.dataset.section;

  if (!nextSection || nextSection === adminState.activeSection) {
    return;
  }

  adminState.activeSection = nextSection;

  if (nextSection === "orders") {
    adminState.payments.orderFilterId = "";
  }

  if (nextSection !== "products") {
    adminState.products.mode = "list";
    adminState.products.editingId = null;
  }

  if (nextSection !== "payments") {
    adminState.payments.mode = "list";
    adminState.payments.selectedId = null;
    adminState.payments.orderFilterId = "";
  }

  syncAdminRoute("push");

  await renderCurrentSection();
});

themeToggle?.addEventListener("click", () => {
  adminState.theme = adminState.theme === "dark" ? "light" : "dark";
  applyTheme();
});

logoutButton?.addEventListener("click", async () => {
  await window.NorthstarStore?.logoutAdmin();
  showLogin();
});

window.addEventListener("storage", async (event) => {
  if (event.key && event.key !== STORAGE_KEY) {
    return;
  }

  if (await window.NorthstarStore?.refreshAdminSession?.()) {
    applyBrand(await window.NorthstarStore.getWebsiteSettings());
    await renderCurrentSection();
  }
});

window.addEventListener("northstar:store-updated", async () => {
  if (await window.NorthstarStore?.refreshAdminSession?.()) {
    applyBrand(await window.NorthstarStore.getWebsiteSettings());
    await renderCurrentSection();
  }
});

window.addEventListener("focus", async () => {
  if (!(await window.NorthstarStore?.refreshAdminSession?.())) {
    showLogin();
  }
});

window.addEventListener("popstate", async () => {
  hydrateAdminRouteFromLocation();
  if (await window.NorthstarStore?.refreshAdminSession?.()) {
    await renderCurrentSection();
  }
});

boot();
