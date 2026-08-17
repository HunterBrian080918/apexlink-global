const STORAGE_KEY = "northstar-platform-store-v1";

const NAV_GROUP_STORAGE_KEY = "avelix-admin-nav-groups-v1";
const navStructure = {
  standalone: [
    { id: "dashboard", label: "Dashboard", title: "Data Overview", icon: "dashboard" },
  ],
  groups: [
    {
      id: "commerce",
      label: "Commerce",
      icon: "commerce",
      items: [
        { id: "orders", label: "Orders", title: "Order Management", icon: "orders" },
        { id: "payments", label: "Payments", title: "Payment Records", icon: "payments" },
        { id: "products", label: "Products", title: "Product Catalog", icon: "products" },
      ],
    },
    {
      id: "customers-group",
      label: "Customers",
      icon: "customers",
      items: [
        { id: "customers", label: "Customer List", title: "Customer Records", icon: "customer-list" },
        { id: "support", label: "Support", title: "Customer Support", icon: "support" },
      ],
    },
    {
      id: "content",
      label: "Content",
      icon: "content",
      items: [
        { id: "media", label: "Media", title: "Media Library", icon: "media" },
        { id: "website-pages", label: "Website", title: "Website Pages", icon: "website" },
        { id: "seo", label: "SEO", title: "SEO Settings", icon: "seo" },
      ],
    },
    {
      id: "settings-group",
      label: "Settings",
      icon: "settings",
      items: [
        { id: "general-settings", label: "General Settings", title: "General Settings", icon: "general" },
        { id: "payment-settings", label: "Payment Settings", title: "Payment Settings", icon: "payment-settings" },
        { id: "shipping-settings", label: "Shipping Settings", title: "Shipping Settings", icon: "shipping" },
        { id: "account-settings", label: "Account Settings", title: "Account Settings", icon: "account" },
      ],
    },
  ],
  utility: [
    { id: "storefront", label: "View Store", title: "View Store", icon: "storefront", href: "/", external: true },
  ],
};
const navItems = [
  ...navStructure.standalone,
  ...navStructure.groups.flatMap((group) => group.items),
  ...(navStructure.utility || []),
];
const navItemRegistry = navItems.reduce((accumulator, item) => {
  accumulator[item.id] = item;
  return accumulator;
}, {});
const navItemToGroup = navStructure.groups.reduce((accumulator, group) => {
  group.items.forEach((item) => {
    accumulator[item.id] = group.id;
  });
  return accumulator;
}, {});
const loadNavGroupState = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(NAV_GROUP_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
};
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
  nav: {
    expandedGroups: loadNavGroupState(),
    drawerOpen: false,
  },
  settings: {
    bankTransferCurrency: "usd",
  },
  dashboard: {
    revenueRange: 7,
  },
  orders: {
    query: "",
    status: "all",
    mode: "all",
    orderStatus: "all",
    paymentStatus: "all",
    shippingStatus: "all",
    date: "",
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
    method: "all",
    paymentType: "all",
    currency: "all",
    date: "",
    orderFilterId: "",
  },
  customerList: {
    query: "",
    type: "all",
    country: "all",
    status: "all",
    selectedKey: null,
    mode: "list",
  },
  customers: {
    selectedId: null,
    query: "",
    status: "all",
    conversationType: "all",
    mobileView: "list",
    detailsOpen: false,
  },
  products: {
    mode: "list",
    editingId: null,
    editorTab: "basic",
    query: "",
    status: "all",
    selectedIds: [],
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
const CUSTOMER_STATUSES = ["new", "active", "waiting_customer", "waiting_admin", "vip", "wholesale", "retail", "resolved", "closed", "blocked"];
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
const shellToggle = document.querySelector("#admin-shell-toggle");
const sidebarBackdrop = document.querySelector("#admin-sidebar-backdrop");
const navRoot = document.querySelector("#admin-nav");
const contentRoot = document.querySelector("#admin-content");
const sectionLabel = document.querySelector("#admin-section-label");
const sectionTitle = document.querySelector("#admin-section-title");
const themeToggle = document.querySelector("#admin-theme-toggle");
const logoutButton = document.querySelector("#admin-logout-button");
const notificationButton = document.querySelector("#admin-notification-button");
const notificationBadge = document.querySelector("#admin-notification-badge");
const notificationPopover = document.querySelector("#admin-notification-popover");
const notificationList = document.querySelector("#admin-notification-list");
const markAllReadButton = document.querySelector("#admin-mark-all-read");
const globalSearchInput = document.querySelector("#admin-global-search-input");
const globalSearchResults = document.querySelector("#admin-search-results");
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

const notificationRuntime = { items: [], timer: null };
const NAV_ICONS = {
  dashboard:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"></rect><rect x="13.5" y="3.5" width="7" height="11" rx="2"></rect><rect x="3.5" y="13.5" width="7" height="7" rx="2"></rect><rect x="13.5" y="17.5" width="7" height="3" rx="1.5"></rect></svg>',
  commerce:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.5h16"></path><path d="M6 7.5l1.2 10.1a2 2 0 0 0 2 1.7h5.6a2 2 0 0 0 2-1.7L18 7.5"></path><path d="M9 11.5v4"></path><path d="M15 11.5v4"></path><path d="M8 7.5V6a4 4 0 0 1 8 0v1.5"></path></svg>',
  orders:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M8 9h8"></path><path d="M8 13h8"></path><path d="M8 17h5"></path></svg>',
  payments:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="6" width="17" height="12" rx="2.5"></rect><path d="M3.5 10.5h17"></path><path d="M8 15h2"></path></svg>',
  products:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.8 5 7.6v8.8l7 3.8 7-3.8V7.6l-7-3.8Z"></path><path d="M5.5 8 12 11.5 18.5 8"></path><path d="M12 11.5v8"></path></svg>',
  customers:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 19a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4"></path><circle cx="9.5" cy="8" r="3"></circle><path d="M17 11a3 3 0 1 0 0-6"></path><path d="M21 19a4 4 0 0 0-3-3.9"></path></svg>',
  "customer-list":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"></circle><path d="M3.5 19a4.5 4.5 0 0 1 9 0"></path><path d="M15 8h5"></path><path d="M15 12h5"></path><path d="M15 16h5"></path></svg>',
  support:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17.5h-.5A2.5 2.5 0 0 1 3 15V7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5V15a2.5 2.5 0 0 1-2.5 2.5H12l-4 3v-3Z"></path></svg>',
  content:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M8 9h8"></path><path d="M8 13h8"></path><path d="M8 17h4"></path></svg>',
  media:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2.5"></rect><circle cx="9" cy="10" r="1.5"></circle><path d="m20.5 16-4.7-4.7a1.5 1.5 0 0 0-2.1 0L8 17"></path></svg>',
  website:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"></rect><path d="M3.5 8.5h17"></path><path d="M8 4.5v15"></path></svg>',
  seo:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="5.5"></circle><path d="m15 15 5 5"></path><path d="M8.5 10.5h4"></path></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"></circle><path d="M19.2 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.8 1.8 0 1 1-3.6 0v-.1a1 1 0 0 0-.7-.9 1 1 0 0 0-1 .2l-.1.1a1.8 1.8 0 1 1-2.6-2.5l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.8 1.8 0 1 1 0-3.6h.1a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1l-.1-.1a1.8 1.8 0 1 1 2.5-2.6l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a1.8 1.8 0 1 1 3.6 0v.1a1 1 0 0 0 .7.9 1 1 0 0 0 1-.2l.1-.1a1.8 1.8 0 1 1 2.6 2.5l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6h.1a1.8 1.8 0 1 1 0 3.6h-.1a1 1 0 0 0-.9.7Z"></path></svg>',
  general:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5h16"></path><path d="M4 12h16"></path><path d="M4 17.5h10"></path></svg>',
  "payment-settings":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"></path><path d="M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 3 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3"></path></svg>',
  shipping:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7h11v8h-11Z"></path><path d="M14.5 10h3.5l2.5 2.8v2.2h-6"></path><circle cx="7.5" cy="17.5" r="1.8"></circle><circle cx="17.5" cy="17.5" r="1.8"></circle></svg>',
  account:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2"></circle><path d="M5 19a7 7 0 0 1 14 0"></path></svg>',
  storefront:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 5h5v5"></path><path d="M10 14 19 5"></path><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"></path></svg>',
};

const renderNotificationCenter = () => {
  const unread = notificationRuntime.items.filter((item) => !item.isRead).length;
  notificationBadge.textContent = unread > 99 ? "99+" : String(unread);
  notificationBadge.classList.toggle("is-hidden", unread === 0);
  notificationList.innerHTML = notificationRuntime.items.length
    ? notificationRuntime.items.map((item) => `<button type="button" class="admin-notification-item ${item.isRead ? "" : "is-unread"}" data-notification-id="${escapeHtml(item.id)}" data-entity-type="${escapeHtml(item.entityType)}" data-entity-id="${escapeHtml(item.entityId)}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p><time>${escapeHtml(formatDate(item.createdAt))}</time></button>`).join("")
    : '<div class="admin-empty-state"><h4>All caught up</h4><p>No notifications yet.</p></div>';
};

const refreshNotifications = async () => {
  try {
    const payload = await requestJson("/api/admin/notifications");
    notificationRuntime.items = Array.isArray(payload.notifications) ? payload.notifications : [];
    renderNotificationCenter();
  } catch (error) {
    console.error("[admin] notifications failed", error);
  }
};

const openAdminEntity = async (type, id) => {
  if (type === "conversation") { adminState.activeSection = "support"; adminState.customers.selectedId = id; }
  else if (type === "order") { adminState.activeSection = "order"; adminState.orders.selectedId = id; }
  else if (type === "payment") { adminState.activeSection = "payments"; adminState.payments.mode = "detail"; adminState.payments.selectedId = id; }
  else if (type === "product") { adminState.activeSection = "products"; adminState.products.mode = "edit"; adminState.products.editingId = id; }
  else return;
  await renderCurrentSection();
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

const fetchAdminDashboard = async () => {
  const payload = await requestJson("/api/admin/dashboard", {
    method: "GET",
  });
  return payload?.dashboard && typeof payload.dashboard === "object" ? payload.dashboard : null;
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

const reviewAdminBankTransferPayment = async (paymentId, status) =>
  requestJson(`/api/payments/${encodeURIComponent(paymentId)}/review-bank-transfer`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });

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
  adminState.activeSection === "support"
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
    <span class="admin-thread-avatar" aria-hidden="true">${escapeHtml(
      String(thread.customerName || thread.email || "C")
        .trim()
        .slice(0, 1)
        .toUpperCase()
    )}</span>
    <div class="admin-thread-main">
      <div class="admin-thread-topline">
        <strong>${escapeHtml(thread.customerName || "Website Visitor")}</strong>
        <small>${escapeHtml(formatConversationListTime(thread.lastMessageAt || thread.updatedAt))}</small>
      </div>
      <span class="admin-thread-email">${escapeHtml(thread.email || "No email")}</span>
      <p class="admin-thread-preview">${escapeHtml(getAdminConversationPreview(thread))}</p>
      <div class="admin-thread-bottomline">
        <span class="admin-pill ${getStatusClass(thread.status || "open")}">${escapeHtml(
          formatStatusLabel(thread.status || "open")
        )}</span>
        ${thread.adminUnreadCount ? `<span class="admin-unread-badge">${formatNumber(thread.adminUnreadCount)} unread</span>` : ""}
      </div>
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
const parseMoneyValue = (value) => Number(String(value || "").replace(/[^\d.-]/g, "") || 0);
const hasNonZeroAmount = (value) => Math.abs(parseMoneyValue(value)) > 0.0001;
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
const getAdminPillStatusClass = (status) => getStatusClass(normalizeStatusValue(status).replace(/_/g, "-"));
const formatPaymentStatusLabel = (status) =>
  String(status || "")
    .replace(/_/g, "-")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Pending";
const formatPaymentProviderLabel = (provider, method = "") => {
  const normalized = String(provider || "").trim().toLowerCase();
  if (!normalized) {
    return String(method || "").trim() || "-";
  }
  if (normalized === "paypal") {
    return "PayPal";
  }
  if (normalized === "bank_transfer") {
    return "Bank Transfer";
  }
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (part) => part.toUpperCase());
};
const formatPaymentMethodLabel = (method) => {
  const normalized = normalizePaymentMethodName(method);
  if (!normalized) {
    return "-";
  }
  if (normalized === "paypal") {
    return "PayPal";
  }
  if (normalized === "bank transfer") {
    return "Bank Transfer";
  }
  if (normalized === "cryptocurrency" || normalized === "crypto") {
    return "Cryptocurrency";
  }
  return String(method || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (part) => part.toUpperCase());
};
const formatSettlementChannelLabel = (channel) => {
  const normalized = normalizeStatusValue(channel);
  if (!normalized) {
    return "-";
  }
  if (normalized === "worldfirst" || normalized === "paypal") {
    return "WorldFirst";
  }
  if (normalized === "crypto_provider") {
    return "Crypto Provider";
  }
  return String(channel || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (part) => part.toUpperCase());
};
const STATUS_LABEL_CONFIG = {
  unprocessed: "Unprocessed",
  processed: "Processed",
  pending_payment: "Pending Payment",
  awaiting_payment: "Awaiting Payment",
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
  payment_submitted: "Payment Submitted",
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
const formatProductStatusLabel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "active") {
    return "Published";
  }
  return formatStatusLabel(normalized);
};
const INTERNAL_ORDER_STATUSES = ["unprocessed", "processed"];
const RETAIL_ORDER_STATUSES = [
  "pending_payment",
  "awaiting_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
];
const WHOLESALE_ORDER_STATUSES = [
  "inquiry_received",
  "quote_pending",
  "awaiting_confirmation",
  "awaiting_deposit",
  "deposit_paid",
  "in_production",
  "quality_inspection",
  "awaiting_balance",
  "balance_paid",
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
  "awaiting_payment",
  "payment_submitted",
  "deposit_paid",
  "partially_paid",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
  "cancelled",
];
const SHIPPING_STATUSES = ["not_started", "preparing", "packed", "shipped", "in_transit", "delivered", "exception"];
const ADMIN_PAYMENT_METHOD_OPTIONS = [
  {
    id: "paypal",
    label: "PayPal",
    description: "Accept payments through PayPal Checkout and settle through WorldFirst",
  },
  {
    id: "bank-transfer",
    label: "Bank Transfer",
    description: "Receive SWIFT international wire payments through WorldFirst",
  },
  {
    id: "wise",
    label: "Wise",
    description: "Accept Wise payments",
  },
  {
    id: "credit-card",
    label: "Credit Card",
    description: "Future card payment integration",
  },
  {
    id: "cryptocurrency",
    label: "Cryptocurrency",
    description: "Connect a crypto payment provider to enable USDT / USDC settlement",
  },
];
const isBankTransferPaymentRecord = (payment) =>
  String(payment?.paymentProvider || "").trim().toLowerCase() === "bank_transfer" ||
  String(payment?.paymentMethod || "").trim().toLowerCase() === "bank transfer";
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
const isAdminSupportCompactViewport = () => window.matchMedia("(max-width: 999px)").matches;
const isAdminSidebarDrawerViewport = () => window.matchMedia("(max-width: 959px)").matches;
const normalizeStatusValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

const normalizePaymentMethodName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

const SUPPORTED_ADMIN_PAYMENT_METHODS = new Set(
  ["PayPal", "Bank Transfer"].map((method) => normalizePaymentMethodName(method))
);

