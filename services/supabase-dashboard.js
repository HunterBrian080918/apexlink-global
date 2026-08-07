const { listOrders } = require("./supabase-orders");
const { listPayments, isRevenueStatus } = require("./supabase-payments");
const { listAdminConversations } = require("./supabase-support");
const { listProducts } = require("./supabase-products");
const { listContactMessages } = require("./supabase-contact");
const { listVisitEvents, listDailyStats, getTotals } = require("./supabase-analytics");

const REVENUE_CURRENCY = "USD";

const toDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
};

const startOfUtcDay = (value = new Date()) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

const sum = (items, mapper) =>
  (Array.isArray(items) ? items : []).reduce((total, item) => total + Number(mapper(item) || 0), 0);

const buildDateKeys = (days = 7) => {
  const safeDays = Math.max(1, Number.parseInt(days, 10) || 7);
  const keys = [];
  const today = startOfUtcDay(new Date());
  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const point = new Date(today);
    point.setUTCDate(today.getUTCDate() - offset);
    keys.push(toDateKey(point));
  }
  return keys;
};

const buildTrend = (counts, days = 7) =>
  buildDateKeys(days).map((key) => ({
    key,
    value: Number(counts[key] || 0),
  }));

const buildTrendFromItems = (items, days, dateGetter, valueGetter = () => 1) => {
  const counts = (Array.isArray(items) ? items : []).reduce((accumulator, item) => {
    const key = toDateKey(dateGetter(item));
    if (key) {
      accumulator[key] = (accumulator[key] || 0) + Number(valueGetter(item) || 0);
    }
    return accumulator;
  }, {});
  return buildTrend(counts, days);
};

const getMonthStart = () => {
  const date = startOfUtcDay(new Date());
  date.setUTCDate(1);
  return date.getTime();
};

const normalizeStatus = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

const isPendingOrderStatus = (status) =>
  new Set([
    "pending_payment",
    "awaiting_deposit",
    "awaiting_confirmation",
    "inquiry_received",
    "quote_pending",
  ]).has(normalizeStatus(status));

const isPendingPaymentStatus = (status) =>
  new Set([
    "unpaid",
    "pending",
    "awaiting_payment",
    "payment_submitted",
    "under_review",
    "balance_pending",
  ]).has(normalizeStatus(status));

const visitorKeyForEvent = (event) => {
  const metadata = event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
  return String(metadata.visitorId || metadata.ipAddress || `${metadata.userAgent || ""}:${event?.path || ""}`).trim();
};

const inferTrafficSource = (event) => {
  const metadata = event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
  const explicit = String(metadata.source || "").trim().toLowerCase();
  if (explicit && explicit !== "unknown") {
    return explicit;
  }

  const referrer = String(metadata.referrer || "").trim().toLowerCase();
  if (!referrer) {
    return "direct";
  }
  if (referrer.includes("google.")) return "google";
  if (referrer.includes("bing.")) return "bing";
  if (referrer.includes("tiktok.")) return "tiktok";
  if (referrer.includes("facebook.") || referrer.includes("fb.")) return "facebook";
  if (referrer.includes("instagram.")) return "instagram";
  if (referrer.includes("linkedin.")) return "linkedin";
  if (referrer.includes("twitter.") || referrer.includes("x.com")) return "x";
  if (referrer.includes("youtube.")) return "youtube";
  return "referral";
};

const toDisplayLabel = (value, fallback = "Unknown") =>
  String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (part) => part.toUpperCase()) || fallback;

const buildBreakdown = (items, valueGetter, { limit = 5, fallback = "Unknown" } = {}) => {
  const counts = {};
  (Array.isArray(items) ? items : []).forEach((item) => {
    const raw = String(valueGetter(item) || "").trim().toLowerCase();
    const key = raw || fallback.toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  });

  const total = Object.values(counts).reduce((accumulator, value) => accumulator + Number(value || 0), 0);
  return Object.entries(counts)
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
    .slice(0, limit)
    .map(([key, value]) => ({
      key,
      label: key === fallback.toLowerCase() ? fallback : toDisplayLabel(key, fallback),
      value: Number(value || 0),
      percentage: total > 0 ? Math.round((Number(value || 0) / total) * 100) : 0,
    }));
};

const buildVisitorTrend = (events, days = 7) => {
  const grouped = {};
  (Array.isArray(events) ? events : []).forEach((event) => {
    const key = toDateKey(event.createdAt);
    const visitorKey = visitorKeyForEvent(event);
    if (!key || !visitorKey) {
      return;
    }
    if (!grouped[key]) {
      grouped[key] = new Set();
    }
    grouped[key].add(visitorKey);
  });

  return buildDateKeys(days).map((key) => ({
    key,
    value: grouped[key] ? grouped[key].size : 0,
  }));
};