const getEnabledPaymentMethods = (methods) => {
  const seen = new Set();
  return (Array.isArray(methods) ? methods : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const normalized = normalizePaymentMethodName(item);
      if (!normalized || seen.has(normalized) || !SUPPORTED_ADMIN_PAYMENT_METHODS.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
};

const renderNavIcon = (icon) => NAV_ICONS[icon] || NAV_ICONS.dashboard;

const normalizeCurrencyCode = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return ["usd", "hkd"].includes(normalized) ? normalized : "usd";
};

const BANK_TRANSFER_ACCOUNT_FIELDS = {
  usd: [
    { name: "usdEnabled", prop: "enabled", label: "Enabled", type: "checkbox", full: true },
    { name: "usdBeneficiaryName", prop: "beneficiaryName", label: "Beneficiary Name" },
    { name: "usdBankName", prop: "bankName", label: "Bank Name" },
    { name: "usdAccountNumber", prop: "accountNumber", label: "Account Number" },
    { name: "usdSwiftBic", prop: "swiftBic", label: "SWIFT / BIC" },
    { name: "usdBankAddress", prop: "bankAddress", label: "Bank Address", full: true },
    { name: "usdBeneficiaryAddress", prop: "beneficiaryAddress", label: "Beneficiary Address", full: true },
    { name: "usdIntermediaryBank", prop: "intermediaryBank", label: "Intermediary Bank", full: true },
    { name: "usdIntermediarySwiftBic", prop: "intermediarySwiftBic", label: "Intermediary SWIFT / BIC", full: true },
    { name: "usdInstructions", prop: "instructions", label: "Instructions", type: "textarea", full: true },
  ],
  hkd: [
    { name: "hkdEnabled", prop: "enabled", label: "Enabled", type: "checkbox", full: true },
    { name: "hkdBeneficiaryName", prop: "beneficiaryName", label: "Beneficiary Name" },
    { name: "hkdBankName", prop: "bankName", label: "Bank Name" },
    { name: "hkdAccountNumber", prop: "accountNumber", label: "Account Number" },
    { name: "hkdSwiftBic", prop: "swiftBic", label: "SWIFT / BIC" },
    { name: "hkdBankAddress", prop: "bankAddress", label: "Bank Address", full: true },
    { name: "hkdBeneficiaryAddress", prop: "beneficiaryAddress", label: "Beneficiary Address", full: true },
    { name: "hkdIntermediaryBank", prop: "intermediaryBank", label: "Intermediary Bank", full: true },
    { name: "hkdIntermediarySwiftBic", prop: "intermediarySwiftBic", label: "Intermediary SWIFT / BIC", full: true },
    { name: "hkdInstructions", prop: "instructions", label: "Instructions", type: "textarea", full: true },
  ],
};

const SETTINGS_SECTIONS = {
  "general-settings": {
    label: "General",
    title: "General Settings",
    description: "Manage language, visual theme, and shared operational defaults.",
    submitLabel: "Save General Settings",
  },
  "payment-settings": {
    label: "Payments",
    title: "Payment Settings",
    description: "Manage checkout methods and receiving accounts.",
    submitLabel: "Save Changes",
  },
  "shipping-settings": {
    label: "Shipping",
    title: "Shipping Settings",
    description: "Review shipping operations and the fields that appear across order workflows.",
    submitLabel: "",
  },
  "account-settings": {
    label: "Account",
    title: "Account Settings",
    description: "Maintain administrator credentials and recovery access.",
    submitLabel: "Save Account Settings",
  },
};

const isBankTransferCurrencyConfigured = (currencyKey, details) => {
  const normalizedCurrency = normalizeCurrencyCode(currencyKey);
  const config = details && typeof details === "object" ? details : {};
  const requiredFields = BANK_TRANSFER_ACCOUNT_FIELDS[normalizedCurrency] || [];
  return Boolean(config.enabled) && requiredFields.every((field) => {
    if (field.prop === "enabled") {
      return true;
    }
    return String(config[field.prop] || "").trim();
  });
};

const getBankTransferCurrencyState = (bankTransferSettings = {}) => {
  const currencies = ["usd", "hkd"];
  return currencies.map((currencyKey) => {
    const details = bankTransferSettings[currencyKey] && typeof bankTransferSettings[currencyKey] === "object"
      ? bankTransferSettings[currencyKey]
      : {};
    return {
      key: currencyKey,
      label: currencyKey.toUpperCase(),
      configured: isBankTransferCurrencyConfigured(currencyKey, details),
      details,
    };
  });
};

const getPaymentSettingsMethodState = (method, enabledPaymentKeys, bankTransferSettings) => {
  const normalizedMethod = normalizePaymentMethodName(method.label);
  const isEnabled = enabledPaymentKeys.has(normalizedMethod);

  if (method.id === "paypal") {
    const paypalCurrencies = Array.isArray(bankTransferSettings?.__paypalCurrencies)
      ? bankTransferSettings.__paypalCurrencies
      : ["USD"];
    return {
      enabled: isEnabled,
      status: isEnabled ? `Configured (${paypalCurrencies.join(", ")})` : "Not configured",
      note: method.description,
      disabled: false,
    };
  }

  if (method.id === "bank-transfer") {
    const configuredCurrencies = getBankTransferCurrencyState(bankTransferSettings).filter((currency) => currency.configured);
    return {
      enabled: isEnabled,
      status: configuredCurrencies.length ? "Configured" : "Incomplete",
      note: method.description,
      disabled: false,
    };
  }

  return {
    enabled: false,
    status: "Coming soon",
    note: "This provider is not connected to checkout yet.",
    disabled: true,
  };
};

const buildPaymentSettingsDraft = (formData, bankTransferSettings = {}) => {
  const selectedPaymentMethods = getEnabledPaymentMethods(formData.getAll("paymentMethods"));
  const selectedPayPalCurrencies = Array.from(
    new Set(
      formData
        .getAll("paypalCurrencies")
        .map((currency) => String(currency || "").trim().toUpperCase())
        .filter((currency) => ["USD", "HKD"].includes(currency))
    )
  );

  return {
    paymentMethods: selectedPaymentMethods,
    paymentMethodCurrencies: {
      paypal: selectedPayPalCurrencies.length ? selectedPayPalCurrencies : ["USD"],
    },
    bankTransferSettings: {
      providerName: String(bankTransferSettings.providerName || "WorldFirst").trim(),
      settlementChannel: String(bankTransferSettings.settlementChannel || bankTransferSettings.providerName || "WorldFirst").trim(),
      usd: {
        enabled: formData.has("usdEnabled"),
        beneficiaryName: formData.get("usdBeneficiaryName") ?? bankTransferSettings?.usd?.beneficiaryName ?? bankTransferSettings?.usd?.accountName ?? "",
        bankName: formData.get("usdBankName") ?? bankTransferSettings?.usd?.bankName ?? "",
        accountNumber: formData.get("usdAccountNumber") ?? bankTransferSettings?.usd?.accountNumber ?? "",
        swiftBic: formData.get("usdSwiftBic") ?? bankTransferSettings?.usd?.swiftBic ?? bankTransferSettings?.usd?.swiftCode ?? "",
        bankAddress: formData.get("usdBankAddress") ?? bankTransferSettings?.usd?.bankAddress ?? "",
        beneficiaryAddress: formData.get("usdBeneficiaryAddress") ?? bankTransferSettings?.usd?.beneficiaryAddress ?? "",
        intermediaryBank: formData.get("usdIntermediaryBank") ?? bankTransferSettings?.usd?.intermediaryBank ?? "",
        intermediarySwiftBic: formData.get("usdIntermediarySwiftBic") ?? bankTransferSettings?.usd?.intermediarySwiftBic ?? "",
        instructions: formData.get("usdInstructions") ?? bankTransferSettings?.usd?.instructions ?? "",
      },
      hkd: {
        enabled: formData.has("hkdEnabled"),
        beneficiaryName: formData.get("hkdBeneficiaryName") ?? bankTransferSettings?.hkd?.beneficiaryName ?? "",
        bankName: formData.get("hkdBankName") ?? bankTransferSettings?.hkd?.bankName ?? "",
        accountNumber: formData.get("hkdAccountNumber") ?? bankTransferSettings?.hkd?.accountNumber ?? "",
        swiftBic: formData.get("hkdSwiftBic") ?? bankTransferSettings?.hkd?.swiftBic ?? "",
        bankAddress: formData.get("hkdBankAddress") ?? bankTransferSettings?.hkd?.bankAddress ?? "",
        beneficiaryAddress: formData.get("hkdBeneficiaryAddress") ?? bankTransferSettings?.hkd?.beneficiaryAddress ?? "",
        intermediaryBank: formData.get("hkdIntermediaryBank") ?? bankTransferSettings?.hkd?.intermediaryBank ?? "",
        intermediarySwiftBic: formData.get("hkdIntermediarySwiftBic") ?? bankTransferSettings?.hkd?.intermediarySwiftBic ?? "",
        instructions: formData.get("hkdInstructions") ?? bankTransferSettings?.hkd?.instructions ?? "",
      },
    },
  };
};

const setAdminSidebarOpen = (open) => {
  adminState.nav.drawerOpen = Boolean(open);
  shell?.classList.toggle("is-sidebar-open", adminState.nav.drawerOpen);
  document.body.classList.toggle("admin-sidebar-open", adminState.nav.drawerOpen);
  shellToggle?.setAttribute("aria-expanded", String(adminState.nav.drawerOpen));
};

const persistNavGroupState = () => {
  localStorage.setItem(NAV_GROUP_STORAGE_KEY, JSON.stringify(adminState.nav.expandedGroups || {}));
};

const getSectionRenderTarget = (section) => {
  const normalized = String(section || "").trim().toLowerCase();
  if (normalized === "order") {
    return "order";
  }
  if (["website-pages", "website"].includes(normalized)) {
    return "website";
  }
  if (["general-settings", "payment-settings", "shipping-settings", "account-settings", "settings"].includes(normalized)) {
    return "settings";
  }
  return normalized;
};

const isNavGroupExpanded = (groupId, activeSection = getAdminActiveNavSection()) => {
  if (Object.prototype.hasOwnProperty.call(adminState.nav.expandedGroups || {}, groupId)) {
    return Boolean(adminState.nav.expandedGroups[groupId]) || navItemToGroup[activeSection] === groupId;
  }

  return navItemToGroup[activeSection] === groupId;
};

const setNavGroupExpanded = (groupId, isExpanded) => {
  adminState.nav.expandedGroups = {
    ...(adminState.nav.expandedGroups || {}),
    [groupId]: Boolean(isExpanded),
  };
  persistNavGroupState();
};

const normalizeAdminSection = (value) => {
  const nextSection = String(value || "").trim().toLowerCase();
  if (nextSection === "order") {
    return "order";
  }
  if (nextSection === "website") {
    return "website-pages";
  }
  if (nextSection === "settings") {
    return "general-settings";
  }
  return navItems.some((item) => item.id === nextSection && !item.href && !item.future) ? nextSection : "dashboard";
};

const getAdminActiveNavSection = () => {
  if (adminState.activeSection === "order") {
    return "orders";
  }
  if (adminState.activeSection === "website") {
    return "website-pages";
  }
  if (adminState.activeSection === "settings") {
    return "general-settings";
  }
  return adminState.activeSection;
};

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

  if (adminState.activeSection === "customers" && params.get("id")) {
    adminState.activeSection = "support";
    adminState.customers.selectedId = String(params.get("id") || "").trim() || null;
  } else if (adminState.activeSection === "support") {
    adminState.customers.selectedId = String(params.get("id") || params.get("conversationId") || "").trim() || null;
  }

  if (adminState.activeSection === "orders" || adminState.activeSection === "order") {
    adminState.orders.selectedId =
      String(params.get("id") || params.get("orderId") || "").trim() || null;
  }

  if (adminState.activeSection === "payments") {
    adminState.payments.orderFilterId = String(params.get("orderId") || "").trim();
    adminState.payments.selectedId = String(params.get("paymentId") || "").trim() || null;
    adminState.payments.mode = adminState.payments.selectedId ? "detail" : "list";
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

  if (adminState.activeSection === "support" && adminState.customers.selectedId) {
    params.set("id", adminState.customers.selectedId);
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

const matchesAdminDateFilter = (value, expectedDate) => {
  const normalizedDate = String(expectedDate || "").trim();
  return !normalizedDate || String(value || "").slice(0, 10) === normalizedDate;
};

const getAdminOrderItemCount = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length) {
    return items.reduce((total, item) => total + Math.max(0, Number(item?.quantity || 0)), 0);
  }
  return Math.max(0, Number(order?.quantity || 0));
};

const isPaidPaymentRecord = (payment) =>
  ["paid", "confirmed", "deposit_paid"].includes(normalizeStatusValue(payment?.status));

const getAdminOrderPaymentSummary = (order, payments) => {
  const records = Array.isArray(payments) ? payments : [];
  const paidAmount = records
    .filter(isPaidPaymentRecord)
    .reduce((total, payment) => total + Number(payment?.amount || 0), 0);
  const totalAmount = parseMoneyValue(order?.totalAmount || order?.subtotal || 0);
  const methods = Array.from(
    new Set(records.map((payment) => formatPaymentMethodLabel(payment?.paymentMethod)).filter((method) => method && method !== "-"))
  );

  return {
    paidAmount,
    balanceDue: Math.max(0, totalAmount - paidAmount),
    methods,
    pendingBankTransfer: records.some(
      (payment) => isBankTransferPaymentRecord(payment) && ["pending", "unpaid", "payment_submitted"].includes(normalizeStatusValue(payment.status))
    ),
  };
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

const isWorldFirstSettlementPayment = (payment) =>
  normalizeStatusValue(payment?.settlementChannel || "") === "worldfirst";

const buildWorldFirstProofText = (order, payment) => {
  const firstItem = Array.isArray(order?.items) ? order.items[0] || null : null;
  const totalText = String(order?.totalAmount || order?.subtotal || "-").trim() || "-";
  const discountText = hasNonZeroAmount(order?.discountAmount) ? String(order.discountAmount || "-").trim() : "Not available";
  const paymentAmountText = payment ? formatMoney(payment.amount, payment.currency || order?.currency || "USD") : "Not available";
  const paymentStageLabel = payment ? formatPaymentTypeLabel(payment.paymentType) : "Not available";
  const paidDate = payment?.paidAt ? formatDate(payment.paidAt) : "Not available";
  const paymentReference =
    String(payment?.transactionId || payment?.providerReference || payment?.paymentId || payment?.id || "").trim() ||
    "Not available";
  const trackingNumber =
    String(order?.trackingNumber || order?.trackingNo || "").trim() || "Not available";
  const carrier = String(order?.shippingCarrier || order?.carrier || "").trim() || "Not available";
  const shippingStatus = String(order?.shippingStatusLabel || formatStatusLabel(order?.shippingStatus) || "").trim() || "Not available";
  const paymentMethodLabel = formatPaymentMethodLabel(payment?.paymentMethod);
  const settlementChannelLabel = formatSettlementChannelLabel(payment?.settlementChannel || "WorldFirst");
  const paymentInformationLines = [
    `Payment Stage: ${paymentStageLabel}`,
    `Payment Method: ${paymentMethodLabel}`,
    ...(isBankTransferPaymentRecord(payment) ? ["Transfer Type: SWIFT"] : []),
    `Settlement Channel: ${settlementChannelLabel}`,
    `Payment Amount: ${paymentAmountText}`,
    `Payment Status: ${formatPaymentStatusLabel(payment?.status || "pending")}`,
    `Paid Date: ${paidDate}`,
    `Payment Reference: ${paymentReference}`,
  ];

  return [
    "AVELIXLINK",
    "WORLD FIRST TRANSACTION PROOF",
    "",
    "Order Information",
    `Order Number: ${order?.orderNumber || order?.orderId || order?.id || "Not available"}`,
    `Order Type: ${formatStatusLabel(order?.purchaseMode || "retail")}`,
    `Order Date: ${order?.createdAt ? formatDate(order.createdAt) : "Not available"}`,
    "",
    "Buyer Information",
    `Buyer Name: ${order?.customerName || "Not available"}`,
    `Buyer Email: ${order?.email || "Not available"}`,
    `Country/Region: ${order?.country || "Not available"}`,
    `Shipping Address: ${order?.shippingAddress || "Not available"}`,
    "",
    "Transaction Details",
    `Product: ${firstItem?.productName || order?.productName || "Not available"}`,
    `SKU: ${firstItem?.sku || "Not available"}`,
    `Quantity: ${firstItem?.quantity || order?.quantity || "Not available"}`,
    `Unit Price: ${firstItem?.unitPrice || order?.unitPrice || "Not available"}`,
    `Subtotal: ${order?.subtotal || "Not available"}`,
    `Discount: ${discountText}`,
    `Order Total: ${totalText}`,
    `Currency: ${order?.currency || payment?.currency || "Not available"}`,
    "",
    "WorldFirst Payment Information",
    ...paymentInformationLines,
    "",
    "Fulfillment Information",
    `Shipping Status: ${shippingStatus}`,
    `Carrier: ${carrier}`,
    `Tracking Number: ${trackingNumber}`,
    "",
    "Transaction Statement",
    "This document confirms that the WorldFirst payment referenced above corresponds to the genuine AvelixLink order described above.",
    "The order and payment information in this document is generated from the corresponding AvelixLink order and payment records.",
    "",
    `Generated At: ${formatDate(new Date().toISOString())}`,
  ].join("\n");
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
  const standaloneMarkup = navStructure.standalone
    .map(
      (item) =>         `
        <button
          type="button"
          class="admin-nav-button admin-nav-item ${activeNavSection === item.id ? "is-active" : ""}"
          data-section="${item.id}"
          title="${escapeHtml(item.label)}"
        >
          <span class="admin-nav-icon" aria-hidden="true">${escapeHtml(item.icon || "•")}</span>
          <span class="admin-nav-text">${escapeHtml(item.label)}</span>
        </button>
      `
    )
    .join("");

  const groupMarkup = navStructure.groups
    .map((group) => {
      const expanded = isNavGroupExpanded(group.id, activeNavSection);
      const hasActiveItem = group.items.some((item) => item.id === activeNavSection);

      return `
        <section class="admin-nav-group ${expanded ? "is-expanded" : ""} ${hasActiveItem ? "is-active-group" : ""}" data-group="${group.id}">
          <button
            type="button"
            class="admin-nav-group-toggle"
            data-nav-group-toggle="${group.id}"
            aria-expanded="${expanded ? "true" : "false"}"
            title="${escapeHtml(group.label)}"
          >
            <span class="admin-nav-group-main">
              <span class="admin-nav-icon" aria-hidden="true">${escapeHtml(group.icon || "•")}</span>
              <span class="admin-nav-text">${escapeHtml(group.label)}</span>
            </span>
            <span class="admin-nav-chevron" aria-hidden="true">⌄</span>
          </button>
          <div class="admin-nav-group-items">
            ${group.items
              .map((item) => {
                if (item.future) {
                  return `
                    <span
                      class="admin-nav-button admin-nav-item admin-nav-item-child is-future"
                      title="${escapeHtml(`${item.label} (Future)`)}"
                    >
                      <span class="admin-nav-icon" aria-hidden="true">${escapeHtml(item.icon || "•")}</span>
                      <span class="admin-nav-text">${escapeHtml(item.label)}</span>
                    </span>
                  `;
                }

                if (item.href) {
                  return `
                    <a
                      class="admin-nav-button admin-nav-link admin-nav-item admin-nav-item-child"
                      href="${escapeHtml(item.href)}"
                      ${item.external ? 'target="_blank" rel="noreferrer"' : ""}
                      title="${escapeHtml(item.label)}"
                    >
                      <span class="admin-nav-icon" aria-hidden="true">${escapeHtml(item.icon || "•")}</span>
                      <span class="admin-nav-text">${escapeHtml(item.label)}</span>
                    </a>
                  `;
                }

                return `
                  <button
                    type="button"
                    class="admin-nav-button admin-nav-item admin-nav-item-child ${activeNavSection === item.id ? "is-active" : ""}"
                    data-section="${item.id}"
                    title="${escapeHtml(item.label)}"
                  >
                    <span class="admin-nav-icon" aria-hidden="true">${escapeHtml(item.icon || "•")}</span>
                    <span class="admin-nav-text">${escapeHtml(item.label)}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");

  navRoot.innerHTML = `${standaloneMarkup}${groupMarkup}`;
};

const renderAdminNavV4 = () => {
  const activeNavSection = getAdminActiveNavSection();
  const standaloneMarkup = navStructure.standalone
    .map(
      (item) => `
        <button
          type="button"
          class="admin-nav-button admin-nav-item ${activeNavSection === item.id ? "is-active" : ""}"
          data-section="${item.id}"
          title="${escapeHtml(item.label)}"
        >
          <span class="admin-nav-icon" aria-hidden="true">${renderNavIcon(item.icon)}</span>
          <span class="admin-nav-text">${escapeHtml(item.label)}</span>
        </button>
      `
    )
    .join("");

  const groupMarkup = navStructure.groups
    .map((group) => {
      const expanded = isNavGroupExpanded(group.id, activeNavSection);
      const hasActiveItem = group.items.some((item) => item.id === activeNavSection);

      return `
        <section class="admin-nav-group ${expanded ? "is-expanded" : ""} ${hasActiveItem ? "is-active-group" : ""}" data-group="${group.id}">
          <button
            type="button"
            class="admin-nav-group-toggle"
            data-nav-group-toggle="${group.id}"
            aria-expanded="${expanded ? "true" : "false"}"
          >
            <span class="admin-nav-group-label">${escapeHtml(group.label)}</span>
            <span class="admin-nav-chevron" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="m6 8 4 4 4-4"></path>
              </svg>
            </span>
          </button>
          <div class="admin-nav-group-items">
            ${group.items
              .map(
                (item) => `
                  <button
                    type="button"
                    class="admin-nav-button admin-nav-item admin-nav-item-child ${activeNavSection === item.id ? "is-active" : ""}"
                    data-section="${item.id}"
                    title="${escapeHtml(item.label)}"
                  >
                    <span class="admin-nav-icon" aria-hidden="true">${renderNavIcon(item.icon)}</span>
                    <span class="admin-nav-text">${escapeHtml(item.label)}</span>
                  </button>
                `
              )
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");

  const utilityMarkup = (navStructure.utility || [])
    .map(
      (item) => `
        <a
          class="admin-nav-button admin-nav-link admin-nav-item admin-nav-item-utility"
          href="${escapeHtml(item.href || "/")}"
          ${item.external ? 'target="_blank" rel="noreferrer"' : ""}
          title="${escapeHtml(item.label)}"
        >
          <span class="admin-nav-icon" aria-hidden="true">${renderNavIcon(item.icon)}</span>
          <span class="admin-nav-text">${escapeHtml(item.label)}</span>
        </a>
      `
    )
    .join("");

  navRoot.innerHTML = `
    <div class="admin-nav-primary">
      ${standaloneMarkup}
      ${groupMarkup}
    </div>
    <div class="admin-nav-secondary">
      <div class="admin-nav-separator" aria-hidden="true"></div>
      ${utilityMarkup}
    </div>
  `;
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
  const current = navItemRegistry[getAdminActiveNavSection()] || navStructure.standalone[0];
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
      : rawLogoImage === "assets/brand/avelixlink-mark.png"
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
  setAdminSidebarOpen(false);
  shell?.classList.add("is-hidden");
  loginShell?.classList.remove("is-hidden");
};

const showShell = () => {
  setAdminSidebarOpen(false);
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

const getChartLegendPoints = (points, maxItems = 6) => {
  const items = Array.isArray(points) ? points : [];
  if (items.length <= maxItems) {
    return items;
  }

  const selected = [];
  const step = Math.max(1, Math.floor((items.length - 1) / Math.max(maxItems - 1, 1)));
  for (let index = 0; index < items.length; index += step) {
    selected.push(items[index]);
    if (selected.length === maxItems - 1) {
      break;
    }
  }
  selected.push(items[items.length - 1]);
  return selected;
};

const getChartTickValues = (maxValue, tickCount = 4) => {
  const safeMax = Math.max(Number(maxValue || 0), 1);
  return Array.from({ length: tickCount + 1 }, (_, index) => (safeMax / tickCount) * (tickCount - index));
};

const getChartAxisIndices = (length, maxItems = 6) => {
  if (length <= maxItems) {
    return Array.from({ length }, (_, index) => index);
  }

  const selected = [];
  const step = Math.max(1, Math.floor((length - 1) / Math.max(maxItems - 1, 1)));
  for (let index = 0; index < length; index += step) {
    selected.push(index);
    if (selected.length === maxItems - 1) {
      break;
    }
  }
  if (selected[selected.length - 1] !== length - 1) {
    selected.push(length - 1);
  }
  return selected;
};

const formatChartMoneyTick = (value, currency = "USD") => {
  const amount = Number(value || 0);
  if (amount >= 1000) {
    return formatMoney(amount, currency).replace(/\.00\b/, "");
  }
  return `${formatMoney(amount, currency).replace(/\.00\b/, "")}`;
};

const formatChartCountTick = (value) => {
  const amount = Number(value || 0);
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
  }
  return String(Math.round(amount));
};

const buildChartTitle = (lines) =>
  escapeHtml(
    (Array.isArray(lines) ? lines : [])
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .join("\n")
  );

const buildSmoothLinePath = (coords = []) => {
  if (!coords.length) {
    return "";
  }

  if (coords.length === 1) {
    return `M ${coords[0].x} ${coords[0].y}`;
  }

  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let index = 0; index < coords.length - 1; index += 1) {
    const current = coords[index];
    const next = coords[index + 1];
    const controlX = (current.x + next.x) / 2;
    path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
};

const buildChartGrid = (ticks, config = {}) => {
  const left = Number(config.left ?? 52);
  const right = Number(config.right ?? 18);
  const width = Number(config.width ?? 360);
  const top = Number(config.top ?? 18);
  const bottom = Number(config.bottom ?? 38);
  const height = Number(config.height ?? 220);
  const chartHeight = height - top - bottom;
  const maxValue = Math.max(...ticks, 1);
  const tickFormatter = typeof config.tickFormatter === "function" ? config.tickFormatter : formatChartCountTick;

  return `
    <g class="admin-chart-grid">
      ${ticks
        .map((tick) => {
          const y = top + ((maxValue - tick) / maxValue) * chartHeight;
          return `
            <g class="admin-chart-grid-row">
              <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="admin-chart-grid-line"></line>
              <text x="${left - 10}" y="${y + 4}" text-anchor="end" class="admin-chart-axis-label">${escapeHtml(
                tickFormatter(tick)
              )}</text>
            </g>
          `;
        })
        .join("")}
    </g>
  `;
};

const buildLineChart = (points, options = {}) => {
  const series = Array.isArray(points) ? points : [];
  const values = series.map((item) => Number(item.value || 0));
  const max = Math.max(...values, 1);
  const chart = { width: 360, height: 220, left: 52, right: 18, top: 18, bottom: 38 };
  const chartWidth = chart.width - chart.left - chart.right;
  const chartHeight = chart.height - chart.top - chart.bottom;
  const coords = series.map((item, index) => {
    const x = chart.left + (index * chartWidth) / Math.max(series.length - 1, 1);
    const y = chart.top + chartHeight - (Number(item.value || 0) / max) * chartHeight;
    return { x, y, label: item.label, value: Number(item.value || 0), raw: item };
  });
  const linePath = buildSmoothLinePath(coords);
  const valueFormatter = typeof options.valueFormatter === "function" ? options.valueFormatter : formatNumber;
  const tickFormatter = typeof options.tickFormatter === "function" ? options.tickFormatter : valueFormatter;
  const axisIndices = getChartAxisIndices(series.length, options.legendItems || 6);
  const ticks = getChartTickValues(max, 4);

  return `
    <div class="admin-chart-card">
      <svg viewBox="0 0 ${chart.width} ${chart.height}" class="admin-chart-svg" aria-hidden="true">
        ${buildChartGrid(ticks, { ...chart, tickFormatter })}
        <line x1="${chart.left}" y1="${chart.height - chart.bottom}" x2="${chart.width - chart.right}" y2="${
          chart.height - chart.bottom
        }" class="admin-chart-axis"></line>
        <path d="${linePath}" class="admin-chart-line ${escapeHtml(options.lineClass || "")}"></path>
        ${coords
          .map(
            (point) => `
              <circle cx="${point.x}" cy="${point.y}" r="4.5" class="admin-chart-dot ${escapeHtml(options.dotClass || "")}">
                <title>${buildChartTitle([
                  point.label,
                  `Revenue: ${valueFormatter(point.value)}`,
                  point.raw?.orders ? `Orders: ${formatNumber(point.raw.orders)}` : "",
                ])}</title>
              </circle>
            `
          )
          .join("")}
        ${axisIndices
          .map((index) => {
            const point = coords[index];
            return `
              <text x="${point.x}" y="${chart.height - 12}" text-anchor="middle" class="admin-chart-axis-label admin-chart-axis-label-x">
                ${escapeHtml(point.label)}
              </text>
            `;
          })
          .join("")}
      </svg>
      <div class="admin-chart-legend">
        ${getChartLegendPoints(series, options.legendItems || 6)
          .map(
            (point) => `
              <div>
                <span>${escapeHtml(point.label)}</span>
                <strong>${escapeHtml(valueFormatter(point.value))}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
};

const buildBarChart = (points, options = {}) => {
  const series = Array.isArray(points) ? points : [];
  const values = series.map((item) => Number(item.value || 0));
  const max = Math.max(...values, 1);
  const valueFormatter = typeof options.valueFormatter === "function" ? options.valueFormatter : formatNumber;
  const chart = { width: 360, height: 220, left: 52, right: 18, top: 18, bottom: 38 };
  const chartWidth = chart.width - chart.left - chart.right;
  const chartHeight = chart.height - chart.top - chart.bottom;
  const barWidth = Math.max(12, Math.min(26, Math.floor((chartWidth - 10) / Math.max(series.length * 1.4, 1))));
  const gap = Math.max(8, (chartWidth - barWidth * Math.max(series.length, 1)) / Math.max(series.length - 1, 1));
  const tickFormatter = typeof options.tickFormatter === "function" ? options.tickFormatter : valueFormatter;
  const ticks = getChartTickValues(max, 4);
  const axisIndices = getChartAxisIndices(series.length, options.legendItems || 6);

  return `
    <div class="admin-chart-card">
      <svg viewBox="0 0 ${chart.width} ${chart.height}" class="admin-chart-svg" aria-hidden="true">
        ${buildChartGrid(ticks, { ...chart, tickFormatter })}
        <line x1="${chart.left}" y1="${chart.height - chart.bottom}" x2="${chart.width - chart.right}" y2="${
          chart.height - chart.bottom
        }" class="admin-chart-axis"></line>
        ${series
          .map((point, index) => {
            const height = (Number(point.value || 0) / max) * chartHeight;
            const x = chart.left + index * (barWidth + gap);
            const y = chart.top + chartHeight - height;
            return `
              <rect
                x="${x}"
                y="${y}"
                width="${barWidth}"
                height="${height}"
                rx="8"
                class="admin-chart-bar ${escapeHtml(options.barClass || "")}"
              >
                <title>${buildChartTitle([point.label, valueFormatter(point.value)])}</title>
              </rect>
            `;
          })
          .join("")}
        ${axisIndices
          .map((index) => {
            const point = series[index];
            const x = chart.left + index * (barWidth + gap) + barWidth / 2;
            return `
              <text x="${x}" y="${chart.height - 12}" text-anchor="middle" class="admin-chart-axis-label admin-chart-axis-label-x">
                ${escapeHtml(point.label)}
              </text>
            `;
          })
          .join("")}
      </svg>
      <div class="admin-chart-legend">
        ${getChartLegendPoints(series, options.legendItems || 6)
          .map(
            (point) => `
              <div>
                <span>${escapeHtml(point.label)}</span>
                <strong>${escapeHtml(valueFormatter(point.value))}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
};

const buildMultiLineChart = (series, options = {}) => {
  const groups = Array.isArray(series) ? series.filter((entry) => Array.isArray(entry?.points) && entry.points.length) : [];
  const allPoints = groups.flatMap((entry) => entry.points);
  const max = Math.max(...allPoints.map((item) => Number(item.value || 0)), 1);
  const legendSource = groups[0]?.points || [];
  const chart = { width: 360, height: 220, left: 52, right: 18, top: 18, bottom: 38 };
  const chartWidth = chart.width - chart.left - chart.right;
  const chartHeight = chart.height - chart.top - chart.bottom;
  const axisLabels = getChartAxisIndices(legendSource.length, options.legendItems || 6);
  const valueFormatter = typeof options.valueFormatter === "function" ? options.valueFormatter : formatNumber;
  const tickFormatter = typeof options.tickFormatter === "function" ? options.tickFormatter : valueFormatter;
  const ticks = getChartTickValues(max, 4);

  return `
    <div class="admin-chart-card">
      <svg viewBox="0 0 ${chart.width} ${chart.height}" class="admin-chart-svg" aria-hidden="true">
        ${buildChartGrid(ticks, { ...chart, tickFormatter })}
        <line x1="${chart.left}" y1="${chart.height - chart.bottom}" x2="${chart.width - chart.right}" y2="${
          chart.height - chart.bottom
        }" class="admin-chart-axis"></line>
        ${groups
          .map((entry) => {
            const coords = entry.points.map((point, index) => {
              const x = chart.left + (index * chartWidth) / Math.max(entry.points.length - 1, 1);
              const y = chart.top + chartHeight - (Number(point.value || 0) / max) * chartHeight;
              return { x, y, label: point.label, value: Number(point.value || 0) };
            });
            return `
              <path
                d="${buildSmoothLinePath(coords)}"
                class="admin-chart-line ${escapeHtml(entry.lineClass || "")}"
              ></path>
              ${coords
                .map(
                  (point) => `
                    <circle cx="${point.x}" cy="${point.y}" r="4" class="admin-chart-dot ${escapeHtml(
                      entry.dotClass || ""
                    )}">
                      <title>${buildChartTitle([point.label, `${entry.label}: ${valueFormatter(point.value)}`])}</title>
                    </circle>
                  `
                )
                .join("")}
            `;
          })
          .join("")}
        ${axisLabels
          .map((index) => {
            const point = legendSource[index];
            const x = chart.left + (index * chartWidth) / Math.max(legendSource.length - 1, 1);
            return `
              <text x="${x}" y="${chart.height - 12}" text-anchor="middle" class="admin-chart-axis-label admin-chart-axis-label-x">
                ${escapeHtml(point.label)}
              </text>
            `;
          })
          .join("")}
      </svg>
      <div class="admin-chart-series-labels">
        ${groups
          .map(
            (entry) => `
              <div>
                <span class="admin-chart-series-swatch ${escapeHtml(entry.swatchClass || "")}"></span>
                <strong>${escapeHtml(entry.label || "Series")}</strong>
              </div>
            `
          )
          .join("")}
      </div>
      <div class="admin-chart-legend">
        ${getChartLegendPoints(legendSource, options.legendItems || 6)
          .map(
            (point) => `
              <div>
                <span>${escapeHtml(point.label)}</span>
                <strong>${escapeHtml(valueFormatter(point.value))}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
};

const hasChartData = (points) => Array.isArray(points) && points.some((item) => Number(item.value || 0) > 0);

const hasSeriesChartData = (series) =>
  Array.isArray(series) &&
  series.some((entry) => Array.isArray(entry?.points) && entry.points.some((point) => Number(point.value || 0) > 0));

const renderDashboardChartEmptyState = () => `
  <div class="admin-dashboard-chart-empty">
    <strong>No data yet</strong>
    <p>Data will appear after receiving customer activity.</p>
  </div>
`;

const buildDashboardBreakdownList = (items, emptyTitle, emptyDescription) => {
  if (!Array.isArray(items) || !items.length) {
    return renderEmptyState(emptyTitle, emptyDescription);
  }

  return `
    <div class="admin-dashboard-breakdown-list">
      ${items
        .map(
          (item) => `
            <article class="admin-dashboard-breakdown-row">
              <div>
                <strong>${escapeHtml(item.label || "Unknown")}</strong>
                <p>${formatNumber(item.value || 0)} visits</p>
              </div>
              <span>${escapeHtml(`${Number(item.percentage || 0)}%`)}</span>
            </article>
          `
        )
        .join("")}
    </div>
  `;
};

const renderDashboardKpiCard = ({ title, value, detail }) => `
  <article class="admin-dashboard-kpi">
    <span class="admin-dashboard-kpi-title">${escapeHtml(title)}</span>
    <strong>${escapeHtml(value)}</strong>
    <small>${escapeHtml(detail)}</small>
  </article>
`;

const getSupportCustomerSpend = (customerOrders = []) =>
  customerOrders.reduce((sum, order) => sum + Number(order?.subtotal || order?.totalAmount || 0), 0);

const getSupportConversationHeaderSummary = (selected, customerOrders = []) => {
  const latestOrder = customerOrders[0];
  if (latestOrder?.orderNumber || latestOrder?.orderId) {
    return {
      orderNumber: latestOrder.orderNumber || latestOrder.orderId || latestOrder.id || "-",
      orderStatus: formatStatusLabel(latestOrder.orderStatus || latestOrder.status || "pending"),
      orderAmount: formatMoney(latestOrder.totalAmount || latestOrder.subtotal || 0, latestOrder.currency || "USD"),
    };
  }

  return {
    orderNumber: selected?.relatedOrderNumber || "No linked order",
    orderStatus: formatStatusLabel(selected?.status || "open"),
    orderAmount: customerOrders.length ? formatMoney(getSupportCustomerSpend(customerOrders), "USD") : "No spend yet",
  };
};

const getAdminConversationContextLabel = (thread) =>
  String(getAdminConversationContext(thread) || "Support conversation").replace(/鈥\?/g, "•").replace(/\s+•\s+/g, " • ");

const renderDashboardSection = async () => renderDashboardSectionV2();

async function renderDashboardSectionV2() {
  renderLoading();

  try {
    const stats = await fetchAdminDashboard();
    if (!stats) {
      throw new Error("Dashboard payload was empty.");
    }

    const revenueRange = Number(adminState.dashboard?.revenueRange || 7) === 30 ? 30 : 7;
    const revenueTrend = (revenueRange === 30 ? stats?.revenue?.trend30 : stats?.revenue?.trend7 || []).map((item) => ({
      label: formatShortDate(item.key),
      value: Number(item.value || 0),
      orders: Number(item.orders || item.count || 0),
    }));
    const visitorTrend = (stats?.visitors?.trend7 || []).map((item) => ({
      label: formatShortDate(item.key),
      value: Number(item.value || 0),
    }));
    const inquiryTrend = (stats?.inquiries?.trend7 || []).map((item) => ({
      label: formatShortDate(item.key),
      value: Number(item.value || 0),
    }));
    const recentInquiries = (Array.isArray(stats.recentMessages) ? stats.recentMessages : [])
      .filter((item) => ["product_inquiry", "wholesale_inquiry"].includes(normalizeStatusValue(item.conversationType)))
      .slice(0, 5);

    contentRoot.innerHTML = `
      <div class="admin-stack admin-dashboard-stack admin-dashboard-v3">
        <section class="admin-dashboard-kpis admin-dashboard-kpis-v3">
          ${renderDashboardKpiCard({
            title: "Revenue",
            value: formatMoney(stats?.revenue?.monthly || 0, stats?.revenue?.currency || "USD"),
            detail: "This month",
          })}
          ${renderDashboardKpiCard({
            title: "Orders",
            value: formatNumber(stats?.orders?.total || 0),
            detail: `${formatNumber(stats?.orders?.pending || 0)} pending`,
          })}
          ${renderDashboardKpiCard({
            title: "Inquiries",
            value: formatNumber(stats?.inquiries?.total || 0),
            detail: "Total",
          })}
          ${renderDashboardKpiCard({
            title: "Visitors",
            value: formatNumber(stats?.visitors?.today || 0),
            detail: `${formatNumber(stats?.pageViews?.today || 0)} page views today`,
          })}
        </section>

        <section class="admin-dashboard-overview">
          <article class="admin-panel admin-dashboard-panel">
            <div class="admin-panel-header admin-dashboard-panel-header">
              <div>
                <h3>Revenue &amp; Orders Trend</h3>
              </div>
              <div class="admin-dashboard-segmented">
                <button type="button" class="admin-dashboard-toggle ${revenueRange === 7 ? "is-active" : ""}" data-dashboard-range="7">7D</button>
                <button type="button" class="admin-dashboard-toggle ${revenueRange === 30 ? "is-active" : ""}" data-dashboard-range="30">30D</button>
              </div>
            </div>
            ${hasChartData(revenueTrend)
              ? buildLineChart(revenueTrend, {
                  valueFormatter: (value) => formatMoney(value, stats?.revenue?.currency || "USD"),
                  tickFormatter: (value) => formatChartMoneyTick(value, stats?.revenue?.currency || "USD"),
                  legendItems: revenueRange === 30 ? 6 : 7,
                })
              : renderDashboardChartEmptyState()}
          </article>

          <article class="admin-panel admin-dashboard-panel">
            <div class="admin-panel-header admin-dashboard-panel-header">
              <div>
                <h3>Visitors &amp; Inquiries Trend</h3>
              </div>
            </div>
            ${hasSeriesChartData([
              { points: visitorTrend },
              { points: inquiryTrend },
                ])
              ? buildMultiLineChart([
                  {
                    label: "Visitors",
                    points: visitorTrend,
                    lineClass: "admin-chart-line-primary",
                    dotClass: "admin-chart-dot-primary",
                    swatchClass: "admin-chart-series-primary",
                  },
                  {
                    label: "Inquiries",
                    points: inquiryTrend,
                    lineClass: "admin-chart-line-secondary",
                    dotClass: "admin-chart-dot-secondary",
                    swatchClass: "admin-chart-series-secondary",
                  },
                ], {
                  tickFormatter: formatChartCountTick,
                })
              : renderDashboardChartEmptyState()}
          </article>
        </section>

        <section class="admin-dashboard-activity">
          <article class="admin-panel admin-dashboard-panel">
            <div class="admin-panel-header admin-dashboard-panel-header">
              <div>
                <h3>Recent Orders</h3>
              </div>
            </div>
            ${
              Array.isArray(stats.recentOrders) && stats.recentOrders.length
                ? `
                  <div class="admin-dashboard-list">
                    ${stats.recentOrders
                      .slice(0, 5)
                      .map(
                        (order) => `
                          <button class="admin-dashboard-row admin-dashboard-link" type="button" data-dashboard-order="${escapeHtml(order.id)}">
                            <div class="admin-dashboard-row-main">
                              <strong>${escapeHtml(order.orderNumber || order.orderId || order.id || "-")}</strong>
                              <p>${escapeHtml(order.customerName || "Unknown customer")}</p>
                            </div>
                            <div class="admin-dashboard-row-side">
                              <span>${escapeHtml(formatMoney(order.totalAmount || order.subtotal || 0, order.currency || "USD"))}</span>
                              <span class="admin-pill ${getStatusClass(order.orderStatus || order.status)}">${escapeHtml(formatStatusLabel(order.orderStatus || order.status || "pending"))}</span>
                            </div>
                          </button>
                        `
                      )
                      .join("")}
                  </div>
                `
                : renderEmptyState("No orders yet", "New website orders will appear here.")
            }
            <button class="admin-dashboard-view-all" type="button" data-dashboard-view="orders">View all</button>
          </article>

          <article class="admin-panel admin-dashboard-panel">
            <div class="admin-panel-header admin-dashboard-panel-header">
              <div>
                <h3>Recent Inquiries</h3>
              </div>
            </div>
            ${
              recentInquiries.length
                ? `
                  <div class="admin-dashboard-list">
                    ${recentInquiries
                      .map(
                        (item) => `
                          <button class="admin-dashboard-row" type="button" data-dashboard-conversation="${escapeHtml(item.id)}">
                            <div class="admin-dashboard-row-main">
                              <strong>${escapeHtml(item.customerName || item.email || "Customer")}</strong>
                              <p>${escapeHtml(item.relatedProductName || item.subject || "General inquiry")}</p>
                            </div>
                            <div class="admin-dashboard-row-side">
                              <small>${escapeHtml(formatDate(item.createdAt))}</small>
                              <span class="admin-pill ${getStatusClass(item.status)}">${escapeHtml(
                                formatStatusLabel(item.status || "open")
                              )}</span>
                            </div>
                          </button>
                        `
                      )
                      .join("")}
                  </div>
                `
                : renderEmptyState("No recent inquiries", "New product and wholesale inquiries will appear here.")
            }
            <button class="admin-dashboard-view-all" type="button" data-dashboard-view="inquiries">View all</button>
          </article>
        </section>

      </div>
    `;

    contentRoot.querySelectorAll("[data-dashboard-range]").forEach((button) =>
      button.addEventListener("click", async () => {
        adminState.dashboard.revenueRange = Number(button.dataset.dashboardRange || 7) === 30 ? 30 : 7;
        await renderDashboardSectionV2();
      })
    );
    contentRoot.querySelectorAll("[data-dashboard-conversation]").forEach((button) =>
      button.addEventListener("click", async () => {
        await openAdminEntity("conversation", button.dataset.dashboardConversation);
      })
    );
    contentRoot.querySelectorAll("[data-dashboard-order]").forEach((button) =>
      button.addEventListener("click", async () => {
        await openAdminOrderDetail(button.dataset.dashboardOrder || null);
      })
    );
    contentRoot.querySelectorAll("[data-dashboard-view]").forEach((button) =>
      button.addEventListener("click", async () => {
        adminState.activeSection = button.dataset.dashboardView === "orders" ? "orders" : "support";
        syncAdminRoute("push");
        await renderCurrentSection();
      })
    );
  } catch (error) {
    contentRoot.innerHTML = `
      <section class="admin-panel">
        <div class="admin-empty-state">
          <h3>Dashboard unavailable</h3>
          <p>${escapeHtml(error?.message || "Unable to load dashboard data.")}</p>
          <button type="button" class="admin-primary-button" id="admin-dashboard-retry">Retry</button>
        </div>
      </section>
    `;
    document.querySelector("#admin-dashboard-retry")?.addEventListener("click", renderDashboardSectionV2);
  }
}

const renderOrderListMarkup = (orders) =>
  orders.length
    ? `
      <div class="admin-table-shell admin-commerce-table-shell">
        <table class="admin-table admin-commerce-table admin-orders-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Order Status</th>
              <th>Payment Status</th>
              <th>Fulfillment</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${orders
              .map(
                (order) => `
                  <tr>
                    <td class="admin-mono admin-table-strong">${escapeHtml(order.orderNumber || order.orderId || order.id || "-")}</td>
                    <td>
                      <strong>${escapeHtml(order.customerName || "Unknown Customer")}</strong>
                      <small>${escapeHtml(formatStatusLabel(order.purchaseMode || "retail"))}</small>
                    </td>
                    <td>${escapeHtml(`${getAdminOrderItemCount(order)} item${getAdminOrderItemCount(order) === 1 ? "" : "s"}`)}</td>
                    <td class="admin-table-strong">${escapeHtml(order.totalAmount || order.subtotal || "-")}</td>
                    <td><span class="admin-pill ${getAdminPillStatusClass(order.orderStatus)}">${escapeHtml(formatStatusLabel(order.orderStatus || "pending"))}</span></td>
                    <td><span class="admin-pill ${getAdminPillStatusClass(order.paymentStatus)}">${escapeHtml(formatPaymentStatusLabel(order.paymentStatus || "unpaid"))}</span></td>
                    <td><span class="admin-pill ${getAdminPillStatusClass(order.shippingStatus)}">${escapeHtml(formatStatusLabel(order.shippingStatus || "not_started"))}</span></td>
                    <td>${escapeHtml(formatShortDate(order.createdAt))}</td>
                    <td><button class="admin-secondary-button admin-table-action" type="button" data-order-id="${escapeHtml(order.id)}">View</button></td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
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
  const paymentSummary = getAdminOrderPaymentSummary(selected, selectedPayments);
  const summaryCurrency = selected.currency || selectedPayments?.[0]?.currency || "USD";

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
                <span>Created ${escapeHtml(formatDate(selected.createdAt))}</span>
                <span>${escapeHtml(formatStatusLabel(selected.purchaseMode || "retail"))}</span>
                <span>${escapeHtml(summaryCurrency)}</span>
                <strong>${escapeHtml(selected.totalAmount || selected.subtotal || "-")}</strong>
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
                              item.image || item.productImage
                                ? `<img class="admin-order-item-thumb" src="${escapeHtml(item.image || item.productImage)}" alt="${escapeHtml(
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
            ${
              hasNonZeroAmount(selected.discountAmount)
                ? `<div class="admin-order-total-row"><span>Discount</span><strong>${escapeHtml(selected.discountAmount || "$0.00")}</strong></div>`
                : ""
            }
            <div class="admin-order-total-row"><span>Total</span><strong>${escapeHtml(
              selected.totalAmount || selected.subtotal || "-"
            )}</strong></div>
          </div>
        </section>

        <section class="admin-subsection">
          <div class="admin-section-head">
            <h4>Payment Summary</h4>
            <button class="admin-secondary-button" type="button" id="order-view-all-payments">View Payments</button>
          </div>
          <article class="admin-info-card admin-order-payment-summary">
            <dl class="admin-description-grid">
              <div><dt>Payment Status</dt><dd><span class="admin-pill ${getAdminPillStatusClass(selected.paymentStatus)}">${escapeHtml(formatPaymentStatusLabel(selected.paymentStatus || "unpaid"))}</span></dd></div>
              <div><dt>Paid Amount</dt><dd>${escapeHtml(formatMoney(paymentSummary.paidAmount, summaryCurrency))}</dd></div>
              <div><dt>Balance Due</dt><dd>${escapeHtml(formatMoney(paymentSummary.balanceDue, summaryCurrency))}</dd></div>
              <div><dt>Payment Method</dt><dd>${escapeHtml(paymentSummary.methods.join(", ") || "-")}</dd></div>
            </dl>
            ${paymentSummary.pendingBankTransfer ? '<p class="admin-payment-attention">Bank Transfer pending verification. Review the payment record in Payments.</p>' : ""}
          </article>
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

    if (adminState.orders.mode !== "all" && normalizeStatusValue(order.purchaseMode) !== adminState.orders.mode) {
      return false;
    }
    if (adminState.orders.orderStatus !== "all" && normalizeStatusValue(order.orderStatus) !== adminState.orders.orderStatus) {
      return false;
    }
    if (adminState.orders.paymentStatus !== "all" && normalizeStatusValue(order.paymentStatus) !== adminState.orders.paymentStatus) {
      return false;
    }
    if (adminState.orders.shippingStatus !== "all" && normalizeStatusValue(order.shippingStatus) !== adminState.orders.shippingStatus) {
      return false;
    }
    if (!matchesAdminDateFilter(order.createdAt, adminState.orders.date)) {
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
  const summaryCounts = orders.reduce(
    (summary, order) => {
      const pending = matchesAdminOrderListFilter(order, "pending");
      const completed = matchesAdminOrderListFilter(order, "completed");
      const cancelled = matchesAdminOrderListFilter(order, "cancelled");
      if (pending) summary.pending += 1;
      if (completed) summary.completed += 1;
      if (!pending && !completed && !cancelled) summary.inProgress += 1;
      return summary;
    },
    { pending: 0, inProgress: 0, completed: 0 }
  );
  const uniqueOptions = (field) =>
    Array.from(new Set(orders.map((order) => normalizeStatusValue(order?.[field])).filter(Boolean))).sort();

  contentRoot.innerHTML = `
    <div class="admin-stack admin-commerce-section admin-orders-section">
      <section class="admin-commerce-summary" aria-label="Order summary">
        ${[
          ["All Orders", orders.length],
          ["Pending", summaryCounts.pending],
          ["In Progress", summaryCounts.inProgress],
          ["Completed", summaryCounts.completed],
        ].map(([label, value]) => `<article class="admin-commerce-summary-card"><span>${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong></article>`).join("")}
      </section>

      <section class="admin-panel admin-commerce-filter-panel">
        <div class="admin-panel-header">
          <div>
            <h3>Order Management</h3>
            <p>Track order progress, payment state, and fulfillment.</p>
          </div>
        </div>
        <div class="admin-toolbar admin-commerce-toolbar">
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
        <div class="admin-commerce-filter-grid">
          <label>Channel<select id="orders-mode-filter"><option value="all">All</option><option value="retail" ${adminState.orders.mode === "retail" ? "selected" : ""}>Retail</option><option value="wholesale" ${adminState.orders.mode === "wholesale" ? "selected" : ""}>Wholesale</option></select></label>
          <label>Order Status<select id="orders-order-status-filter"><option value="all">All</option>${uniqueOptions("orderStatus").map((status) => `<option value="${escapeHtml(status)}" ${adminState.orders.orderStatus === status ? "selected" : ""}>${escapeHtml(formatStatusLabel(status))}</option>`).join("")}</select></label>
          <label>Payment Status<select id="orders-payment-status-filter"><option value="all">All</option>${uniqueOptions("paymentStatus").map((status) => `<option value="${escapeHtml(status)}" ${adminState.orders.paymentStatus === status ? "selected" : ""}>${escapeHtml(formatPaymentStatusLabel(status))}</option>`).join("")}</select></label>
          <label>Fulfillment<select id="orders-shipping-status-filter"><option value="all">All</option>${uniqueOptions("shippingStatus").map((status) => `<option value="${escapeHtml(status)}" ${adminState.orders.shippingStatus === status ? "selected" : ""}>${escapeHtml(formatStatusLabel(status))}</option>`).join("")}</select></label>
          <label>Date<input id="orders-date-filter" type="date" value="${escapeHtml(adminState.orders.date)}"></label>
        </div>
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

  [
    ["#orders-mode-filter", "mode"],
    ["#orders-order-status-filter", "orderStatus"],
    ["#orders-payment-status-filter", "paymentStatus"],
    ["#orders-shipping-status-filter", "shippingStatus"],
    ["#orders-date-filter", "date"],
  ].forEach(([selector, key]) => {
    document.querySelector(selector)?.addEventListener("change", async (event) => {
      adminState.orders[key] = event.target.value || (key === "date" ? "" : "all");
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
      <div class="admin-table-shell admin-commerce-table-shell">
        <table class="admin-table admin-commerce-table admin-payments-table">
          <thead>
            <tr>
              <th>Payment ID</th>
              <th>Order #</th>
              <th>Customer</th>
              <th>Payment Type</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Currency</th>
              <th>Status</th>
              <th>Transaction Reference</th>
              <th>Paid At</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${payments
              .map(
                (payment) => `
                  <tr>
                    <td class="admin-mono admin-table-strong">${escapeHtml(payment.paymentId || payment.id || "-")}</td>
                    <td class="admin-mono">${escapeHtml(payment.orderNumberDisplay || payment.orderId || "-")}</td>
                    <td>${escapeHtml(payment.customerDisplay || payment.customer || "Unknown Customer")}</td>
                    <td>${escapeHtml(formatPaymentTypeLabel(payment.paymentType))}</td>
                    <td>${escapeHtml(formatPaymentMethodLabel(payment.paymentMethod))}</td>
                    <td class="admin-table-strong">${escapeHtml(formatMoney(payment.amount, payment.currency))}</td>
                    <td>${escapeHtml(payment.currency || "USD")}</td>
                    <td><span class="admin-pill ${getAdminPillStatusClass(payment.status)}">${escapeHtml(formatPaymentStatusLabel(payment.status))}</span></td>
                    <td class="admin-mono admin-break-anywhere">${escapeHtml(payment.transactionId || payment.paypalCaptureId || payment.providerReference || "-")}</td>
                    <td>${escapeHtml(payment.paidAt ? formatDate(payment.paidAt) : "-")}</td>
                    <td><button class="admin-secondary-button admin-table-action" type="button" data-payment-view="${escapeHtml(payment.id)}">View</button></td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
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

const renderPaymentDetailMarkup = ({ payment, order }) => {
  if (!payment) {
    return renderEmptyState("Payment not found", "This payment record could not be loaded.");
  }

  const bankTransfer = isBankTransferPaymentRecord(payment);
  const paypal = normalizePaymentMethodName(payment.paymentMethod) === "paypal" || normalizeStatusValue(payment.paymentProvider) === "paypal";
  const paymentStatus = normalizeStatusValue(payment.status);
  const bankTransferCanReview = bankTransfer && !["paid", "refunded", "cancelled"].includes(paymentStatus);
  const transactionMarkup = paypal
    ? `
        <div><dt>PayPal Order ID</dt><dd class="admin-break-anywhere admin-mono">${escapeHtml(payment.paypalOrderId || "-")}</dd></div>
        <div><dt>Capture ID</dt><dd class="admin-break-anywhere admin-mono">${escapeHtml(payment.paypalCaptureId || "-")}</dd></div>
        <div class="full"><dt>Transaction ID</dt><dd class="admin-break-anywhere admin-mono">${escapeHtml(payment.transactionId || payment.paypalCaptureId || "-")}</dd></div>
      `
    : bankTransfer
      ? `
          <div><dt>Bank Reference</dt><dd class="admin-break-anywhere admin-mono">${escapeHtml(payment.transactionId || payment.providerReference || "-")}</dd></div>
          <div><dt>Settlement Channel</dt><dd>${escapeHtml(formatSettlementChannelLabel(payment.settlementChannel))}</dd></div>
          <div><dt>WorldFirst Reference</dt><dd>Not available from current API</dd></div>
          <div><dt>Receiving Account</dt><dd>Not available from current API</dd></div>
          <div><dt>Confirmed By</dt><dd>Not available from current API</dd></div>
          <div><dt>Confirmed At</dt><dd>${escapeHtml(payment.paidAt ? formatDate(payment.paidAt) : "-")}</dd></div>
          <div class="full"><dt>Proof / Note</dt><dd>${
            payment.paymentProofUrl
              ? `<div class="admin-payment-proof-preview"><a href="${escapeHtml(payment.paymentProofUrl)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(payment.paymentProofUrl)}" alt="Payment proof preview"></a><a href="${escapeHtml(payment.paymentProofUrl)}" target="_blank" rel="noreferrer">Open payment proof</a></div>`
              : escapeHtml(payment.note || "-")
          }</dd></div>
        `
      : `
          <div class="full"><dt>Transaction Reference</dt><dd class="admin-break-anywhere admin-mono">${escapeHtml(payment.transactionId || payment.providerReference || "-")}</dd></div>
          <div class="full"><dt>Note</dt><dd>${escapeHtml(payment.note || "-")}</dd></div>
        `;

  return `
    <div class="admin-payment-detail-stack admin-finance-detail">
      <div class="admin-page-actions">
        <button class="admin-secondary-button" type="button" id="payments-back-button">Back to Payments</button>
      </div>

      <section class="admin-payment-header-card">
        <div class="admin-payment-header-copy">
          <div>
            <p class="admin-order-overline">Payment Record</p>
            <span class="admin-mono">${escapeHtml(payment.paymentId || payment.id)}</span>
            <h3>${escapeHtml(formatMoney(payment.amount, payment.currency))}</h3>
            <div class="admin-order-header-subline">
              <span>${escapeHtml(formatPaymentTypeLabel(payment.paymentType))}</span>
              <span>${escapeHtml(payment.currency || "USD")}</span>
              <span>${escapeHtml(formatPaymentMethodLabel(payment.paymentMethod))}</span>
            </div>
          </div>
          <span class="admin-pill ${getAdminPillStatusClass(payment.status)}">${escapeHtml(formatPaymentStatusLabel(payment.status))}</span>
        </div>
      </section>

      <div class="admin-payment-detail-layout admin-payment-detail-layout-finance">
        <div class="admin-payment-detail-column">
          <section class="admin-panel admin-payment-card">
            <div class="admin-section-head"><h4>Payment Information</h4></div>
            <dl class="admin-description-grid">
              <div class="full"><dt>Payment ID</dt><dd class="admin-break-anywhere admin-mono admin-inline-copy-field"><span>${escapeHtml(payment.paymentId || payment.id)}</span><button class="admin-ghost-button" type="button" id="payment-copy-id-button">Copy</button></dd></div>
              <div><dt>Order #</dt><dd class="admin-mono">${escapeHtml(order?.orderNumber || order?.orderId || payment.orderId || "-")}</dd></div>
              <div><dt>Payment Type</dt><dd>${escapeHtml(formatPaymentTypeLabel(payment.paymentType))}</dd></div>
              <div><dt>Payment Method</dt><dd>${escapeHtml(formatPaymentMethodLabel(payment.paymentMethod))}</dd></div>
              <div><dt>Amount</dt><dd>${escapeHtml(formatMoney(payment.amount, payment.currency))}</dd></div>
              <div><dt>Currency</dt><dd>${escapeHtml(payment.currency || "USD")}</dd></div>
              <div><dt>Payment Status</dt><dd><span class="admin-pill ${getAdminPillStatusClass(payment.status)}">${escapeHtml(formatPaymentStatusLabel(payment.status))}</span></dd></div>
              <div><dt>Created At</dt><dd>${escapeHtml(formatDate(payment.createdAt))}</dd></div>
              <div><dt>Paid At</dt><dd>${escapeHtml(payment.paidAt ? formatDate(payment.paidAt) : "-")}</dd></div>
            </dl>
          </section>

          <section class="admin-panel admin-payment-card">
            <div class="admin-section-head"><h4>Transaction</h4></div>
            <dl class="admin-description-grid">${transactionMarkup}</dl>
          </section>

          <section class="admin-panel admin-payment-card">
            <div class="admin-section-head"><h4>Related Order</h4></div>
            ${order
              ? `<button class="admin-linked-order-card" type="button" id="payments-view-order-button"><div class="admin-linked-record-main"><strong>${escapeHtml(order.orderNumber || order.orderId || order.id || "-")}</strong><p>${escapeHtml(order.customerName || payment.customer || "-")}</p></div><div class="admin-linked-record-side"><span>${escapeHtml(order.totalAmount || formatMoney(payment.amount, payment.currency))}</span><span class="admin-link-hint">View Order</span></div></button>`
              : renderEmptyState("Order not found", "The linked order could not be loaded.")}
          </section>
        </div>

        <div class="admin-payment-detail-column admin-payment-detail-column-sticky">
          <div class="admin-payment-sticky-stack">
            <section class="admin-panel admin-payment-card">
              <div class="admin-section-head"><h4>Verification</h4></div>
              ${paypal ? '<p class="admin-muted">PayPal status is controlled by verified capture and webhook events. Manual Mark as Paid is unavailable.</p>' : ""}
              ${bankTransfer ? `
                <p class="admin-muted">Review the bank reference and proof before changing this payment record.</p>
                ${bankTransferCanReview
                  ? '<div class="admin-actions-stack"><button class="admin-primary-button" type="button" id="payment-confirm-bank-transfer-button">Confirm Payment</button><button class="admin-secondary-button" type="button" id="payment-reject-bank-transfer-button">Reject Payment</button></div>'
                  : `<span class="admin-pill ${getAdminPillStatusClass(payment.status)}">${escapeHtml(formatPaymentStatusLabel(payment.status))}</span>`}
              ` : ""}
              ${!paypal && !bankTransfer ? `
                <form class="admin-form-stack" id="payment-detail-form">
                  <input type="hidden" name="id" value="${escapeHtml(payment.id)}">
                  <label>Status<select name="status">${getPaymentStatusSelectOptions(payment.status).map((status) => `<option value="${status}" ${paymentStatus === normalizeStatusValue(status) ? "selected" : ""}>${escapeHtml(formatStatusLabel(status))}</option>`).join("")}</select></label>
                  <button class="admin-primary-button" type="submit">Save Payment Status</button>
                </form>
              ` : ""}
            </section>

            <section class="admin-panel admin-payment-card">
              <div class="admin-section-head"><h4>Payment Timeline</h4></div>
              ${renderPaymentTimelineMarkup(payment)}
            </section>
          </div>
        </div>
      </div>
    </div>
  `;
};

const renderPaymentDetailSection = async () => {
  const paymentId = String(adminState.payments.selectedId || "").trim();
  const payment = paymentId ? await fetchAdminPayment(paymentId) : null;
  if (!payment) {
    adminState.payments.mode = "list";
    adminState.payments.selectedId = null;
    syncAdminRoute("replace");
    await renderCurrentSection();
    return;
  }

  const order = payment.orderId ? await fetchAdminOrder(payment.orderId) : null;
  contentRoot.innerHTML = renderPaymentDetailMarkup({ payment, order });

  document.querySelector("#payments-back-button")?.addEventListener("click", async () => {
    adminState.payments.mode = "list";
    adminState.payments.selectedId = null;
    syncAdminRoute("push");
    await renderCurrentSection();
  });
  document.querySelector("#payments-view-order-button")?.addEventListener("click", async () => {
    await openAdminOrderDetail(payment.orderId || order?.id || null);
  });
  document.querySelector("#payment-copy-id-button")?.addEventListener("click", async (event) => {
    await navigator.clipboard.writeText(payment.paymentId || payment.id);
    event.currentTarget.textContent = "Copied";
  });
  document.querySelector("#payment-confirm-bank-transfer-button")?.addEventListener("click", async () => {
    await reviewAdminBankTransferPayment(payment.id, "paid");
    await renderPaymentDetailSection();
  });
  document.querySelector("#payment-reject-bank-transfer-button")?.addEventListener("click", async () => {
    await reviewAdminBankTransferPayment(payment.id, "failed");
    await renderPaymentDetailSection();
  });
  document.querySelector("#payment-detail-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = String(new FormData(event.currentTarget).get("status") || "pending");
    await updateAdminPayment(payment.id, {
      status,
      paidAt: status === "paid" ? new Date().toISOString() : "",
    });
    await renderPaymentDetailSection();
  });
};

const renderPaymentsSection = async () => {
  if (adminState.payments.mode === "detail" && adminState.payments.selectedId) {
    await renderPaymentDetailSection();
    return;
  }

  const [payments, orders] = await Promise.all([fetchAdminPayments(), fetchAdminOrders()]);
  const orderMap = new Map(orders.map((order) => [String(order.id || ""), order]));
  const statusMatcher = adminState.payments.status === "all"
    ? null
    : new Set([normalizeStatusValue(adminState.payments.status)]);
  const query = adminState.payments.query.trim().toLowerCase();
  const hydratedPayments = payments
    .map((payment) => {
      const linkedOrder = orderMap.get(String(payment.orderId || "")) || null;
      return {
        ...payment,
        linkedOrder,
        orderNumberDisplay: linkedOrder?.orderNumber || payment.orderId || "-",
        customerDisplay: payment.customer || linkedOrder?.customerName || "-",
        customerEmailDisplay: payment.customerEmail || linkedOrder?.email || "",
      };
    });
  const filteredPayments = hydratedPayments.filter((payment) => {
      if (adminState.payments.orderFilterId && String(payment.orderId || "") !== adminState.payments.orderFilterId) {
        return false;
      }
      if (statusMatcher && !statusMatcher.has(normalizeStatusValue(payment.status))) {
        return false;
      }
      if (adminState.payments.method !== "all" && normalizePaymentMethodName(payment.paymentMethod).replace(/\s+/g, "_") !== adminState.payments.method) {
        return false;
      }
      if (adminState.payments.paymentType !== "all" && normalizeStatusValue(payment.paymentType) !== adminState.payments.paymentType) {
        return false;
      }
      if (adminState.payments.currency !== "all" && String(payment.currency || "USD").toLowerCase() !== adminState.payments.currency) {
        return false;
      }
      if (!matchesAdminDateFilter(payment.createdAt, adminState.payments.date)) {
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
        payment.paymentType,
        payment.transactionId,
        payment.paypalCaptureId,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  const uniquePaymentOptions = (field, formatter = normalizeStatusValue) =>
    Array.from(new Set(hydratedPayments.map((payment) => formatter(payment?.[field])).filter(Boolean))).sort();
  const receivedTotals = hydratedPayments.filter(isPaidPaymentRecord).reduce((totals, payment) => {
    const currency = String(payment.currency || "USD").toUpperCase();
    totals[currency] = Number(totals[currency] || 0) + Number(payment.amount || 0);
    return totals;
  }, {});
  const receivedLabel = Object.entries(receivedTotals).map(([currency, amount]) => formatMoney(amount, currency)).join(" / ") || formatMoney(0, "USD");
  const pendingVerification = hydratedPayments.filter(
    (payment) => isBankTransferPaymentRecord(payment) && ["pending", "unpaid", "payment_submitted"].includes(normalizeStatusValue(payment.status))
  ).length;
  const failedCount = hydratedPayments.filter((payment) => normalizeStatusValue(payment.status) === "failed").length;
  const refundedCount = hydratedPayments.filter((payment) => ["refunded", "partially_refunded"].includes(normalizeStatusValue(payment.status))).length;
  syncAdminRoute("replace");

  contentRoot.innerHTML = `
    <div class="admin-stack admin-commerce-section admin-payments-section">
      <section class="admin-commerce-summary" aria-label="Payment summary">
        ${[
          ["Total Received", receivedLabel],
          ["Pending Verification", pendingVerification],
          ["Failed", failedCount],
          ["Refunded", refundedCount],
        ].map(([label, value]) => `<article class="admin-commerce-summary-card"><span>${escapeHtml(label)}</span><strong>${typeof value === "number" ? formatNumber(value) : escapeHtml(value)}</strong></article>`).join("")}
      </section>

      <section class="admin-panel admin-commerce-filter-panel">
        <div class="admin-panel-header">
          <div>
            <h3>Financial Transactions</h3>
            <p>Review individual payment records, settlement references, and verification status.</p>
          </div>
          ${
            adminState.payments.orderFilterId
              ? '<button class="admin-secondary-button" type="button" id="payments-clear-order-filter">Clear Order Filter</button>'
              : ""
          }
        </div>

        <div class="admin-toolbar admin-commerce-toolbar">
          <label class="admin-search-field">
            <span>Search</span>
            <input
              id="payments-search"
              class="admin-search-input"
              type="search"
              placeholder="Search payment ID, order number, transaction ID or customer"
              value="${escapeHtml(adminState.payments.query)}"
            >
          </label>
          <div class="admin-commerce-filter-grid">
            <label>Method<select id="payments-method-filter"><option value="all">All</option>${uniquePaymentOptions("paymentMethod", (value) => normalizePaymentMethodName(value).replace(/\s+/g, "_")).map((method) => `<option value="${escapeHtml(method)}" ${adminState.payments.method === method ? "selected" : ""}>${escapeHtml(formatPaymentMethodLabel(method))}</option>`).join("")}</select></label>
            <label>Payment Type<select id="payments-type-filter"><option value="all">All</option>${uniquePaymentOptions("paymentType").map((type) => `<option value="${escapeHtml(type)}" ${adminState.payments.paymentType === type ? "selected" : ""}>${escapeHtml(formatPaymentTypeLabel(type))}</option>`).join("")}</select></label>
            <label>Status<select id="payments-status-filter"><option value="all">All</option>${uniquePaymentOptions("status").map((status) => `<option value="${escapeHtml(status)}" ${adminState.payments.status === status ? "selected" : ""}>${escapeHtml(formatPaymentStatusLabel(status))}</option>`).join("")}</select></label>
            <label>Currency<select id="payments-currency-filter"><option value="all">All</option>${uniquePaymentOptions("currency", (value) => String(value || "USD").toLowerCase()).map((currency) => `<option value="${escapeHtml(currency)}" ${adminState.payments.currency === currency ? "selected" : ""}>${escapeHtml(currency.toUpperCase())}</option>`).join("")}</select></label>
            <label>Date<input id="payments-date-filter" type="date" value="${escapeHtml(adminState.payments.date)}"></label>
          </div>
        </div>
      </section>

      <section class="admin-panel">
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

  [
    ["#payments-method-filter", "method"],
    ["#payments-type-filter", "paymentType"],
    ["#payments-status-filter", "status"],
    ["#payments-currency-filter", "currency"],
    ["#payments-date-filter", "date"],
  ].forEach(([selector, key]) => {
    document.querySelector(selector)?.addEventListener("change", async (event) => {
      adminState.payments[key] = event.target.value || (key === "date" ? "" : "all");
      await renderCurrentSection();
    });
  });

  contentRoot.querySelectorAll("[data-payment-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      adminState.payments.mode = "detail";
      adminState.payments.selectedId = button.dataset.paymentView || null;
      syncAdminRoute("push");
      await renderCurrentSection();
    });
  });

  document.querySelector("#payments-clear-order-filter")?.addEventListener("click", async () => {
    adminState.payments.orderFilterId = "";
    syncAdminRoute("push");
    await renderCurrentSection();
  });

};

const getAdminCustomerKey = (record, fallbackIndex = 0) => {
  const customerId = String(record?.customerId || "").trim();
  const email = String(record?.email || "").trim().toLowerCase();
  const phone = String(record?.phone || record?.customerPhone || "").trim();
  const name = String(record?.customerName || "").trim().toLowerCase();
  if (customerId) return `id:${customerId}`;
  if (email) return `email:${email}`;
  if (phone) return `phone:${phone}`;
  return `name:${name || "customer"}:${fallbackIndex}`;
};

const formatAdminCurrencyTotals = (entries) => {
  const totals = (Array.isArray(entries) ? entries : []).reduce((result, entry) => {
    const currency = String(entry?.currency || "USD").toUpperCase();
    result[currency] = Number(result[currency] || 0) + parseMoneyValue(entry?.totalAmount || entry?.subtotal || 0);
    return result;
  }, {});
  return Object.entries(totals).map(([currency, value]) => formatMoney(value, currency)).join(" / ") || formatMoney(0, "USD");
};

const buildAdminCustomerRecords = (orders, conversations) => {
  const records = new Map();
  const aliases = new Map();
  const upsert = (source, index) => {
    const sourceAliases = [
      String(source?.customerId || "").trim() ? `id:${String(source.customerId).trim()}` : "",
      String(source?.email || "").trim() ? `email:${String(source.email).trim().toLowerCase()}` : "",
      String(source?.phone || source?.customerPhone || "").trim()
        ? `phone:${String(source.phone || source.customerPhone).trim()}`
        : "",
    ].filter(Boolean);
    const key = sourceAliases.map((alias) => aliases.get(alias)).find(Boolean) || getAdminCustomerKey(source, index);
    if (!records.has(key)) {
      records.set(key, {
        key,
        customerId: String(source?.customerId || "").trim(),
        customerName: String(source?.customerName || "").trim(),
        email: String(source?.email || "").trim(),
        phone: String(source?.phone || source?.customerPhone || "").trim(),
        company: String(source?.company || "").trim(),
        country: String(source?.country || "").trim(),
        customerType: String(source?.customerType || "").trim(),
        customerStatus: String(source?.customerStatus || "").trim(),
        createdAt: String(source?.createdAt || "").trim(),
        lastActivity: String(source?.updatedAt || source?.lastMessageAt || source?.createdAt || "").trim(),
        orders: [],
        conversations: [],
      });
    }
    sourceAliases.forEach((alias) => aliases.set(alias, key));

    const customer = records.get(key);
    customer.customerId ||= String(source?.customerId || "").trim();
    customer.customerName ||= String(source?.customerName || "").trim();
    customer.email ||= String(source?.email || "").trim();
    customer.phone ||= String(source?.phone || source?.customerPhone || "").trim();
    customer.company ||= String(source?.company || "").trim();
    customer.country ||= String(source?.country || "").trim();
    customer.customerType ||= String(source?.customerType || "").trim();
    customer.customerStatus ||= String(source?.customerStatus || "").trim();
    const sourceCreatedAt = String(source?.createdAt || "").trim();
    if (sourceCreatedAt && (!customer.createdAt || new Date(sourceCreatedAt) < new Date(customer.createdAt))) {
      customer.createdAt = sourceCreatedAt;
    }
    const activity = String(source?.lastMessageAt || source?.updatedAt || source?.createdAt || "").trim();
    if (activity && (!customer.lastActivity || new Date(activity) > new Date(customer.lastActivity))) {
      customer.lastActivity = activity;
    }
    return customer;
  };

  (Array.isArray(conversations) ? conversations : []).forEach((conversation, index) => {
    const customer = upsert(conversation, index);
    customer.conversations.push(conversation);
  });
  (Array.isArray(orders) ? orders : []).forEach((order, index) => {
    const customer = upsert(order, index + 100000);
    customer.orders.push(order);
  });

  return Array.from(records.values())
    .map((customer) => {
      customer.orders.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
      customer.conversations.sort((left, right) => new Date(right.lastMessageAt || right.updatedAt).getTime() - new Date(left.lastMessageAt || left.updatedAt).getTime());
      const wholesale = customer.orders.some((order) => normalizeStatusValue(order.purchaseMode) === "wholesale") ||
        customer.conversations.some((conversation) => normalizeStatusValue(conversation.conversationType) === "wholesale_inquiry");
      const customerType = normalizeStatusValue(customer.customerType);
      customer.customerType = ["wholesale", "b2b"].includes(customerType)
        ? "wholesale"
        : ["retail", "b2c"].includes(customerType)
          ? "retail"
          : wholesale
            ? "wholesale"
            : "retail";
      customer.customerStatus = normalizeStatusValue(customer.customerStatus) || (customer.orders.length ? "active" : "new");
      customer.totalSpend = formatAdminCurrencyTotals(customer.orders);
      customer.averageOrderValue = customer.orders.length
        ? formatAdminCurrencyTotals(customer.orders.map((order) => ({ ...order, totalAmount: parseMoneyValue(order.totalAmount || order.subtotal) / customer.orders.filter((item) => String(item.currency || "USD").toUpperCase() === String(order.currency || "USD").toUpperCase()).length })))
        : formatMoney(0, "USD");
      return customer;
    })
    .sort((left, right) => new Date(right.lastActivity || 0).getTime() - new Date(left.lastActivity || 0).getTime());
};

const renderAdminCustomerDetail = (customer) => {
  const recentOrders = customer.orders.slice(0, 5);
  const lastOrder = customer.orders[0] || null;
  const lastConversation = customer.conversations[0] || null;
  return `
    <div class="admin-stack admin-customer-record-detail">
      <div class="admin-page-actions"><button class="admin-secondary-button" type="button" id="customer-list-back">Back to Customers</button></div>
      <section class="admin-customer-record-header">
        <span class="admin-customer-avatar">${escapeHtml((customer.customerName || customer.email || "C").slice(0, 1).toUpperCase())}</span>
        <div><p class="admin-order-overline">Customer</p><h3>${escapeHtml(customer.customerName || "Customer")}</h3><p>${escapeHtml(customer.email || "No email")}</p></div>
        <span class="admin-pill ${getAdminPillStatusClass(customer.customerStatus)}">${escapeHtml(formatStatusLabel(customer.customerStatus))}</span>
      </section>

      <div class="admin-customer-detail-columns">
        <section class="admin-panel"><div class="admin-section-head"><h4>Profile</h4></div><dl class="admin-description-grid">
          <div><dt>Name</dt><dd>${escapeHtml(customer.customerName || "-")}</dd></div>
          <div><dt>Email</dt><dd class="admin-break-anywhere">${escapeHtml(customer.email || "-")}</dd></div>
          <div><dt>Company</dt><dd>${escapeHtml(customer.company || "-")}</dd></div>
          <div><dt>Country</dt><dd>${escapeHtml(customer.country || "-")}</dd></div>
          <div><dt>Customer Type</dt><dd>${escapeHtml(formatStatusLabel(customer.customerType))}</dd></div>
          <div><dt>Created</dt><dd>${escapeHtml(formatDate(customer.createdAt))}</dd></div>
        </dl></section>
        <section class="admin-panel"><div class="admin-section-head"><h4>Commercial Summary</h4></div><dl class="admin-description-grid">
          <div><dt>Orders</dt><dd>${formatNumber(customer.orders.length)}</dd></div>
          <div><dt>Total Spend</dt><dd>${escapeHtml(customer.totalSpend)}</dd></div>
          <div><dt>Average Order Value</dt><dd>${escapeHtml(customer.averageOrderValue)}</dd></div>
          <div><dt>Last Order</dt><dd>${escapeHtml(lastOrder?.orderNumber || lastOrder?.orderId || "-")}</dd></div>
        </dl></section>
      </div>

      <section class="admin-panel"><div class="admin-section-head"><h4>Recent Orders</h4></div>${recentOrders.length ? `<div class="admin-table-shell"><table class="admin-table"><thead><tr><th>Order #</th><th>Total</th><th>Order Status</th><th>Created</th><th>Action</th></tr></thead><tbody>${recentOrders.map((order) => `<tr><td class="admin-mono">${escapeHtml(order.orderNumber || order.orderId || order.id)}</td><td>${escapeHtml(order.totalAmount || order.subtotal || "-")}</td><td><span class="admin-pill ${getAdminPillStatusClass(order.orderStatus)}">${escapeHtml(formatStatusLabel(order.orderStatus))}</span></td><td>${escapeHtml(formatShortDate(order.createdAt))}</td><td><button class="admin-secondary-button admin-table-action" type="button" data-customer-record-order="${escapeHtml(order.id)}">View</button></td></tr>`).join("")}</tbody></table></div>` : renderEmptyState("No orders", "This customer has no orders yet.")}</section>

      <section class="admin-panel"><div class="admin-section-head"><h4>Recent Inquiries / Support</h4>${lastConversation ? '<button class="admin-primary-button" type="button" id="customer-open-support">Open Support Conversation</button>' : ""}</div>${lastConversation ? `<dl class="admin-description-grid"><div><dt>Last Conversation</dt><dd>${escapeHtml(lastConversation.subject || lastConversation.lastMessageText || "Support conversation")}</dd></div><div><dt>Conversation Status</dt><dd>${escapeHtml(formatStatusLabel(lastConversation.status || "open"))}</dd></div><div><dt>Last Contact</dt><dd>${escapeHtml(formatDate(lastConversation.lastMessageAt || lastConversation.updatedAt))}</dd></div></dl>` : renderEmptyState("No support conversations", "No recent customer inquiry is linked to this record.")}</section>
    </div>
  `;
};

const renderCustomerListSection = async () => {
  const [orders, conversations] = await Promise.all([fetchAdminOrders(), fetchAdminSupportConversations()]);
  const customers = buildAdminCustomerRecords(orders, conversations);
  const selected = customers.find((customer) => customer.key === adminState.customerList.selectedKey) || null;
  if (adminState.customerList.mode === "detail" && selected) {
    contentRoot.innerHTML = renderAdminCustomerDetail(selected);
    document.querySelector("#customer-list-back")?.addEventListener("click", async () => {
      adminState.customerList.mode = "list";
      await renderCurrentSection();
    });
    document.querySelector("#customer-open-support")?.addEventListener("click", async () => {
      adminState.activeSection = "support";
      adminState.customers.selectedId = selected.conversations[0]?.id || null;
      adminState.customers.detailsOpen = false;
      syncAdminRoute("push");
      await renderCurrentSection();
    });
    contentRoot.querySelectorAll("[data-customer-record-order]").forEach((button) => button.addEventListener("click", async () => {
      await openAdminOrderDetail(button.dataset.customerRecordOrder || null);
    }));
    return;
  }

  adminState.customerList.mode = "list";
  const query = adminState.customerList.query.trim().toLowerCase();
  const countries = Array.from(new Set(customers.map((customer) => customer.country).filter(Boolean))).sort();
  const statuses = Array.from(new Set(customers.map((customer) => customer.customerStatus).filter(Boolean))).sort();
  const filtered = customers.filter((customer) => {
    if (adminState.customerList.type !== "all" && customer.customerType !== adminState.customerList.type) return false;
    if (adminState.customerList.country !== "all" && customer.country !== adminState.customerList.country) return false;
    if (adminState.customerList.status !== "all" && customer.customerStatus !== adminState.customerList.status) return false;
    if (!query) return true;
    return [customer.customerName, customer.email, customer.company, customer.country].join(" ").toLowerCase().includes(query);
  });

  contentRoot.innerHTML = `
    <div class="admin-stack admin-customer-records">
      <section class="admin-panel admin-customer-records-toolbar">
        <div class="admin-panel-header"><div><h3>Customers</h3><p>Manage customer records and account activity.</p></div><strong>${formatNumber(customers.length)} customers</strong></div>
        <div class="admin-toolbar admin-commerce-toolbar">
          <label class="admin-search-field"><span>Search</span><input id="customer-list-search" class="admin-search-input" type="search" placeholder="Search name, email, company or country" value="${escapeHtml(adminState.customerList.query)}"></label>
          <div class="admin-customer-record-filter-grid">
            <label>Customer Type<select id="customer-list-type"><option value="all">All</option><option value="retail" ${adminState.customerList.type === "retail" ? "selected" : ""}>Retail</option><option value="wholesale" ${adminState.customerList.type === "wholesale" ? "selected" : ""}>Wholesale</option></select></label>
            <label>Country<select id="customer-list-country"><option value="all">All</option>${countries.map((country) => `<option value="${escapeHtml(country)}" ${adminState.customerList.country === country ? "selected" : ""}>${escapeHtml(country)}</option>`).join("")}</select></label>
            <label>Status<select id="customer-list-status"><option value="all">All</option>${statuses.map((status) => `<option value="${escapeHtml(status)}" ${adminState.customerList.status === status ? "selected" : ""}>${escapeHtml(formatStatusLabel(status))}</option>`).join("")}</select></label>
          </div>
        </div>
      </section>
      <section class="admin-panel"><div class="admin-panel-header"><div><h4>Customer Records</h4><p>${formatNumber(filtered.length)} result${filtered.length === 1 ? "" : "s"}</p></div></div>${filtered.length ? `<div class="admin-table-shell admin-commerce-table-shell"><table class="admin-table admin-commerce-table admin-customer-records-table"><thead><tr><th>Customer</th><th>Company</th><th>Country</th><th>Type</th><th>Orders</th><th>Total Spend</th><th>Last Activity</th><th>Status</th><th>Action</th></tr></thead><tbody>${filtered.map((customer) => `<tr><td><strong>${escapeHtml(customer.customerName || "Customer")}</strong><small>${escapeHtml(customer.email || "No email")}</small></td><td>${escapeHtml(customer.company || "-")}</td><td>${escapeHtml(customer.country || "-")}</td><td>${escapeHtml(formatStatusLabel(customer.customerType))}</td><td>${formatNumber(customer.orders.length)}</td><td class="admin-table-strong">${escapeHtml(customer.totalSpend)}</td><td>${escapeHtml(formatShortDate(customer.lastActivity))}</td><td><span class="admin-pill ${getAdminPillStatusClass(customer.customerStatus)}">${escapeHtml(formatStatusLabel(customer.customerStatus))}</span></td><td><button class="admin-secondary-button admin-table-action" type="button" data-customer-record="${escapeHtml(customer.key)}">View</button></td></tr>`).join("")}</tbody></table></div>` : renderEmptyState("No customers found", "Adjust the filters to view customer records.")}</section>
    </div>
  `;

  document.querySelector("#customer-list-search")?.addEventListener("input", async (event) => {
    adminState.customerList.query = event.target.value;
    await renderCurrentSection();
  });
  [["#customer-list-type", "type"], ["#customer-list-country", "country"], ["#customer-list-status", "status"]].forEach(([selector, key]) => {
    document.querySelector(selector)?.addEventListener("change", async (event) => {
      adminState.customerList[key] = event.target.value || "all";
      await renderCurrentSection();
    });
  });
  contentRoot.querySelectorAll("[data-customer-record]").forEach((button) => button.addEventListener("click", async () => {
    adminState.customerList.selectedKey = button.dataset.customerRecord || null;
    adminState.customerList.mode = "detail";
    await renderCurrentSection();
  }));
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
  const countNode = contentRoot.querySelector(".admin-thread-count");
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
      adminState.customers.detailsOpen = false;
      if (isAdminSupportCompactViewport()) {
        adminState.customers.mobileView = "chat";
      }
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
    summaryNode.innerHTML = `
      ${selected.country ? `<span class="admin-chat-header-country">${escapeHtml(selected.country)}</span>` : ""}
      <span>${escapeHtml(getAdminConversationContextLabel(selected))}</span>
    `;
  }

  const liveNode = headerRoot.querySelector("#admin-support-live-status");
  if (liveNode) {
    liveNode.textContent = getAdminSupportLiveLabel(adminSupportRuntime.liveState);
    liveNode.dataset.state = adminSupportRuntime.liveState || "idle";
  }

  const titleNode = headerRoot.querySelector(".admin-chat-header-title");
  if (titleNode) {
    titleNode.textContent = selected.customerName || "Website Visitor";
  }

  const avatarNode = headerRoot.querySelector(".admin-chat-header-avatar");
  if (avatarNode) {
    avatarNode.textContent = String(selected.customerName || selected.email || "C")
      .trim()
      .slice(0, 1)
      .toUpperCase();
  }

  const statusBadge = headerRoot.querySelector(".admin-chat-header-status");
  if (statusBadge) {
    statusBadge.textContent = formatStatusLabel(selected.status || "open");
    statusBadge.className = `admin-pill admin-chat-header-status ${getStatusClass(selected.status || "open")}`;
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
  const maxHeight = 140;
  const nextHeight = Math.min(Math.max(textarea.scrollHeight, 88), maxHeight);
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

const createCustomerPanelMarkup = (selected, customerOrders = []) => {
  if (!selected) {
    return `
      <aside class="admin-panel admin-customer-panel">
        <div class="admin-support-drawer-head">
          <div><span>Customer</span><h3>Customer Details</h3></div>
          <button class="admin-icon-button" type="button" id="support-customer-details-close" aria-label="Close customer details">&times;</button>
        </div>
        ${renderEmptyState("Customer details", "Select a conversation to view customer information.")}
      </aside>
    `;
  }

  const totalSpend = getSupportCustomerSpend(customerOrders);
  const recentOrders = customerOrders.slice(0, 3);

  return `
    <aside class="admin-panel admin-customer-panel">
      <div class="admin-support-drawer-head">
        <div><span>Customer</span><h3>Customer Details</h3></div>
        <button class="admin-icon-button" type="button" id="support-customer-details-close" aria-label="Close customer details">&times;</button>
      </div>
      <div class="admin-support-drawer-profile">
        <span class="admin-customer-avatar">${escapeHtml((selected.customerName || selected.email || "C").slice(0, 1).toUpperCase())}</span>
        <div><h4>${escapeHtml(selected.customerName || "Website Visitor")}</h4><p class="admin-break-anywhere">${escapeHtml(selected.email || "No email")}</p></div>
      </div>
      <div class="admin-support-drawer-stats">
        <div><span>Orders</span><strong>${formatNumber(customerOrders.length)}</strong></div>
        <div><span>Total Spend</span><strong>${escapeHtml(formatMoney(totalSpend, customerOrders[0]?.currency || "USD"))}</strong></div>
      </div>
      <section class="admin-support-drawer-section">
        <h4>Profile</h4>
        <dl class="admin-support-customer-fields">
          <div><dt>Name</dt><dd>${escapeHtml(selected.customerName || "Not set")}</dd></div>
          <div><dt>Email</dt><dd class="admin-break-anywhere">${escapeHtml(selected.email || "Not set")}</dd></div>
          <div><dt>Country</dt><dd>${escapeHtml(selected.country || "Not set")}</dd></div>
          <div><dt>Company</dt><dd>${escapeHtml(selected.company || "Not set")}</dd></div>
          <div><dt>Phone</dt><dd>${escapeHtml(selected.customerPhone || selected.phone || "Not set")}</dd></div>
          <div><dt>Customer Type</dt><dd>${escapeHtml(formatStatusLabel(selected.customerType || selected.conversationType || "retail"))}</dd></div>
          <div><dt>Last Activity</dt><dd>${escapeHtml(formatDate(selected.lastMessageAt || selected.updatedAt))}</dd></div>
        </dl>
      </section>
      <section class="admin-support-drawer-section">
        <h4>Recent Orders</h4>
        ${recentOrders.length ? `<div class="admin-support-drawer-orders">${recentOrders.map((order) => `
          <button type="button" data-customer-order-id="${escapeHtml(order.id)}">
            <span><strong>${escapeHtml(order.orderNumber || order.orderId || order.id || "-")}</strong><small>${escapeHtml(formatStatusLabel(order.orderStatus || order.status || "pending"))}</small></span>
            <strong>${escapeHtml(formatMoney(order.totalAmount || order.subtotal || 0, order.currency || "USD"))}</strong>
          </button>
        `).join("")}</div>` : '<p class="admin-muted">No recent orders.</p>'}
      </section>
    </aside>
  `;
};

const renderCustomersSectionView = (options = {}) => {
  const preservedDraft = options.clearDraft ? "" : getAdminSupportComposerDraft();
  const conversations = adminSupportRuntime.conversations;
  const selected = getSelectedSupportConversation();
  const messages = adminSupportRuntime.messages;
  const customerOrders = Array.isArray(adminSupportRuntime.customerOrders) ? adminSupportRuntime.customerOrders : [];
  const detailError = adminSupportRuntime.detailError;
  const compactSupportViewport = isAdminSupportCompactViewport();
  const activeMobileView = compactSupportViewport
    ? selected
      ? adminState.customers.mobileView === "list"
        ? "list"
        : "chat"
      : "list"
    : "chat";
  const showThreadList = !compactSupportViewport || activeMobileView === "list";
  const showChatPanel = !compactSupportViewport || activeMobileView === "chat";
  const showCustomerDrawer = Boolean(selected && adminState.customers.detailsOpen);
  const headerSummary = getSupportConversationHeaderSummary(selected, customerOrders);

  adminSupportRuntime.selected = selected;
  adminState.customers.mobileView = activeMobileView;

  contentRoot.innerHTML = `
    <div class="admin-stack admin-support-shell ${compactSupportViewport ? "is-compact" : "is-desktop"} ${showCustomerDrawer ? "has-customer-drawer" : ""}">
      <div class="admin-chat-layout admin-support-layout" data-support-view="${escapeHtml(activeMobileView)}">
        <section class="admin-panel admin-thread-panel" ${showThreadList ? "" : "hidden"}>
          <div class="admin-thread-panel-head">
            <div class="admin-panel-header admin-panel-header-compact admin-thread-panel-header">
              <div>
                <h3>Support</h3>
                <p class="admin-thread-count">${formatNumber(conversations.length)} active conversation${
                  conversations.length === 1 ? "" : "s"
                }</p>
              </div>
            </div>
            <div class="admin-thread-toolbar">
              <label class="admin-search-field admin-search-field-compact">
                <input
                  id="support-search"
                  class="admin-search-input"
                  type="search"
                  placeholder="Search conversations..."
                  value="${escapeHtml(adminState.customers.query)}"
                >
              </label>
              <div class="admin-support-filter-chips" aria-label="Conversation status filter">
                ${[
                  ["all", "All"],
                  ["waiting_admin", "Waiting"],
                  ["open", "Open"],
                  ["resolved", "Resolved"],
                ].map(([value, label]) => `<button type="button" data-support-status-filter="${value}" class="${adminState.customers.status === value ? "is-active" : ""}">${label}</button>`).join("")}
              </div>
            </div>
          </div>
          ${
            conversations.length
              ? `
                <div class="admin-thread-list">
                  ${conversations.map((thread) => createAdminConversationRowMarkup(thread, selected?.id)).join("")}
                </div>
              `
              : renderEmptyState("No customer conversations yet", "Support chats will appear here.")
          }
        </section>

        <section class="admin-panel admin-chat-panel" ${showChatPanel ? "" : "hidden"}>
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
                    ${
                      compactSupportViewport
                        ? '<button class="admin-secondary-button admin-support-back" type="button" id="support-mobile-back">Back to list</button>'
                        : ""
                    }
                    <div class="admin-chat-header-main admin-chat-header-profile">
                      <span class="admin-chat-header-avatar" aria-hidden="true">${escapeHtml(
                        String(selected.customerName || selected.email || "C")
                          .trim()
                          .slice(0, 1)
                          .toUpperCase()
                      )}</span>
                      <div class="admin-chat-header-copy">
                        <h3 class="admin-chat-header-title">${escapeHtml(selected.customerName || "Website Visitor")}</h3>
                        <p class="admin-chat-header-email">${escapeHtml(selected.email || "No email")}</p>
                        <p class="admin-chat-header-context">${escapeHtml(formatStatusLabel(selected.customerType || selected.conversationType || "retail"))} &middot; ${escapeHtml(headerSummary.orderNumber)}</p>
                      </div>
                    </div>
                    <div class="admin-chat-header-actions">
                      <label class="admin-chat-status-control">
                        <span class="admin-visually-hidden">Conversation status</span>
                        <select id="thread-status-select">
                          ${SUPPORT_CONVERSATION_STATUSES.map(
                            (status) => `
                              <option value="${status}" ${selected.status === status ? "selected" : ""}>${formatStatusLabel(status)}</option>
                            `
                          ).join("")}
                        </select>
                      </label>
                      ${["resolved", "closed"].includes(selected.status)
                        ? '<button class="admin-secondary-button" type="button" id="thread-reopen-button">Reopen</button>'
                        : '<button class="admin-secondary-button" type="button" id="thread-resolve-button">Resolve</button>'}
                      <button class="admin-secondary-button" type="button" id="support-customer-details-toggle">Customer Details</button>
                    </div>
                  </div>

                  <div class="admin-chat-history">
                    ${
                      messages.length
                        ? messages.map((message) => createAdminChatMessageMarkup(message, selected)).join("")
                        : renderEmptyState("No messages yet", "Send the first reply from this panel.")
                    }
                  </div>

                  <div class="admin-chat-footer">
                    <form class="admin-chat-composer" id="customer-reply-form">
                      <textarea name="text" rows="3" placeholder="Write a reply..."></textarea>
                      <div class="admin-chat-composer-actions">
                        <label class="admin-file-field admin-chat-attach">
                          <input type="file" name="image" accept="image/*">
                          <span>Attach</span>
                        </label>
                        <details class="admin-quick-replies-drawer">
                          <summary>Quick Reply</summary>
                          <div class="admin-quick-replies">
                            ${SUPPORT_QUICK_REPLIES.map(
                              (reply) => `
                                <button type="button" class="admin-quick-reply" data-quick-reply="${escapeHtml(reply)}">
                                  ${escapeHtml(reply)}
                                </button>
                              `
                            ).join("")}
                          </div>
                        </details>
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

        <button class="admin-support-drawer-backdrop" type="button" id="support-customer-details-backdrop" aria-label="Close customer details" ${showCustomerDrawer ? "" : "hidden"}></button>
        <div class="admin-support-crm-wrap ${showCustomerDrawer ? "is-open" : ""}" aria-hidden="${showCustomerDrawer ? "false" : "true"}">
          ${createCustomerPanelMarkup(selected, customerOrders)}
        </div>
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

  contentRoot.querySelectorAll("[data-support-status-filter]").forEach((button) => {
    button.addEventListener("click", async () => {
      adminState.customers.status = button.dataset.supportStatusFilter || "all";
      await renderCurrentSection();
    });
  });

  document.querySelector("#support-mobile-back")?.addEventListener("click", () => {
    adminState.customers.mobileView = "list";
    adminState.customers.detailsOpen = false;
    renderCustomersSectionView();
  });

  document.querySelector("#support-customer-details-toggle")?.addEventListener("click", () => {
    adminState.customers.detailsOpen = true;
    renderCustomersSectionView();
  });

  ["#support-customer-details-close", "#support-customer-details-backdrop"].forEach((selector) => {
    document.querySelector(selector)?.addEventListener("click", () => {
      adminState.customers.detailsOpen = false;
      renderCustomersSectionView();
    });
  });

  updateAdminConversationListDom();

  contentRoot.querySelectorAll("[data-customer-order-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openAdminOrderDetail(button.dataset.customerOrderId || null);
    });
  });

  document.querySelector("#customer-profile-status")?.addEventListener("change", async (event) => {
    if (!selected?.customerId) return;
    await requestJson(`/api/admin/customers/${encodeURIComponent(selected.customerId)}`, {
      method: "PATCH",
      body: JSON.stringify({ customerStatus: event.target.value }),
    });
    selected.customerStatus = event.target.value;
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
      syncAdminReplyTextareaHeight(form.querySelector("textarea"));
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
  if (adminState.activeSection !== "support" || adminSupportRuntime.isSending || adminSupportRuntime.isMessagePolling) {
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
  if (adminState.activeSection !== "support" || adminSupportRuntime.isListPolling) {
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
  if (adminState.activeSection !== "support") {
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

let lastAdminSupportCompactViewport = isAdminSupportCompactViewport();
window.addEventListener("resize", () => {
  const nextCompact = isAdminSupportCompactViewport();
  if (nextCompact === lastAdminSupportCompactViewport) {
    return;
  }

  lastAdminSupportCompactViewport = nextCompact;
  if (adminState.activeSection !== "support") {
    return;
  }

  adminState.customers.mobileView = nextCompact ? (adminState.customers.selectedId ? "chat" : "list") : "chat";
  renderCustomersSectionView();
});

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

  adminState.customers.mobileView = isAdminSupportCompactViewport()
    ? adminState.customers.selectedId
      ? adminState.customers.mobileView === "list"
        ? "list"
        : "chat"
      : "list"
    : "chat";
  renderCustomersSectionView();
  startAdminSupportLiveSync();
};

const renderProductTable = (products) => `
  <div class="admin-table-shell">
    <table class="admin-table">
      <thead>
        <tr>
          <th><input type="checkbox" id="admin-product-select-all" ${products.length && products.every((product) => adminState.products.selectedIds.includes(product.id)) ? "checked" : ""}></th>
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
                <td><input type="checkbox" data-product-select="${escapeHtml(product.id)}" ${adminState.products.selectedIds.includes(product.id) ? "checked" : ""}></td>
                <td><img class="admin-image-thumb" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}"></td>
                <td>${escapeHtml(product.name)}</td>
                <td>${escapeHtml(product.category)}</td>
                <td>${escapeHtml(product.price)}</td>
                <td>${escapeHtml(product.moq)}</td>
                <td>${escapeHtml(product.shippingTime)}</td>
                <td>${escapeHtml(product.stock)}</td>
                <td><span class="admin-pill ${getStatusClass(product.status)}">${escapeHtml(formatProductStatusLabel(product.status))}</span></td>
                <td>
                  <div class="admin-actions-inline">
                    <button class="admin-secondary-button" type="button" data-product-edit="${escapeHtml(product.id)}">Quick Edit</button>
                    <button class="admin-secondary-button" type="button" data-product-preview="${escapeHtml(product.id)}">Preview</button>
                    <button class="admin-secondary-button" type="button" data-product-duplicate="${escapeHtml(product.id)}">Duplicate</button>
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
  const query = adminState.products.query.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    if (adminState.products.status !== "all" && String(product.status || "").toLowerCase() !== adminState.products.status) {
      return false;
    }

    return !query || [product.id, product.name, product.category, product.status].join(" ").toLowerCase().includes(query);
  });

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
        <div class="admin-library-toolbar">
          <label class="admin-search-field">Search<input id="admin-product-search" type="search" value="${escapeHtml(adminState.products.query)}" placeholder="Name, category, status"></label>
          <label>
            Status
            <select id="admin-product-status-filter">
              <option value="all" ${adminState.products.status === "all" ? "selected" : ""}>All</option>
              <option value="active" ${adminState.products.status === "active" ? "selected" : ""}>Published</option>
              <option value="draft" ${adminState.products.status === "draft" ? "selected" : ""}>Draft</option>
              <option value="hidden" ${adminState.products.status === "hidden" ? "selected" : ""}>Hidden</option>
              <option value="archived" ${adminState.products.status === "archived" ? "selected" : ""}>Archived</option>
            </select>
          </label>
          <label>
            Bulk Action
            <select id="admin-product-bulk-action">
              <option value="">Select action</option>
              <option value="publish">Publish</option>
              <option value="draft">Move to Draft</option>
              <option value="hidden">Hide</option>
              <option value="archived">Archive</option>
              <option value="delete">Delete</option>
            </select>
          </label>
          <button class="admin-secondary-button" type="button" id="admin-product-bulk-apply" ${adminState.products.selectedIds.length ? "" : "disabled"}>Apply</button>
        </div>
        ${
          filteredProducts.length
            ? renderProductTable(filteredProducts)
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

  document.querySelector("#admin-product-search")?.addEventListener("input", async (event) => {
    adminState.products.query = event.target.value || "";
    await renderProductListSection();
  });

  document.querySelector("#admin-product-status-filter")?.addEventListener("change", async (event) => {
    adminState.products.status = event.target.value || "all";
    await renderProductListSection();
  });

  document.querySelector("#admin-product-select-all")?.addEventListener("change", (event) => {
    adminState.products.selectedIds = event.target.checked ? filteredProducts.map((product) => product.id) : [];
    renderProductListSection();
  });

  contentRoot.querySelectorAll("[data-product-select]").forEach((checkbox) => {
    checkbox.addEventListener("change", async (event) => {
      const productId = event.target.dataset.productSelect;
      const selectedIds = new Set(adminState.products.selectedIds);
      if (event.target.checked) selectedIds.add(productId);
      else selectedIds.delete(productId);
      adminState.products.selectedIds = Array.from(selectedIds);
      await renderProductListSection();
    });
  });

  contentRoot.querySelectorAll("[data-product-preview]").forEach((button) => button.addEventListener("click", () => {
    window.open(`/detail?id=${encodeURIComponent(button.dataset.productPreview)}`, "_blank", "noopener");
  }));

  contentRoot.querySelectorAll("[data-product-duplicate]").forEach((button) => button.addEventListener("click", async () => {
    const source = await window.NorthstarStore.getProductById(button.dataset.productDuplicate);
    if (!source) return;
    const suffix = Date.now().toString(36);
    await window.NorthstarStore.upsertProduct({ ...source, id: `${source.id}-copy-${suffix}`, slug: `${source.slug || source.id}-copy-${suffix}`, name: `${source.name} Copy`, status: "draft", createdAt: undefined });
    adminState.products.selectedIds = [];
    await renderProductListSection();
  }));

  document.querySelector("#admin-product-bulk-apply")?.addEventListener("click", async () => {
    const action = document.querySelector("#admin-product-bulk-action")?.value || "";
    const selectedIds = [...adminState.products.selectedIds];
    if (!action || !selectedIds.length) return;

    if (action === "delete") {
      if (!window.confirm(`Delete ${selectedIds.length} selected product(s)?`)) return;
      for (const productId of selectedIds) {
        await window.NorthstarStore.deleteProduct(productId);
      }
    } else {
      for (const productId of selectedIds) {
        const source = await window.NorthstarStore.getProductById(productId);
        if (!source) continue;
        await window.NorthstarStore.upsertProduct({ ...source, status: action === "publish" ? "active" : action });
      }
    }

    adminState.products.selectedIds = [];
    await renderProductListSection();
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
                  <option value="active" ${product.status === "active" ? "selected" : ""}>Published</option>
                  <option value="draft" ${product.status === "draft" ? "selected" : ""}>Draft</option>
                  <option value="hidden" ${product.status === "hidden" ? "selected" : ""}>Hidden</option>
                  <option value="archived" ${product.status === "archived" ? "selected" : ""}>Archived</option>
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
                      <p>Set independent USD and HKD quantity tiers for wholesale buyers.</p>
                    </div>
                  </div>
                  <div class="admin-settings-tab-row" role="tablist" aria-label="Wholesale tier currencies">
                    ${["USD", "HKD"].map((currency) => `
                      <button
                        type="button"
                        class="admin-settings-tab ${currency === "USD" ? "is-active" : ""}"
                        data-tier-currency="${currency}"
                        aria-selected="${currency === "USD" ? "true" : "false"}"
                      >
                        <span>${currency}</span>
                        <small>${currency} tiers</small>
                      </button>
                    `).join("")}
                  </div>
                  <div class="admin-tier-list" id="product-tier-list">
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
  let activeWholesaleTierCurrency = "USD";
  let wholesaleTierEntries = (Array.isArray(product.b2b?.priceTiers) ? product.b2b.priceTiers : []).map((tier, index) => ({
    id: String(tier?.id || `${product.id || "product"}-tier-${index + 1}`),
    currency: String(tier?.currency || "USD").trim().toUpperCase() || "USD",
    minQuantity: String(tier?.minQuantity ?? product.b2b?.wholesaleMoq ?? product.moqValue ?? 1),
    maxQuantity: String(tier?.maxQuantity ?? 0),
    unitPrice: String(tier?.unitPrice ?? ""),
  }));
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
      <input type="hidden" data-tier-id value="${escapeHtml(tier.id || `${product.id || "product"}-${String(tier.currency || activeWholesaleTierCurrency).trim().toLowerCase()}-${Date.now()}`)}">
      <input type="hidden" data-tier-currency-value value="${escapeHtml(String(tier.currency || activeWholesaleTierCurrency).trim().toUpperCase())}">
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
  const getActiveWholesaleTierRows = () =>
    wholesaleTierEntries.filter(
      (tier) => String(tier.currency || "USD").trim().toUpperCase() === activeWholesaleTierCurrency
    );
  const syncWholesaleTierRowsFromDom = () => {
    const preserved = wholesaleTierEntries.filter(
      (tier) => String(tier.currency || "USD").trim().toUpperCase() !== activeWholesaleTierCurrency
    );
    const nextActiveRows = Array.from(tierList?.querySelectorAll("[data-tier-row]") || [])
      .map((row, index) => ({
        id: String(row.querySelector("[data-tier-id]")?.value || `${product.id || "product"}-${activeWholesaleTierCurrency}-tier-${index + 1}`).trim(),
        currency: activeWholesaleTierCurrency,
        minQuantity: String(row.querySelector("[data-tier-min]")?.value || "").trim(),
        maxQuantity: String(row.querySelector("[data-tier-max]")?.value || "").trim(),
        unitPrice: String(row.querySelector("[data-tier-price]")?.value || "").trim(),
      }))
      .filter((tier) => tier.minQuantity || tier.unitPrice || tier.maxQuantity);
    wholesaleTierEntries = [...preserved, ...nextActiveRows];
  };
  const renderWholesaleTierTabs = () => {
    document.querySelectorAll("[data-tier-currency]").forEach((button) => {
      const isActive = String(button.dataset.tierCurrency || "").trim().toUpperCase() === activeWholesaleTierCurrency;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  };
  const renderWholesaleTierRows = () => {
    if (!tierList) {
      return;
    }
    const rows = getActiveWholesaleTierRows();
    const renderedRows = rows.length
      ? rows
      : [{
          id: `${product.id || "product"}-${activeWholesaleTierCurrency.toLowerCase()}-default`,
          currency: activeWholesaleTierCurrency,
          minQuantity: String(product.b2b?.wholesaleMoq ?? product.moqValue ?? 1),
          maxQuantity: "0",
          unitPrice: "",
        }];
    tierList.innerHTML = renderedRows.map((tier) => createTierRowMarkup(tier)).join("");
    renderWholesaleTierTabs();
  };
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

  renderWholesaleTierRows();

  contentRoot.querySelectorAll("[data-tier-currency]").forEach((button) => {
    button.addEventListener("click", () => {
      syncWholesaleTierRowsFromDom();
      activeWholesaleTierCurrency = String(button.dataset.tierCurrency || "USD").trim().toUpperCase() || "USD";
      renderWholesaleTierRows();
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

    syncWholesaleTierRowsFromDom();
    wholesaleTierEntries.push({
      id: `${product.id || "product"}-${activeWholesaleTierCurrency.toLowerCase()}-${Date.now()}`,
      currency: activeWholesaleTierCurrency,
      minQuantity: String(product.b2b?.wholesaleMoq ?? product.moqValue ?? 1),
      maxQuantity: "0",
      unitPrice: "",
    });
    renderWholesaleTierRows();
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

    syncWholesaleTierRowsFromDom();
    const rows = getActiveWholesaleTierRows();

    if (rows.length <= 1) {
      wholesaleTierEntries = wholesaleTierEntries.filter(
        (tier) => String(tier.currency || "USD").trim().toUpperCase() !== activeWholesaleTierCurrency
      );
      wholesaleTierEntries.push({
        id: "",
        currency: activeWholesaleTierCurrency,
        minQuantity: String(product.b2b?.wholesaleMoq ?? product.moqValue ?? 1),
        maxQuantity: "0",
        unitPrice: "",
      });
      renderWholesaleTierRows();
      return;
    }

    const rowId = String(button.closest("[data-tier-row]")?.querySelector("[data-tier-id]")?.value || "").trim();
    wholesaleTierEntries = wholesaleTierEntries.filter((tier) => {
      if (String(tier.currency || "USD").trim().toUpperCase() !== activeWholesaleTierCurrency) {
        return true;
      }
      return String(tier.id || "").trim() !== rowId;
    });
    renderWholesaleTierRows();
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
    syncWholesaleTierRowsFromDom();
    const wholesalePriceTiers = wholesaleTierEntries
      .map((tier, index) => ({
        id: String(tier.id || `${id}-${String(tier.currency || "USD").trim().toLowerCase()}-tier-${index + 1}`).trim(),
        currency: String(tier.currency || "USD").trim().toUpperCase() || "USD",
        minQuantity: String(tier.minQuantity || "").trim(),
        maxQuantity: String(tier.maxQuantity || "").trim(),
        unitPrice: String(tier.unitPrice || "").trim(),
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
              <p>Logo, website name, brand identity, and favicon.</p>
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
              <h3>Social Links</h3>
              <p>Public-facing social and messaging links.</p>
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

const renderSeoSection = async () => {
  const website = await window.NorthstarStore.getWebsiteSettings();
  const seo = website.seo || {};
  const canonicalBaseUrl = String(seo.canonicalBaseUrl || "https://avelixlink.com").replace(/\/+$/, "");
  const indexingEnabled = seo.allowIndexing !== false;

  contentRoot.innerHTML = `
    <form class="admin-form-stack admin-seo-settings" id="seo-settings-form">
      <div class="admin-panel-header admin-seo-page-header">
        <div>
          <h3>SEO</h3>
          <p>Manage search visibility and social metadata.</p>
        </div>
      </div>

      <div class="admin-seo-grid">
        <section class="admin-panel admin-seo-card">
          <div class="admin-panel-header"><div><h3>Search Appearance</h3><p>Default homepage search result content.</p></div></div>
          <div class="admin-form-grid">
            <label class="full">Site Title<input type="text" name="siteTitle" value="${escapeHtml(website.brand.browserTitle || "")}" required></label>
            <label class="full">Meta Description<textarea name="metaDescription" rows="4" required>${escapeHtml(seo.metaDescription || "")}</textarea></label>
            <details class="full admin-seo-advanced">
              <summary>Advanced</summary>
              <label>Meta Keywords<textarea name="metaKeywords" rows="3">${escapeHtml(seo.metaKeywords || "")}</textarea></label>
            </details>
          </div>
        </section>

        <section class="admin-panel admin-seo-card">
          <div class="admin-panel-header"><div><h3>Search Visibility</h3><p>Control whether public pages may be indexed.</p></div><span class="admin-pill ${indexingEnabled ? "status-paid" : "status-cancelled"}" id="seo-indexing-status">Indexing: ${indexingEnabled ? "Enabled" : "Disabled"}</span></div>
          <label class="admin-payment-toggle-row admin-seo-toggle">
            <span><strong>Allow Search Engine Indexing</strong><small>When disabled, public pages output noindex and robots.txt blocks crawling.</small></span>
            <input type="checkbox" name="allowIndexing" ${indexingEnabled ? "checked" : ""}>
          </label>
        </section>

        <section class="admin-panel admin-seo-card">
          <div class="admin-panel-header"><div><h3>Canonical</h3><p>Canonical URLs are generated automatically for public pages and products.</p></div></div>
          <div class="admin-form-grid">
            <label class="full">Canonical Base URL<input type="url" name="canonicalBaseUrl" value="${escapeHtml(canonicalBaseUrl)}" placeholder="https://avelixlink.com" required></label>
          </div>
        </section>

        <section class="admin-panel admin-seo-card admin-seo-social-card">
          <div class="admin-panel-header"><div><h3>Social Sharing</h3><p>Default Open Graph content used when a page has no product-specific value.</p></div></div>
          <div class="admin-form-grid">
            <label class="full">OG Title<input type="text" name="ogTitle" value="${escapeHtml(seo.ogTitle || website.brand.browserTitle || "")}" required></label>
            <label class="full">OG Description<textarea name="ogDescription" rows="4" required>${escapeHtml(seo.ogDescription || seo.metaDescription || "")}</textarea></label>
            <label class="full">OG Image<input type="url" name="ogImage" value="${escapeHtml(seo.ogImage || website.brand.logoImage || "")}" placeholder="https://..."></label>
          </div>
          <div class="admin-seo-social-preview">
            ${seo.ogImage || website.brand.logoImage ? `<img id="seo-og-preview-image" src="${escapeHtml(seo.ogImage || website.brand.logoImage)}" alt="Open Graph preview">` : '<div id="seo-og-preview-image" class="admin-image-preview placeholder">No OG image configured</div>'}
            <div><span>Social preview</span><strong id="seo-og-preview-title">${escapeHtml(seo.ogTitle || website.brand.browserTitle || "AvelixLink")}</strong><p id="seo-og-preview-description">${escapeHtml(seo.ogDescription || seo.metaDescription || "")}</p></div>
          </div>
        </section>

        <section class="admin-panel admin-seo-card admin-seo-sitemap-card">
          <div class="admin-panel-header"><div><h3>Sitemap</h3><p>Generated automatically from public routes and published products.</p></div><span class="admin-pill status-paid">Active</span></div>
          <div class="admin-seo-sitemap-row"><code>/sitemap.xml</code><a class="admin-secondary-button" href="/sitemap.xml" target="_blank" rel="noopener">Open Sitemap</a></div>
        </section>
      </div>

      <div class="admin-actions-inline"><button class="admin-primary-button" type="submit">Save SEO</button></div>
      <p class="admin-form-status" id="seo-settings-status" aria-live="polite"></p>
    </form>
  `;

  const form = document.querySelector("#seo-settings-form");
  const statusNode = document.querySelector("#seo-settings-status");
  const indexingInput = form?.querySelector('[name="allowIndexing"]');
  const updateIndexingStatus = () => {
    const node = document.querySelector("#seo-indexing-status");
    if (!node) return;
    const enabled = Boolean(indexingInput?.checked);
    node.textContent = `Indexing: ${enabled ? "Enabled" : "Disabled"}`;
    node.className = `admin-pill ${enabled ? "status-paid" : "status-cancelled"}`;
  };
  indexingInput?.addEventListener("change", updateIndexingStatus);

  const syncSocialPreview = () => {
    const title = String(form?.elements.ogTitle?.value || "").trim();
    const description = String(form?.elements.ogDescription?.value || "").trim();
    const imageUrl = String(form?.elements.ogImage?.value || "").trim();
    const titleNode = document.querySelector("#seo-og-preview-title");
    const descriptionNode = document.querySelector("#seo-og-preview-description");
    const imageNode = document.querySelector("#seo-og-preview-image");
    if (titleNode) titleNode.textContent = title || "Social title preview";
    if (descriptionNode) descriptionNode.textContent = description || "Social description preview";
    if (imageNode?.tagName === "IMG" && imageUrl) {
      imageNode.src = imageUrl;
    } else if (imageNode?.tagName === "IMG" && !imageUrl) {
      imageNode.outerHTML = '<div id="seo-og-preview-image" class="admin-image-preview placeholder">No OG image configured</div>';
    } else if (imageNode && imageUrl) {
      imageNode.outerHTML = `<img id="seo-og-preview-image" src="${escapeHtml(imageUrl)}" alt="Open Graph preview">`;
    }
  };
  ["ogTitle", "ogDescription", "ogImage"].forEach((name) => form?.elements[name]?.addEventListener("input", syncSocialPreview));

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const rawCanonicalBaseUrl = String(formData.get("canonicalBaseUrl") || "").trim();
    let normalizedCanonicalBaseUrl = "";
    try {
      const parsedCanonicalUrl = new URL(rawCanonicalBaseUrl);
      if (!['http:', 'https:'].includes(parsedCanonicalUrl.protocol)) throw new Error();
      normalizedCanonicalBaseUrl = parsedCanonicalUrl.origin + parsedCanonicalUrl.pathname.replace(/\/+$/, "");
    } catch (error) {
      statusNode.textContent = "Canonical Base URL must be a valid HTTP or HTTPS URL.";
      statusNode.dataset.state = "error";
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
    statusNode.textContent = "Saving SEO settings...";
    statusNode.dataset.state = "saving";
    try {
      await window.NorthstarStore.updateWebsiteSettings({
        brand: { browserTitle: formData.get("siteTitle") },
        seo: {
          metaDescription: formData.get("metaDescription"),
          metaKeywords: formData.get("metaKeywords"),
          canonicalBaseUrl: normalizedCanonicalBaseUrl,
          allowIndexing: formData.has("allowIndexing"),
          ogTitle: formData.get("ogTitle"),
          ogDescription: formData.get("ogDescription"),
          ogImage: formData.get("ogImage"),
        },
      });
      statusNode.textContent = "SEO settings saved.";
      statusNode.dataset.state = "success";
    } catch (error) {
      statusNode.textContent = error?.message || "Unable to save SEO settings.";
      statusNode.dataset.state = "error";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Save SEO";
    }
  });
};

const renderSettingsSection = async () => {
  await renderSettingsSectionV4();
};

const renderSettingsSectionV4 = async () => {
  const activeSettingsSection = SETTINGS_SECTIONS[getAdminActiveNavSection()]
    ? getAdminActiveNavSection()
    : "general-settings";
  const persistedSettings = await window.NorthstarStore.getSettings();
  const settings =
    activeSettingsSection === "payment-settings" && adminState.settings.paymentDraft
      ? {
          ...persistedSettings,
          ...adminState.settings.paymentDraft,
          paymentMethodCurrencies:
            adminState.settings.paymentDraft.paymentMethodCurrencies || persistedSettings.paymentMethodCurrencies,
          bankTransferSettings: adminState.settings.paymentDraft.bankTransferSettings || persistedSettings.bankTransferSettings,
        }
      : persistedSettings;
  const meta = SETTINGS_SECTIONS[activeSettingsSection];
  const enabledPaymentMethods = getEnabledPaymentMethods(settings.paymentMethods || ["PayPal", "Bank Transfer"]);
  const enabledPaymentKeys = new Set(enabledPaymentMethods.map(normalizePaymentMethodName));
  const paymentMethodCurrencies = settings.paymentMethodCurrencies || { paypal: ["USD"] };
  const paypalCurrencies = Array.isArray(paymentMethodCurrencies.paypal) && paymentMethodCurrencies.paypal.length
    ? paymentMethodCurrencies.paypal.map((currency) => String(currency || "").trim().toUpperCase())
    : ["USD"];
  const bankTransferSettings = settings.bankTransferSettings || {};
  const bankTransferCurrencies = getBankTransferCurrencyState(bankTransferSettings);
  const configuredCurrencies = bankTransferCurrencies.filter((currency) => currency.configured);
  const activeCurrency = bankTransferCurrencies.some((currency) => currency.key === adminState.settings.bankTransferCurrency)
    ? adminState.settings.bankTransferCurrency
    : "usd";
  const activeCurrencyConfig = bankTransferCurrencies.find((currency) => currency.key === activeCurrency) || bankTransferCurrencies[0];
  const activeCurrencyFields = BANK_TRANSFER_ACCOUNT_FIELDS[activeCurrencyConfig?.key || "usd"] || [];
  const bankTransferEnabled = enabledPaymentKeys.has("bank transfer");
  const bankTransferSummary = configuredCurrencies.length
    ? configuredCurrencies.map((currency) => currency.label).join(", ")
    : "No configured currencies yet";

  const renderHeader = () => `
    <header class="admin-page-head admin-settings-head">
      <div>
        <p class="admin-settings-kicker">${escapeHtml(meta.label)}</p>
        <h2>${escapeHtml(meta.title)}</h2>
        <p>${escapeHtml(meta.description)}</p>
      </div>
    </header>
  `;

  const renderGeneralSettings = () => `
    ${renderHeader()}
    <section class="admin-panel admin-settings-panel">
      <div class="admin-settings-empty">
        <strong>No general settings are currently required.</strong>
        <p>Website, SEO, payment, shipping and account configuration are managed in their dedicated sections.</p>
      </div>
    </section>
  `;

  const renderAccountSettings = () => `
    ${renderHeader()}
    <form class="admin-settings-shell" id="settings-form">
      <section class="admin-panel admin-settings-panel">
        <div class="admin-panel-header">
          <div>
            <h3>Administrator Access</h3>
            <p>Update the credentials used to sign in to the admin dashboard.</p>
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
      <div class="admin-actions-inline">
        <button class="admin-primary-button" type="submit">${escapeHtml(meta.submitLabel)}</button>
      </div>
      <p class="admin-form-status" id="settings-form-status"></p>
    </form>
  `;

  const renderShippingSettings = () => `
    ${renderHeader()}
    <section class="admin-panel admin-settings-panel">
      <div class="admin-panel-header">
        <div>
          <h3>Shipping Operations</h3>
          <p>Shipping statuses, lead times, and carrier data are managed directly through orders, products, and payment confirmation workflows.</p>
        </div>
      </div>
      <div class="admin-settings-empty">
        <strong>No standalone shipping settings yet</strong>
        <p>Use Orders and Products to manage lead time, status progression, and fulfillment-specific information without introducing duplicate configuration screens.</p>
      </div>
    </section>
  `;

  const renderPaymentSettings = () => `
    ${renderHeader()}
    <form class="admin-settings-shell" id="settings-form">
      <section class="admin-panel admin-settings-panel">
        <div class="admin-panel-header">
          <div>
            <h3>Payment Methods</h3>
            <p>Enable only the payment providers that are ready to appear in checkout and customer payment flows.</p>
          </div>
        </div>
        <div class="admin-payment-method-list">
          ${ADMIN_PAYMENT_METHOD_OPTIONS.map((method) => {
            const state = getPaymentSettingsMethodState(method, enabledPaymentKeys, {
              ...bankTransferSettings,
              __paypalCurrencies: paypalCurrencies,
            });
            return `
              <label class="admin-payment-method-row ${state.disabled ? "is-disabled" : ""}">
                <div class="admin-payment-method-info">
                  <div class="admin-payment-method-heading">
                    <h4>${escapeHtml(method.label)}</h4>
                    <span class="admin-method-status-badge ${state.status.startsWith("Configured") ? "is-success" : state.status === "Incomplete" ? "is-warning" : ""}">${escapeHtml(state.status)}</span>
                  </div>
                  <p>${escapeHtml(state.note)}</p>
                </div>
                <span class="admin-switch ${state.disabled ? "is-disabled" : ""}" aria-hidden="true">
                  <input
                    type="checkbox"
                    name="${state.disabled ? "" : "paymentMethods"}"
                    value="${escapeHtml(method.label)}"
                    ${state.enabled ? "checked" : ""}
                    ${state.disabled ? "disabled" : ""}
                  >
                  <span class="admin-switch-track"></span>
                  <span class="admin-switch-thumb"></span>
                </span>
              </label>
            `;
          }).join("")}
        </div>
        <div class="admin-form-grid">
          <fieldset class="full">
            <legend>PayPal Supported Currencies</legend>
            <div class="admin-checkbox-cluster">
              ${["USD", "HKD"].map((currency) => `
                <label class="admin-checkbox-field">
                  <input
                    type="checkbox"
                    name="paypalCurrencies"
                    value="${currency}"
                    ${paypalCurrencies.includes(currency) ? "checked" : ""}
                  >
                  <span>${currency}</span>
                </label>
              `).join("")}
            </div>
            <p class="admin-field-hint">Only currencies selected here can show PayPal on checkout and payment pages.</p>
          </fieldset>
        </div>
      </section>

      <section class="admin-panel admin-settings-panel">
        <div class="admin-panel-header">
          <div>
            <h3>SWIFT Bank Transfer Accounts</h3>
            <p>Configure the receiving account shown to customers when SWIFT International Wire Transfer is selected.</p>
          </div>
        </div>
        <div class="admin-settings-summary-row">
          <div class="admin-settings-summary-card">
            <span>Bank Transfer</span>
            <strong>${bankTransferEnabled ? "Enabled" : "Disabled"}</strong>
          </div>
          <div class="admin-settings-summary-card">
            <span>Configured currencies</span>
            <strong>${escapeHtml(bankTransferSummary)}</strong>
          </div>
        </div>
        ${bankTransferEnabled && !configuredCurrencies.length ? `
          <div class="admin-settings-warning">
            <strong>Configuration needed</strong>
            <p>Bank Transfer is enabled, but no complete SWIFT receiving account is available yet. Customers will be blocked from incomplete bank instructions until one currency is fully configured.</p>
          </div>
        ` : ""}
        <div class="admin-settings-tab-row" role="tablist" aria-label="Bank transfer currencies">
          ${bankTransferCurrencies.map((currency) => `
            <button
              type="button"
              class="admin-settings-tab ${currency.key === activeCurrencyConfig.key ? "is-active" : ""}"
              data-bank-currency="${currency.key}"
              aria-selected="${currency.key === activeCurrencyConfig.key ? "true" : "false"}"
            >
              <span>${currency.label}</span>
              <small>${currency.configured ? "Configured" : "Incomplete"}</small>
            </button>
          `).join("")}
        </div>
        <div class="admin-payment-account-shell">
          <div class="admin-payment-account-header">
            <div>
              <h4>${escapeHtml(activeCurrencyConfig.label)} SWIFT Receiving Account</h4>
              <p>Configure the real receiving account used for ${escapeHtml(activeCurrencyConfig.label)} SWIFT transfers.</p>
            </div>
          </div>
          <div class="admin-form-grid">
            ${activeCurrencyFields.map((field) => `
              ${
                field.type === "checkbox"
                  ? `
                    <label class="admin-checkbox-field full">
                      <input
                        type="checkbox"
                        name="${escapeHtml(field.name)}"
                        ${activeCurrencyConfig.details[field.prop] ? "checked" : ""}
                      >
                      <span>${escapeHtml(field.label)}</span>
                    </label>
                  `
                  : field.type === "textarea"
                    ? `
                      <label class="${field.full ? "full" : ""}">
                        ${escapeHtml(field.label)}
                        <textarea name="${escapeHtml(field.name)}" rows="3">${escapeHtml(activeCurrencyConfig.details[field.prop] || "")}</textarea>
                      </label>
                    `
                    : `
                      <label class="${field.full ? "full" : ""}">
                        ${escapeHtml(field.label)}
                        <input
                          type="text"
                          name="${escapeHtml(field.name)}"
                          value="${escapeHtml(activeCurrencyConfig.details[field.prop] || "")}"
                        >
                      </label>
                    `
              }
            `).join("")}
          </div>
        </div>
      </section>

      <div class="admin-actions-inline">
        <button class="admin-primary-button" type="submit">${escapeHtml(meta.submitLabel)}</button>
      </div>
      <p class="admin-form-status" id="settings-form-status"></p>
    </form>
  `;

  if (activeSettingsSection === "general-settings") {
    contentRoot.innerHTML = renderGeneralSettings();
  } else if (activeSettingsSection === "account-settings") {
    contentRoot.innerHTML = renderAccountSettings();
  } else if (activeSettingsSection === "shipping-settings") {
    contentRoot.innerHTML = renderShippingSettings();
  } else {
    contentRoot.innerHTML = renderPaymentSettings();
  }

  contentRoot.querySelectorAll("[data-bank-currency]")?.forEach((tabButton) => {
    tabButton.addEventListener("click", () => {
      const currentForm = document.querySelector("#settings-form");
      if (currentForm && activeSettingsSection === "payment-settings") {
        const formData = new FormData(currentForm);
        adminState.settings.paymentDraft = buildPaymentSettingsDraft(formData, bankTransferSettings);
      }
      adminState.settings.bankTransferCurrency = normalizeCurrencyCode(tabButton.dataset.bankCurrency);
      renderSettingsSectionV4().catch((error) => console.error("[admin] settings rerender failed", error));
    });
  });

  const form = document.querySelector("#settings-form");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
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
      const partial =
        activeSettingsSection === "general-settings"
          ? {
              language: formData.get("language"),
              themeColor: formData.get("themeColor"),
              systemConfig: formData.get("systemConfig"),
            }
          : activeSettingsSection === "account-settings"
            ? {
                adminEmail: formData.get("adminEmail"),
                adminPassword: formData.get("adminPassword"),
                recoveryEmail: formData.get("recoveryEmail"),
              }
            : buildPaymentSettingsDraft(formData, bankTransferSettings);

      const updatedSettings = await window.NorthstarStore.updateSettings(partial);
      adminState.settings.paymentDraft = null;
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
        submitButton.textContent = meta.submitLabel || "Save Changes";
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

  if (adminState.activeSection !== "support") {
    stopAdminSupportLiveSync();
  }

  syncAdminRoute("replace");
  renderAdminNavV4();
  updateTitle();
  renderLoading();

  const sectionTarget = getSectionRenderTarget(adminState.activeSection);

  if (sectionTarget === "dashboard") {
    await renderDashboardSectionV2();
    return;
  }

  if (sectionTarget === "order") {
    await renderOrderDetailSection();
    return;
  }

  if (sectionTarget === "orders") {
    await renderOrdersSection();
    return;
  }

  if (sectionTarget === "payments") {
    await renderPaymentsSection();
    return;
  }

  if (sectionTarget === "support") {
    await renderCustomersSection();
    return;
  }

  if (sectionTarget === "customers") {
    await renderCustomerListSection();
    return;
  }

  if (sectionTarget === "products") {
    await renderProductsSection();
    return;
  }

  if (sectionTarget === "media") {
    await renderMediaSection();
    return;
  }

  if (sectionTarget === "website") {
    await renderWebsiteSection();
    return;
  }

  if (sectionTarget === "seo") {
    await renderSeoSection();
    return;
  }

  await renderSettingsSectionV4();
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
    await refreshNotifications();
    notificationRuntime.timer = window.setInterval(refreshNotifications, 15000);
    await renderCurrentSection();
  } else {
    showLogin();
  }
};

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || adminState.activeSection !== "support") {
    return;
  }

  reconcileCustomersSection();
  pollAdminConversationList();
});

window.addEventListener("online", () => {
  if (adminState.activeSection === "support") {
    setAdminSupportLiveState("reconnecting");
    reconcileCustomersSection();
    pollAdminConversationList();
  }
});

window.addEventListener("offline", () => {
  if (adminState.activeSection === "support") {
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
  const groupToggle = event.target.closest("[data-nav-group-toggle]");
  if (groupToggle) {
    const groupId = String(groupToggle.getAttribute("data-nav-group-toggle") || "").trim();
    if (groupId) {
      setNavGroupExpanded(groupId, !isNavGroupExpanded(groupId));
      renderAdminNavV4();
    }
    return;
  }

  const button = event.target.closest("[data-section]");

  if (!button) {
    return;
  }

  const nextSection = button.dataset.section;

  if (!nextSection || nextSection === adminState.activeSection) {
    return;
  }

  adminState.activeSection = nextSection;
  const nextSectionTarget = getSectionRenderTarget(nextSection);

  if (nextSectionTarget === "orders") {
    adminState.payments.orderFilterId = "";
  }

  if (nextSectionTarget !== "products") {
    adminState.products.mode = "list";
    adminState.products.editingId = null;
  }

  if (nextSectionTarget !== "payments") {
    adminState.payments.mode = "list";
    adminState.payments.selectedId = null;
    adminState.payments.orderFilterId = "";
  }

  syncAdminRoute("push");
  if (isAdminSidebarDrawerViewport()) {
    setAdminSidebarOpen(false);
  }

  await renderCurrentSection();
});

shellToggle?.addEventListener("click", () => {
  setAdminSidebarOpen(!adminState.nav.drawerOpen);
});

sidebarBackdrop?.addEventListener("click", () => {
  setAdminSidebarOpen(false);
});

themeToggle?.addEventListener("click", () => {
  adminState.theme = adminState.theme === "dark" ? "light" : "dark";
  applyTheme();
});

notificationButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  const opening = notificationPopover.classList.contains("is-hidden");
  notificationPopover.classList.toggle("is-hidden", !opening);
  notificationButton.setAttribute("aria-expanded", String(opening));
  globalSearchResults?.classList.add("is-hidden");
});

notificationList?.addEventListener("click", async (event) => {
  const item = event.target.closest("[data-notification-id]");
  if (!item) return;
  await requestJson(`/api/admin/notifications/${encodeURIComponent(item.dataset.notificationId)}/read`, { method: "POST" });
  const current = notificationRuntime.items.find((entry) => entry.id === item.dataset.notificationId);
  if (current) current.isRead = true;
  renderNotificationCenter();
  notificationPopover.classList.add("is-hidden");
  notificationButton.setAttribute("aria-expanded", "false");
  await openAdminEntity(item.dataset.entityType, item.dataset.entityId);
});

markAllReadButton?.addEventListener("click", async () => {
  await requestJson("/api/admin/notifications/read-all", { method: "POST" });
  notificationRuntime.items.forEach((item) => { item.isRead = true; });
  renderNotificationCenter();
});

let globalSearchTimer = null;
globalSearchInput?.addEventListener("input", () => {
  window.clearTimeout(globalSearchTimer);
  const query = globalSearchInput.value.trim();
  if (query.length < 2) { globalSearchResults.classList.add("is-hidden"); return; }
  globalSearchTimer = window.setTimeout(async () => {
    try {
      const payload = await requestJson(`/api/admin/search?q=${encodeURIComponent(query)}`);
      const results = Array.isArray(payload.results) ? payload.results : [];
      globalSearchResults.innerHTML = results.length
        ? results.map((item) => `<button type="button" class="admin-search-result" data-search-type="${escapeHtml(item.type)}" data-search-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.subtitle)}</p><small>${escapeHtml(formatStatusLabel(item.type))}</small></button>`).join("")
        : '<div class="admin-empty-state"><h4>No results</h4><p>Try another customer, order number, product or email.</p></div>';
      globalSearchResults.classList.remove("is-hidden");
    } catch (error) { console.error("[admin] global search failed", error); }
  }, 220);
});

globalSearchResults?.addEventListener("click", async (event) => {
  const result = event.target.closest("[data-search-type]");
  if (!result) return;
  globalSearchResults.classList.add("is-hidden");
  globalSearchInput.value = "";
  await openAdminEntity(result.dataset.searchType, result.dataset.searchId);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".admin-notification-center")) {
    notificationPopover?.classList.add("is-hidden");
    notificationButton?.setAttribute("aria-expanded", "false");
  }
  if (!event.target.closest(".admin-global-search")) globalSearchResults?.classList.add("is-hidden");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && adminState.nav.drawerOpen) {
    setAdminSidebarOpen(false);
  }
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
  setAdminSidebarOpen(false);
  if (await window.NorthstarStore?.refreshAdminSession?.()) {
    await renderCurrentSection();
  }
});

window.addEventListener("resize", () => {
  if (!isAdminSidebarDrawerViewport() && adminState.nav.drawerOpen) {
    setAdminSidebarOpen(false);
  }
});

boot();