const buildDashboard = async () => {
  const [visitEvents, dailyStats, totals, orders, payments, conversations, products, contactMessages] =
    await Promise.all([
      listVisitEvents({ days: 30 }),
      listDailyStats({ days: 30 }),
      getTotals(),
      listOrders(),
      listPayments(),
      listAdminConversations({}),
      listProducts(),
      listContactMessages(),
    ]);

  const todayKey = toDateKey();
  const now = Date.now();
  const sevenDaysMs = 7 * 86400000;
  const monthStartMs = getMonthStart();
  const dailyStatMap = (Array.isArray(dailyStats) ? dailyStats : []).reduce((accumulator, stat) => {
    accumulator[stat.eventDate] = stat;
    return accumulator;
  }, {});
  const paidPayments = payments.filter((payment) => isRevenueStatus(payment.status));
  const quoteConversations = conversations.filter((conversation) =>
    ["product_inquiry", "wholesale_inquiry"].includes(String(conversation.conversationType || "").trim().toLowerCase())
  );
  const wholesaleInquiryOrders = orders.filter(
    (order) => String(order.purchaseMode || "").trim().toLowerCase() === "wholesale"
  );
  const inquiryItems = [
    ...contactMessages.map((message) => ({
      id: `contact:${message.id}`,
      createdAt: message.createdAt,
    })),
    ...quoteConversations.map((conversation) => ({
      id: `conversation:${conversation.id}`,
      createdAt: conversation.createdAt,
    })),
    ...wholesaleInquiryOrders.map((order) => ({
      id: `order:${order.id}`,
      createdAt: order.createdAt,
    })),
  ];
  const visitorTrend7 = buildVisitorTrend(visitEvents, 7);
  const visitorTrend30 = buildVisitorTrend(visitEvents, 30);
  const inquiryTrend7 = buildTrendFromItems(inquiryItems, 7, (item) => item.createdAt);
  const pageViewTrend7 = buildDateKeys(7).map((key) => ({
    key,
    value: Number(dailyStatMap[key]?.visitCount || 0),
  }));
  const pageViewTrend30 = buildDateKeys(30).map((key) => ({
    key,
    value: Number(dailyStatMap[key]?.visitCount || 0),
  }));
  const visitorKeysToday = new Set(
    visitEvents.filter((event) => toDateKey(event.createdAt) === todayKey).map((event) => visitorKeyForEvent(event)).filter(Boolean)
  );
  const todayRevenue = sum(
    paidPayments.filter((payment) => toDateKey(payment.paidAt || payment.updatedAt || payment.createdAt) === todayKey),
    (payment) => payment.amount
  );
  const weeklyRevenue = sum(
    paidPayments.filter((payment) => {
      const paidAt = new Date(payment.paidAt || payment.updatedAt || payment.createdAt).getTime();
      return Number.isFinite(paidAt) && now - paidAt <= sevenDaysMs;
    }),
    (payment) => payment.amount
  );
  const monthlyRevenue = sum(
    paidPayments.filter((payment) => {
      const paidAt = new Date(payment.paidAt || payment.updatedAt || payment.createdAt).getTime();
      return Number.isFinite(paidAt) && paidAt >= monthStartMs;
    }),
    (payment) => payment.amount
  );

  return {
    generatedAt: new Date().toISOString(),
    visitors: {
      today: visitorKeysToday.size,
      trend7: visitorTrend7,
      trend30: visitorTrend30,
    },
    pageViews: {
      today: Number(dailyStatMap[todayKey]?.visitCount || 0),
      total: Number(totals.totalVisits || 0),
      trend7: pageViewTrend7,
      trend30: pageViewTrend30,
    },
    inquiries: {
      today: inquiryItems.filter((item) => toDateKey(item.createdAt) === todayKey).length,
      total: inquiryItems.length,
      trend7: inquiryTrend7,
      trend30: buildTrendFromItems(inquiryItems, 30, (item) => item.createdAt),
    },
    conversations: {
      today: conversations.filter((conversation) => toDateKey(conversation.createdAt) === todayKey).length,
      total: conversations.length,
    },
    unreadMessages: {
      total: sum(conversations, (conversation) => conversation.adminUnreadCount),
    },
    pendingPayments: {
      total: payments.filter((payment) => isPendingPaymentStatus(payment.status)).length,
    },
    orders: {
      today: orders.filter((order) => toDateKey(order.createdAt) === todayKey).length,
      total: orders.length,
      pending: orders.filter((order) => isPendingOrderStatus(order.orderStatus)).length,
    },
    revenue: {
      currency: REVENUE_CURRENCY,
      today: todayRevenue,
      weekly: weeklyRevenue,
      monthly: monthlyRevenue,
      total: sum(paidPayments, (payment) => payment.amount),
      trend7: buildTrendFromItems(
        paidPayments,
        7,
        (payment) => payment.paidAt || payment.updatedAt || payment.createdAt,
        (payment) => payment.amount
      ),
      trend30: buildTrendFromItems(
        paidPayments,
        30,
        (payment) => payment.paidAt || payment.updatedAt || payment.createdAt,
        (payment) => payment.amount
      ),
    },
    wholesaleOrders: {
      total: orders.filter((order) => String(order.purchaseMode || "").trim().toLowerCase() === "wholesale").length,
    },
    products: {
      total: products.length,
      published: products.filter((product) => String(product.status || "").trim().toLowerCase() === "active").length,
    },
    recentOrders: orders
      .slice()
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 5),
    recentMessages: conversations
      .slice()
      .sort(
        (left, right) =>
          new Date(right.lastMessageAt || right.updatedAt || right.createdAt).getTime() -
          new Date(left.lastMessageAt || left.updatedAt || left.createdAt).getTime()
      )
      .slice(0, 5),
    trafficSources: buildBreakdown(visitEvents, (event) => inferTrafficSource(event), {
      limit: 6,
      fallback: "Direct",
    }),
    countries: buildBreakdown(
      visitEvents.filter((event) => String(event?.metadata?.country || "").trim()),
      (event) => event.metadata.country,
      {
        limit: 6,
        fallback: "Unknown",
      }
    ),
  };
};

module.exports = {
  buildDashboard,
};
