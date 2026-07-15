(function () {
  const STORAGE_KEY = "northstar-platform-store-v1";
  const VISITOR_THREAD_KEY = "northstar-visitor-thread-id";
  const ADMIN_PASSWORD_MASK = "********";
  const ANALYTICS_VISIT_WINDOW_KEY = "northstar-analytics-visit-window";
  const ANALYTICS_VISIT_COOLDOWN_MS = 30 * 60 * 1000;
  const DEMO_INQUIRY_IDS = new Set(["inq-demo-001", "inq-demo-002"]);
  const DEMO_THREAD_IDS = new Set(["msg-demo-001", "msg-demo-002"]);

  let state = null;
  let initPromise = null;
  let adminSession = null;
  let hasServerAdminAccount = false;
  let publicSiteConfigCache = null;
  let publicSiteConfigPromise = null;
  let adminSiteConfigCache = null;
  let adminSiteConfigPromise = null;
  let defaultCmsFallbackPromise = null;

  const createBrowserDefaultState = () => ({
    meta: {
      platformName: "AvelixLink",
      version: 2,
    },
    analytics: {
      totalVisits: 0,
      visitsByDate: {},
      totalAIMatch: 0,
      aiMatchByDate: {},
      totalInquiries: 0,
      inquiriesByDate: {},
    },
    products: [],
    contactMessages: [],
    inquiries: [],
    messages: [],
    payments: [],
    media: [],
    website: {
      brand: {
        name: "AvelixLink",
        logoTop: "AvelixLink",
        logoBottom: "",
        logoImage: "/assets/brand/avelixlink-mark.png",
        logoPublicId: "",
        favicon: "/assets/brand/avelixlink-favicon.png",
        faviconPublicId: "",
        browserTitle: "AvelixLink | Premium Workspace Innovation",
        subtitle: "",
      },
      hero: {
        eyebrow: "PREMIUM WORKSPACE SOLUTIONS",
        title: "Reimagine\nYour Workspace.",
        subtitle:
          "AvelixLink creates thoughtfully designed products that improve modern workspaces, productivity, and everyday life.",
        backgroundImage: "/assets/images/ny-hero.jpg",
        backgroundImagePublicId: "",
        banner: "",
      },
      footer: {
        tagline: "Better Workspace.\nBetter Work.",
        copyright: "© 2026 AvelixLink. All rights reserved.",
      },
      contact: {
        email: "avelixlink@outlook.com",
        phone: "",
        address: "",
      },
      social: {
        linkedin: "",
        whatsapp: "+44 7597 653224",
        instagram: "",
        x: "",
      },
      seo: {
        metaDescription: "Premium workspace products designed to improve productivity, organization and comfort.",
        metaKeywords: "workspace products, desk accessories, productivity, workspace setup, premium office essentials",
      },
    },
    settings: {
      adminEmail: "",
      adminPassword: "",
      recoveryEmail: "",
      paymentMethods: ["Credit Card", "PayPal", "Bank Transfer", "Wise"],
      language: "English",
      themeColor: "#111827",
      systemConfig: "",
    },
    homepage: {
      eyebrow: "PREMIUM WORKSPACE SOLUTIONS",
      title: "Reimagine\nYour Workspace.",
      subtitle:
        "Premium products designed to simplify modern workspaces and everyday life.",
      heroBackgroundImage: "/assets/images/ny-hero.jpg",
      heroCtaPrimaryLabel: "Explore Products",
      heroCtaPrimaryLink: "/products",
      heroCtaSecondaryLabel: "Learn More",
      heroCtaSecondaryLink: "/about",
      trustedBadges: ["New Arrivals", "Premium Quality", "Worldwide Shipping"],
      featuredProductId: "",
      spotlightTitle: "Featured Product",
      spotlightSubtitle: "An all-in-one portable workspace organizer designed for modern professionals.",
      aboutTitle: "Why AvelixLink",
      aboutText:
        "At AvelixLink, we combine thoughtful design, practical functionality, and global manufacturing resources to create products that improve workspaces, productivity, and everyday life.",
      aboutPoints: [
        "Thoughtful design for everyday work",
        "Quality materials with a premium finish",
        "Practical functionality for modern desks",
        "Responsive across desktop and mobile",
      ],
    },
    aiMatch: {},
  });

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const nowIso = () => new Date().toISOString();
  const isAdminRoute = () => window.location.pathname.startsWith("/admin");
  const getHostname = () => String(window.location.hostname || "").trim().toLowerCase();
  const isLocalDevelopmentHost = () => {
    const hostname = getHostname();
    return hostname === "127.0.0.1" || hostname === "localhost" || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname);
  };
  const isPublicStorefrontPage = () => !window.location.pathname.startsWith("/admin");
  const getVisitWindowState = () => {
    try {
      const raw = localStorage.getItem(ANALYTICS_VISIT_WINDOW_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  };
  const setVisitWindowState = (value) => {
    try {
      localStorage.setItem(ANALYTICS_VISIT_WINDOW_KEY, JSON.stringify(value));
    } catch (error) {
      // Ignore analytics cooldown persistence failures.
    }
  };
  const clearVisitWindowState = () => {
    try {
      localStorage.removeItem(ANALYTICS_VISIT_WINDOW_KEY);
    } catch (error) {
      // Ignore analytics cooldown cleanup failures.
    }
  };
  const isVisitCooldownActive = () => {
    const windowState = getVisitWindowState();
    const lastTrackedAt = Number(windowState?.lastTrackedAt || 0);
    return Number.isFinite(lastTrackedAt) && Date.now() - lastTrackedAt < ANALYTICS_VISIT_COOLDOWN_MS;
  };
  const extractLegacyAdminCredentials = (value) => {
    const settings = asObject(value);
    const email = String(settings.adminEmail || "").trim().toLowerCase();
    const password = String(settings.adminPassword || "");
    return email && password ? { email, password } : null;
  };
  const stripAdminCredentials = (settings) => ({
    ...asObject(settings),
    adminEmail: "",
    adminPassword: "",
  });
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
      const error = new Error(String(payload?.error || `Request failed with status ${response.status}.`));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  };
  const requestForm = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: "same-origin",
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
      const error = new Error(String(payload?.error || `Request failed with status ${response.status}.`));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  };
  const loadPersistedProducts = async () => {
    const payload = await requestJson("/api/products", {
      method: "GET",
    });
    return Array.isArray(payload?.products) ? payload.products : [];
  };
  const uploadProductImage = async (file) => {
    if (!file) {
      throw new Error("No image file selected.");
    }

    const formData = new FormData();
    formData.append("file", file, file.name || "product-image");
    return requestForm("/api/admin/product-images", {
      method: "POST",
      body: formData,
    });
  };
  const uploadMediaAsset = async (file, options = {}) => {
    if (!file) {
      throw new Error("No image file selected.");
    }

    const formData = new FormData();
    formData.append("file", file, file.name || "media-image");
    formData.append("usageType", String(options.usageType || "misc"));
    if (options.displayName) {
      formData.append("displayName", String(options.displayName));
    }
    if (options.altText) {
      formData.append("altText", String(options.altText));
    }

    const payload = await requestForm("/api/admin/media/upload", {
      method: "POST",
      body: formData,
    });
    return payload?.asset || null;
  };
  const uploadMediaAssets = async (files, options = {}) => {
    const fileList = Array.from(files || []);
    if (!fileList.length) {
      throw new Error("No image files selected.");
    }

    const formData = new FormData();
    fileList.forEach((file) => {
      formData.append("files", file, file.name || "media-image");
    });
    formData.append("usageType", String(options.usageType || "misc"));
    if (options.altText) {
      formData.append("altText", String(options.altText));
    }

    const payload = await requestForm("/api/admin/media/upload-multiple", {
      method: "POST",
      body: formData,
    });
    return Array.isArray(payload?.assets) ? payload.assets : [];
  };

  const dateKeyFrom = (value) => {
    const date = value ? new Date(value) : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const slugify = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || createId("item");

  const parseNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const parseInteger = (value, fallback = 0) => {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const asStringArray = (value) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item || "").trim())
        .filter(Boolean);
    }

    if (typeof value === "string") {
      return value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  };

  const asObject = (value) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : {};

  const asSpecObject = (value) =>
    Object.fromEntries(
      Object.entries(asObject(value))
        .map(([key, entryValue]) => [String(key || "").trim(), String(entryValue || "").trim()])
        .filter(([key, entryValue]) => key && entryValue)
    );

  const formatCurrency = (value) => `$${parseNumber(value).toFixed(2)}`;
  const formatMoq = (value) => `${Math.max(1, parseInteger(value, 1))} units`;
  const formatShippingTime = (value) => {
    const days = Math.max(1, parseInteger(value, 1));
    return days <= 10 ? `${days} days` : `${Math.max(1, days - 6)}-${days} days`;
  };
  const useUpdatedCopy = (value, fallback, legacyValues = []) => {
    const text = String(value || "").trim();
    return !text || legacyValues.includes(text) ? fallback : text;
  };
  const normalizeEmailContact = (value) => {
    const email = String(value || "").trim();
    return !email || ["sales@apexlinkglobal.com", "ApexLink080918@outlook.com"].includes(email)
      ? "avelixlink@outlook.com"
      : email;
  };
  const normalizeOptionalContactValue = (value, legacyValues = []) => {
    const normalized = String(value || "").trim();
    return legacyValues.includes(normalized) ? "" : normalized;
  };
  const normalizeRouteLink = (value, fallback) => {
    const link = String(value || "").trim();

    if (!link) {
      return fallback;
    }

    if (link === "#ai-matching" || link === "/#ai-matching" || link === "index.html#ai-matching") {
      return "/workspace-finder";
    }

    if (link === "#catalog" || link === "/#catalog" || link === "index.html#catalog") {
      return "/products";
    }

    if (link === "#contact" || link === "/#contact" || link === "index.html#contact") {
      return "/contact";
    }

    return link;
  };

  const normalizeCounterMap = (value) => {
    const map = {};
    Object.entries(asObject(value)).forEach(([key, entryValue]) => {
      map[String(key)] = Math.max(0, parseInteger(entryValue, 0));
    });
    return map;
  };

  const bumpCounter = (map, key, amount = 1) => ({
    ...map,
    [key]: Math.max(0, parseInteger(map[key], 0) + amount),
  });

  const lastSevenDays = () => {
    const days = [];
    const today = new Date();

    for (let index = 6; index >= 0; index -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - index);
      days.push(dateKeyFrom(date));
    }

    return days;
  };

  const normalizeMediaItem = (value, index = 0) => ({
    id: String(value?.id || createId(`media-${index + 1}`)),
    name: String(value?.name || `Media ${index + 1}`),
    url: String(value?.url || "").trim(),
    type: String(value?.type || "image"),
    usage: asStringArray(value?.usage),
    createdAt: String(value?.createdAt || nowIso()),
  });

  const normalizeDetailImages = (detailImages, fallbackImage, productName) => {
    const items = Array.isArray(detailImages)
      ? detailImages
      : fallbackImage
        ? [{ title: "Product View", text: "Main product image", url: fallbackImage }]
        : [];

    return items
      .map((item, index) => {
        if (typeof item === "string") {
          return {
            id: `${slugify(productName)}-detail-${index + 1}`,
            title: index === 0 ? "Product View" : `Detail ${index + 1}`,
            text: "Uploaded product visual",
            url: item,
            publicId: "",
          };
        }

        return {
          id: String(item?.id || `${slugify(productName)}-detail-${index + 1}`),
          title: String(item?.title || (index === 0 ? "Product View" : `Detail ${index + 1}`)),
          text: String(item?.text || "Uploaded product visual"),
          url: String(item?.url || fallbackImage || ""),
          publicId: String(item?.publicId || ""),
        };
      })
      .filter((item) => item.url);
  };

  const normalizePriceTiers = (tiers, fallbackMinQuantity, fallbackUnitPrice) => {
    const items = Array.isArray(tiers) ? tiers : [];
    const normalized = items
      .map((item, index) => ({
        id: String(item?.id || `tier-${index + 1}`),
        minQuantity: Math.max(1, parseInteger(item?.minQuantity, 1)),
        maxQuantity: Math.max(0, parseInteger(item?.maxQuantity, 0)),
        unitPrice: parseNumber(item?.unitPrice, 0),
      }))
      .filter((item) => item.unitPrice > 0);

    if (normalized.length) {
      return normalized;
    }

    return [];
  };

  const normalizeProduct = (value) => {
    const defaultPaymentTerms = "30% Deposit, 70% Before Shipment";
    const name = String(value?.name || "Untitled Product").trim();
    const priceValue = parseNumber(value?.priceValue ?? String(value?.price || "").replace(/[^\d.]/g, ""), 0);
    const moqValue = Math.max(1, parseInteger(value?.moqValue ?? String(value?.moq || "").replace(/[^\d]/g, ""), 1));
    const shippingDays = Math.max(
      1,
      parseInteger(value?.shippingDays ?? String(value?.shippingTime || "").split("-").pop(), 1)
    );

    const normalized = {
      id: String(value?.id || slugify(name)),
      slug: String(value?.slug || value?.id || slugify(name)).trim(),
      name,
      category: String(value?.category || "General").trim(),
      image: String(value?.image || "").trim(),
      mainImagePublicId: String(value?.mainImagePublicId || "").trim(),
      priceValue,
      price: String(value?.price || formatCurrency(priceValue)),
      moqValue,
      moq: String(value?.moq || formatMoq(moqValue)),
      shippingDays,
      shippingTime: String(value?.shippingTime || formatShippingTime(shippingDays)),
      stock: Math.max(0, parseInteger(value?.stock, 0)),
      status: ["active", "draft", "archived"].includes(value?.status) ? value.status : "active",
      b2c: {
        enabled: value?.b2c?.enabled !== undefined ? Boolean(value.b2c.enabled) : true,
        retailPrice: parseNumber(value?.b2c?.retailPrice ?? priceValue, priceValue),
        compareAtPrice: parseNumber(value?.b2c?.compareAtPrice, 0),
        retailStock: Math.max(0, parseInteger(value?.b2c?.retailStock ?? value?.stock, 0)),
        minimumQuantity: Math.max(1, parseInteger(value?.b2c?.minimumQuantity, 1)),
      },
      b2b: {
        enabled: value?.b2b?.enabled !== undefined ? Boolean(value.b2b.enabled) : true,
        wholesaleMoq: Math.max(1, parseInteger(value?.b2b?.wholesaleMoq ?? moqValue, moqValue)),
        wholesaleLeadTime: Math.max(1, parseInteger(value?.b2b?.wholesaleLeadTime ?? shippingDays, shippingDays)),
        priceTiers: normalizePriceTiers(value?.b2b?.priceTiers, moqValue, priceValue),
        depositTerms: String(
          value?.b2b?.depositTerms ||
            value?.b2b?.deposit?.customPaymentTerms ||
            value?.b2b?.customPaymentTerms ||
            defaultPaymentTerms
        ).trim(),
        deposit: {
          required:
            value?.b2b?.deposit?.required !== undefined
              ? Boolean(value.b2b.deposit.required)
              : Boolean(value?.b2b?.depositRequired),
          type:
            value?.b2b?.deposit?.type === "fixed" || value?.b2b?.depositType === "fixed" ? "fixed" : "percentage",
          value: parseNumber(value?.b2b?.deposit?.value ?? value?.b2b?.depositValue, 0),
          balanceDueStage: ["before-production", "before-shipment", "custom"].includes(
            value?.b2b?.deposit?.balanceDueStage
          )
            ? value.b2b.deposit.balanceDueStage
            : ["before-production", "before-shipment", "custom"].includes(value?.b2b?.balanceDueStage)
              ? value.b2b.balanceDueStage
              : "before-shipment",
          customPaymentTerms: String(
            value?.b2b?.deposit?.customPaymentTerms ||
              value?.b2b?.customPaymentTerms ||
              value?.b2b?.depositTerms ||
              defaultPaymentTerms
          ).trim(),
          refundable:
            value?.b2b?.deposit?.refundable !== undefined
              ? Boolean(value.b2b.deposit.refundable)
              : Boolean(value?.b2b?.depositRefundable),
          notes: String(value?.b2b?.deposit?.notes || value?.b2b?.depositNotes || "").trim(),
        },
      },
      description: String(value?.description || "").trim(),
      detailDescription: String(value?.detailDescription || "").trim(),
      seoTitle: String(value?.seoTitle || "").trim(),
      metaDescription: String(value?.metaDescription || "").trim(),
      keywords: asStringArray(value?.keywords ?? value?.tags),
      functions: asStringArray(value?.functions),
      scenarios: asStringArray(value?.scenarios),
      markets: asStringArray(value?.markets),
      tags: asStringArray(value?.tags),
      specs: asSpecObject(value?.specs),
      detailImages: normalizeDetailImages(value?.detailImages, value?.image, name),
      createdAt: String(value?.createdAt || nowIso()),
      updatedAt: String(value?.updatedAt || nowIso()),
    };

    if (normalized.id === "led-desk-lamp") {
      normalized.name = useUpdatedCopy(normalized.name, "Foldable Workspace Dock", ["LED Desk Lamp"]);
      normalized.category = useUpdatedCopy(normalized.category, "Workspace Essentials", ["Home & Office"]);
      normalized.description = useUpdatedCopy(
        normalized.description,
        "An all-in-one portable workspace organizer designed for modern professionals.",
        [
          "Foldable LED desk lamp with touch dimming, adjustable arm, and soft eye-care illumination for work or study.",
        ]
      );
      normalized.detailDescription = useUpdatedCopy(
        normalized.detailDescription,
        "Compact, modular and built for productivity wherever you work.",
        [
          "This LED desk lamp is designed for buyers looking for a clean, practical lighting product for home office and study environments. The slim folding structure saves space, while the touch-sensitive controls and adjustable head improve usability for reading, writing, and video-call workstations.",
        ]
      );

      if (
        normalized.functions.join("|") ===
        [
          "Three-level touch dimming for day and night use",
          "Adjustable arm and head for focused lighting angles",
          "Stable desktop base for office, study, and bedside use",
          "Low-glare LED output suitable for long reading sessions",
        ].join("|")
      ) {
        normalized.functions = [
          "Foldable structure that keeps your desk essentials organized",
          "Modular compartments for daily tools, cables and devices",
          "Compact footprint for home offices, studios and shared desks",
          "Portable design for productive setups anywhere you work",
        ];
      }

      if (normalized.scenarios.join("|") === ["Home office", "Dorm room", "Study desk", "Bedside reading"].join("|")) {
        normalized.scenarios = ["Home office", "Studio desk", "Remote setup", "Shared workspace"];
      }

      if (normalized.specs.Material === "ABS + Aluminum Alloy") {
        normalized.specs = {
          Material: "Aluminum + Premium Composite",
          Format: "Foldable Modular Dock",
          Storage: "Cable, Pen and Device Slots",
          UseCase: "Desk Organization",
          Portability: "Travel-Friendly Foldable Form",
          Packaging: "Premium Retail Box",
        };
      }
    }

    normalized.detailDescription = useUpdatedCopy(normalized.detailDescription, normalized.detailDescription, [
      "This wireless charging phone stand combines practical charging with a display-friendly viewing angle, making it ideal for office and bedside use. It is a strong choice for importers sourcing modern mobile accessories that look premium, photograph well, and fit neatly into consumer electronics catalogs.",
      "This hiking backpack is aimed at buyers sourcing reliable outdoor products with strong visual appeal and practical carrying performance. The 40L format makes it suitable for entry-level and mid-range outdoor markets, especially for trekking, light camping, and travel-adventure product lines.",
      "These trekking poles are designed for buyers targeting practical outdoor equipment categories. The adjustable shaft structure, ergonomic grip, and trail-ready support make them suitable for hiking, mountain walking, and travel adventure sets where stability and portability both matter.",
    ]);

    if (
      normalized.detailDescription ===
      "This wireless charging phone stand combines practical charging with a display-friendly viewing angle, making it ideal for office and bedside use. It is a strong choice for importers sourcing modern mobile accessories that look premium, photograph well, and fit neatly into consumer electronics catalogs."
    ) {
      normalized.detailDescription =
        "This wireless charging phone stand combines practical charging with a display-friendly viewing angle, making it ideal for office and bedside use. It is a strong choice for modern workspaces that want technology accessories to feel clean, premium, and easy to integrate into everyday setups.";
    }

    if (
      normalized.detailDescription ===
      "This hiking backpack is aimed at buyers sourcing reliable outdoor products with strong visual appeal and practical carrying performance. The 40L format makes it suitable for entry-level and mid-range outdoor markets, especially for trekking, light camping, and travel-adventure product lines."
    ) {
      normalized.detailDescription =
        "This hiking backpack combines strong carrying performance with a clean silhouette, making it useful for commuting, travel, and everyday gear organization. The 40L format supports flexible daily use while keeping essentials easy to access and carry.";
    }

    if (
      normalized.detailDescription ===
      "These trekking poles are designed for buyers targeting practical outdoor equipment categories. The adjustable shaft structure, ergonomic grip, and trail-ready support make them suitable for hiking, mountain walking, and travel adventure sets where stability and portability both matter."
    ) {
      normalized.detailDescription =
        "These trekking poles combine lightweight portability with dependable support for active outdoor use. The adjustable structure and ergonomic grip make them easy to carry, simple to use, and well suited to travel, walking, and weekend adventure routines.";
    }

    normalized.detailImages = normalized.detailImages.map((item) => ({
      ...item,
      text:
        item.text === "Helps buyers visualize outdoor and travel positioning."
          ? "Helps customers visualize outdoor and travel positioning."
          : item.text,
    }));

    return normalized;
  };

  const normalizeInquiry = (value) => {
    const id = String(value?.id || createId("inq"));
    const status = ["processed", "unprocessed"].includes(value?.status) ? value.status : "unprocessed";
    const orderStatus = ["pending_payment", "processing", "completed", "cancelled"].includes(value?.orderStatus)
      ? value.orderStatus
      : value?.source === "checkout"
        ? "pending_payment"
        : "";
    const paymentStatus = ["pending", "paid", "failed", "refunded"].includes(value?.paymentStatus)
      ? value.paymentStatus
      : value?.source === "checkout"
        ? "pending"
        : "";

    return {
      id,
      orderId: String(value?.orderId || id).trim(),
      source: String(value?.source || "contact"),
      status,
      orderStatus,
      paymentStatus,
      purchaseMode: ["retail", "wholesale"].includes(String(value?.purchaseMode || "").trim().toLowerCase())
        ? String(value.purchaseMode).trim().toLowerCase()
        : "",
      currency: String(value?.currency || "USD").trim().toUpperCase(),
      paymentTerms: String(value?.paymentTerms || "").trim(),
      depositPercentage: String(value?.depositPercentage || "").trim(),
      customerName: String(value?.customerName || "Unknown Visitor").trim(),
      country: String(value?.country || "").trim(),
      email: String(value?.email || "").trim(),
      phone: String(value?.phone || "").trim(),
      shippingAddress: String(value?.shippingAddress || "").trim(),
      productId: String(value?.productId || "").trim(),
      productName: String(value?.productName || "").trim(),
      quantity: String(value?.quantity || "").trim(),
      unitPrice: String(value?.unitPrice || "").trim(),
      subtotal: String(value?.subtotal || "").trim(),
      moq: String(value?.moq || "").trim(),
      budget: String(value?.budget || "").trim(),
      shippingCycle: String(value?.shippingCycle || value?.shippingTime || "").trim(),
      message: String(value?.message || "").trim(),
      adminNote: String(value?.adminNote || "").trim(),
      paymentMethod: String(value?.paymentMethod || "").trim(),
      createdAt: String(value?.createdAt || nowIso()),
      updatedAt: String(value?.updatedAt || value?.createdAt || nowIso()),
    };
  };

  const normalizeContactMessage = (value) => ({
    id: String(value?.id || createId("contact")),
    source: "contact",
    customerName: String(value?.customerName || "").trim(),
    email: String(value?.email || "").trim(),
    country: String(value?.country || "").trim(),
    productInterest: String(value?.productInterest || "").trim(),
    message: String(value?.message || "").trim(),
    createdAt: String(value?.createdAt || nowIso()),
    updatedAt: String(value?.updatedAt || value?.createdAt || nowIso()),
  });

  const normalizeMessage = (value) => ({
    id: String(value?.id || createId("msg")),
    sender: ["customer", "admin", "assistant"].includes(value?.sender) ? value.sender : "assistant",
    text: String(value?.text || "").trim(),
    image: String(value?.image || "").trim(),
    createdAt: String(value?.createdAt || nowIso()),
  });

  const normalizeThread = (value) => ({
    id: String(value?.id || createId("thread")),
    customerName: String(value?.customerName || "Website Visitor").trim(),
    email: String(value?.email || "").trim(),
    country: String(value?.country || "").trim(),
    source: String(value?.source || "support"),
    status: ["open", "replied", "closed"].includes(value?.status) ? value.status : "open",
    lastAdminReadAt: String(value?.lastAdminReadAt || ""),
    createdAt: String(value?.createdAt || nowIso()),
    updatedAt: String(value?.updatedAt || value?.createdAt || nowIso()),
    messages: Array.isArray(value?.messages)
      ? value.messages.map(normalizeMessage).filter((item) => item.text || item.image)
      : [],
  });

  const normalizePayment = (value) => {
    const normalizedStatus = String(value?.status || "pending")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    const allowedStatuses = new Set([
      "pending",
      "awaiting-payment",
      "payment-submitted",
      "paid",
      "failed",
      "refunded",
    ]);
    const paymentType = String(value?.paymentType || "full-payment")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");

    return {
      id: String(value?.id || createId("pay")),
      paymentId: String(value?.paymentId || value?.id || createId("pay")).trim(),
      orderId: String(value?.orderId || "").trim(),
      product: String(value?.product || value?.productName || "").trim(),
      customer: String(value?.customer || value?.customerName || "").trim(),
      orderType: ["retail", "wholesale"].includes(String(value?.orderType || "").trim().toLowerCase())
        ? String(value.orderType).trim().toLowerCase()
        : "retail",
      paymentType: ["deposit", "full-payment", "balance", "refund"].includes(paymentType) ? paymentType : "full-payment",
      paymentMethod: String(value?.paymentMethod || "").trim(),
      settlementChannel: String(value?.settlementChannel || "").trim(),
      amount: parseNumber(value?.amount, 0),
      currency: String(value?.currency || "USD").trim().toUpperCase(),
      depositAmount: parseNumber(value?.depositAmount, 0),
      balanceAmount: parseNumber(value?.balanceAmount, 0),
      billingAddress: String(value?.billingAddress || "").trim(),
      customerEmail: String(value?.customerEmail || "").trim(),
      customerPhone: String(value?.customerPhone || "").trim(),
      status: allowedStatuses.has(normalizedStatus) ? normalizedStatus : "pending",
      createdAt: String(value?.createdAt || nowIso()),
      updatedAt: String(value?.updatedAt || value?.createdAt || nowIso()),
      paidAt: String(value?.paidAt || "").trim(),
    };
  };

  const normalizeWebsite = (value) => {
    const website = asObject(value);
    const contact = asObject(website.contact);
    const social = asObject(website.social);
    const seo = asObject(website.seo);
    const footer = asObject(website.footer);
    const hero = asObject(website.hero);
    const brand = asObject(website.brand);

    return {
      brand: {
        name: useUpdatedCopy(brand.name, "AvelixLink", ["ApexLink Global", "ApexLink"]),
        logoTop: useUpdatedCopy(brand.logoTop, "AvelixLink", ["ApexLink"]),
        logoBottom: useUpdatedCopy(brand.logoBottom, "", ["Global"]),
        logoImage: String(brand.logoImage || "assets/brand/avelixlink-mark.png"),
        logoPublicId: String(brand.logoPublicId || ""),
        favicon: String(brand.favicon || "assets/brand/avelixlink-favicon.png"),
        faviconPublicId: String(brand.faviconPublicId || ""),
        browserTitle: useUpdatedCopy(
          brand.browserTitle,
          "AvelixLink | Premium Workspace Innovation",
          ["AvelixLink | AI-Powered Global Sourcing Platform"]
        ),
        subtitle: useUpdatedCopy(brand.subtitle, "Premium Workspace Solutions", ["AI-Powered Global Sourcing Platform"]),
      },
      hero: {
        eyebrow: useUpdatedCopy(hero.eyebrow, "PREMIUM WORKSPACE SOLUTIONS", ["Global Trade Intelligence"]),
        title: useUpdatedCopy(hero.title, "Reimagine\nYour Workspace.", ["AI-Powered Global Sourcing Platform"]),
        subtitle: useUpdatedCopy(
          hero.subtitle,
          "AvelixLink creates thoughtfully designed products that improve modern workspaces, productivity, and everyday life.",
          ["Connect with trusted suppliers, compare products, and manage international trade with intelligent sourcing tools."]
        ),
        backgroundImage: String(hero.backgroundImage || "assets/images/ny-hero.jpg"),
        backgroundImagePublicId: String(hero.backgroundImagePublicId || ""),
        banner: String(hero.banner || ""),
      },
      footer: {
        tagline: useUpdatedCopy(
          footer.tagline,
          "Better Workspace.\nBetter Work.",
          ["AI-powered global sourcing platform for buyers, suppliers, and sourcing teams."]
        ),
        copyright: useUpdatedCopy(
          footer.copyright,
          "© 2026 AvelixLink. All rights reserved.",
          [
            `© ${new Date().getFullYear()} AvelixLink. All rights reserved.`,
            "© 2026 AvelixLink. All rights reserved.",
          ]
        ),
      },
      contact: {
        email: normalizeEmailContact(contact.email),
        phone: normalizeOptionalContactValue(contact.phone, ["+86 755 8888 2211"]),
        address: normalizeOptionalContactValue(contact.address, ["Longhua District, Shenzhen, China"]),
      },
      social: {
        linkedin: String(social.linkedin || ""),
        whatsapp: useUpdatedCopy(
          normalizeOptionalContactValue(social.whatsapp, ["+86 138 0000 2211"]),
          "+44 7597 653224"
        ),
        instagram: String(social.instagram || ""),
        x: String(social.x || ""),
      },
      seo: {
        metaDescription: useUpdatedCopy(
          seo.metaDescription,
          "Premium workspace products designed to improve productivity, organization and comfort.",
          ["AI-powered global sourcing platform for wholesale buyers, distributors, and sourcing teams."]
        ),
        metaKeywords: useUpdatedCopy(
          seo.metaKeywords,
          "workspace products, desk accessories, productivity, workspace setup, premium office essentials",
          ["global sourcing, wholesale, ai match, suppliers, b2b"]
        ),
      },
    };
  };

  const normalizeSettings = (value) => {
    const settings = asObject(value);

    return {
      adminEmail: "",
      adminPassword: "",
      recoveryEmail: normalizeEmailContact(settings.recoveryEmail),
      paymentMethods: asStringArray(settings.paymentMethods || ["Credit Card", "PayPal", "Bank Transfer", "Wise"]),
      language: String(settings.language || "English"),
      themeColor: String(settings.themeColor || "#111827"),
      systemConfig: String(settings.systemConfig || ""),
    };
  };

  const normalizeAnalytics = (value) => {
    const analytics = asObject(value);

    return {
      totalVisits: Math.max(0, parseInteger(analytics.totalVisits, 0)),
      visitsByDate: normalizeCounterMap(analytics.visitsByDate),
      totalAIMatch: Math.max(0, parseInteger(analytics.totalAIMatch, 0)),
      aiMatchByDate: normalizeCounterMap(analytics.aiMatchByDate),
      totalInquiries: Math.max(0, parseInteger(analytics.totalInquiries, 0)),
      inquiriesByDate: normalizeCounterMap(analytics.inquiriesByDate),
    };
  };

  const normalizeState = (value) => {
    const source = asObject(value);
    const homepage = asObject(source.homepage);
    const products = Array.isArray(source.products) ? source.products.map(normalizeProduct) : [];
    const media = Array.isArray(source.media)
      ? source.media.map((item, index) => normalizeMediaItem(item, index)).filter((item) => item.url)
      : [];
    const contactMessages = Array.isArray(source.contactMessages)
      ? source.contactMessages.map(normalizeContactMessage)
      : [];
    const inquiries = Array.isArray(source.inquiries)
      ? source.inquiries.map(normalizeInquiry).filter((item) => !DEMO_INQUIRY_IDS.has(item.id))
      : [];
    const messages = Array.isArray(source.messages)
      ? source.messages.map(normalizeThread).filter((item) => !DEMO_THREAD_IDS.has(item.id))
      : [];
    const payments = Array.isArray(source.payments) ? source.payments.map(normalizePayment) : [];
    const analytics = normalizeAnalytics(source.analytics);
    const website = normalizeWebsite(source.website || {
      hero: {
        eyebrow: homepage.eyebrow,
        title: homepage.title,
        subtitle: homepage.subtitle,
        backgroundImage: homepage.heroBackgroundImage,
      },
      brand: {
        name: source.meta?.platformName,
        browserTitle: source.meta?.platformName
          ? `${source.meta.platformName} | Premium Workspace Solutions`
          : undefined,
      },
    });
    const aiMatchRules = asObject(source.aiMatch);

    return {
      meta: {
        platformName: website.brand.name,
        version: Math.max(1, parseInteger(source.meta?.version, 2)),
      },
      analytics,
      products,
      contactMessages,
      inquiries,
      messages,
      payments,
      media,
      website,
      settings: normalizeSettings(source.settings),
      homepage: {
        eyebrow: website.hero.eyebrow,
        title: website.hero.title,
        subtitle: website.hero.subtitle,
        heroBackgroundImage: website.hero.backgroundImage,
        heroCtaPrimaryLabel: useUpdatedCopy(homepage.heroCtaPrimaryLabel, "Explore Products", ["Start Matching"]),
        heroCtaPrimaryLink: normalizeRouteLink(homepage.heroCtaPrimaryLink, "/products"),
        heroCtaSecondaryLabel: useUpdatedCopy(homepage.heroCtaSecondaryLabel, "Learn More", ["Explore Products"]),
        heroCtaSecondaryLink: normalizeRouteLink(homepage.heroCtaSecondaryLink, "/about"),
        trustedBadges: asStringArray(
          (homepage.trustedBadges || []).length
            ? homepage.trustedBadges
            : ["New Arrivals", "Premium Quality", "Worldwide Shipping"]
        ),
        featuredProductId: String(homepage.featuredProductId || products[0]?.id || ""),
        spotlightTitle: useUpdatedCopy(homepage.spotlightTitle, "Featured Product", ["AI Recommendation Preview"]),
        spotlightSubtitle: useUpdatedCopy(
          homepage.spotlightSubtitle,
          "An all-in-one portable workspace organizer designed for modern professionals.",
          ["Matched for price, MOQ and shipping speed"]
        ),
        aboutTitle: useUpdatedCopy(homepage.aboutTitle, "Why AvelixLink", [
          "A modern sourcing front end inspired by Shopify, Apple and leading SaaS products.",
        ]),
        aboutText: useUpdatedCopy(
          homepage.aboutText,
          "At AvelixLink, we combine thoughtful design, practical functionality, and global manufacturing resources to create products that improve workspaces, productivity, and everyday life.",
          [
            "AvelixLink is a modern sourcing platform for premium product discovery. It combines an AI-style matching experience with a minimalist product catalog and detail pages suitable for international buyers, distributors, and sourcing teams.",
          ]
        ),
        aboutPoints: asStringArray(
          (homepage.aboutPoints || []).length
            ? homepage.aboutPoints
            : [
                "Thoughtful design for everyday work",
                "Quality materials with a premium finish",
                "Practical functionality for modern desks",
                "Responsive across desktop and mobile",
              ]
        ),
      },
      aiMatch: {
        priceRangeRule: {
          overPenaltyMultiplier: parseNumber(aiMatchRules?.priceRangeRule?.overPenaltyMultiplier, 1.1),
          underPenaltyMultiplier: parseNumber(aiMatchRules?.priceRangeRule?.underPenaltyMultiplier, 0.6),
        },
        moqRule: {
          penaltyDivisor: Math.max(1, parseInteger(aiMatchRules?.moqRule?.penaltyDivisor, 25)),
          preferredThreshold: Math.max(1, parseInteger(aiMatchRules?.moqRule?.preferredThreshold, 200)),
        },
        shippingRule: {
          penaltyPerDay: Math.max(0.1, parseNumber(aiMatchRules?.shippingRule?.penaltyPerDay, 1)),
        },
        recommendationRule: {
          baseScore: parseInteger(aiMatchRules?.recommendationRule?.baseScore, 58),
          budgetWeight: parseInteger(aiMatchRules?.recommendationRule?.budgetWeight, 18),
          shippingWeight: parseInteger(aiMatchRules?.recommendationRule?.shippingWeight, 15),
          moqWeight: parseInteger(aiMatchRules?.recommendationRule?.moqWeight, 14),
          keywordWeight: parseInteger(aiMatchRules?.recommendationRule?.keywordWeight, 18),
          notesWeight: parseInteger(aiMatchRules?.recommendationRule?.notesWeight, 10),
          regionWeight: parseInteger(aiMatchRules?.recommendationRule?.regionWeight, 9),
          fallbackLimit: Math.max(1, parseInteger(aiMatchRules?.recommendationRule?.fallbackLimit, 3)),
        },
      },
    };
  };

  const persist = () => {
    if (!state) {
      return;
    }

    const persistedState = {
      ...state,
      settings: hasServerAdminAccount ? stripAdminCredentials(state.settings) : clone(state.settings),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
    window.dispatchEvent(
      new CustomEvent("northstar:store-updated", {
        detail: { state: clone(persistedState) },
      })
    );
  };

  const setState = (updater) => {
    state = normalizeState(typeof updater === "function" ? updater(clone(state)) : updater);
    persist();
    return clone(state);
  };

  const loadStoredState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  };

  const loadDefaultState = async () => clone(createBrowserDefaultState());

  const extractCmsFromState = (sourceState, productSource = []) => {
    const normalized = normalizeState({
      website: sourceState?.website,
      homepage: sourceState?.homepage,
      settings: sourceState?.settings,
      products: Array.isArray(productSource) ? productSource : [],
    });

    return {
      website: clone(normalized.website),
      homepage: clone(normalized.homepage),
      settings: clone(normalized.settings),
    };
  };

  const normalizeCmsPayload = (payload, productSource = []) =>
    extractCmsFromState(
      {
        website: payload?.website,
        homepage: payload?.homepage,
        settings: payload?.settings,
      },
      productSource
    );

  const invalidateCmsConfigCache = () => {
    publicSiteConfigCache = null;
    publicSiteConfigPromise = null;
    adminSiteConfigCache = null;
    adminSiteConfigPromise = null;
  };

  const getDefaultCmsFallback = async () => {
    if (!defaultCmsFallbackPromise) {
      defaultCmsFallbackPromise = loadDefaultState()
        .then((defaults) => normalizeCmsPayload(defaults, state?.products || []))
        .catch((error) => {
          console.error("[cms] Failed to load default CMS fallback:", error);
          return extractCmsFromState(state || {}, state?.products || []);
        });
    }

    return clone(await defaultCmsFallbackPromise);
  };

  const fetchPublicCmsConfig = async (options = {}) => {
    if (publicSiteConfigCache && !options.force) {
      return clone(publicSiteConfigCache);
    }

    if (publicSiteConfigPromise && !options.force) {
      return clone(await publicSiteConfigPromise);
    }

    publicSiteConfigPromise = requestJson("/api/site-config", {
      method: "GET",
    })
      .then((payload) => {
        publicSiteConfigCache = normalizeCmsPayload(payload, state?.products || []);
        return publicSiteConfigCache;
      })
      .catch(async (error) => {
        console.error("[cms] Public site-config load failed, using default fallback:", error);
        const fallback = await getDefaultCmsFallback();
        publicSiteConfigCache = clone(fallback);
        return publicSiteConfigCache;
      })
      .finally(() => {
        publicSiteConfigPromise = null;
      });

    return clone(await publicSiteConfigPromise);
  };

  const fetchAdminCmsConfig = async (options = {}) => {
    if (adminSiteConfigCache && !options.force) {
      return clone(adminSiteConfigCache);
    }

    if (adminSiteConfigPromise && !options.force) {
      return clone(await adminSiteConfigPromise);
    }

    adminSiteConfigPromise = requestJson("/api/admin/site-config", {
      method: "GET",
    })
      .then((payload) => {
        adminSiteConfigCache = normalizeCmsPayload(payload, state?.products || []);
        return adminSiteConfigCache;
      })
      .finally(() => {
        adminSiteConfigPromise = null;
      });

    return clone(await adminSiteConfigPromise);
  };

  const bootstrapAdminAccountFromLegacyState = async (legacyCredentials) => {
    if (!legacyCredentials?.email || !legacyCredentials?.password || !isAdminRoute()) {
      return false;
    }

    try {
      const sessionPayload = await requestJson("/api/admin/session", {
        method: "GET",
      });

      hasServerAdminAccount = Boolean(sessionPayload.hasAccount);
      if (sessionPayload.hasAccount) {
        adminSession = sessionPayload.session || null;
        return false;
      }

      await requestJson("/api/admin/bootstrap", {
        method: "POST",
        body: JSON.stringify(legacyCredentials),
      });
      hasServerAdminAccount = true;
      return true;
    } catch (error) {
      return false;
    }
  };

  const refreshAdminSession = async () => {
    try {
      const payload = await requestJson("/api/admin/session", {
        method: "GET",
      });
      hasServerAdminAccount = Boolean(payload.hasAccount);
      adminSession = payload.session || null;
      return clone(adminSession);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        hasServerAdminAccount = false;
        adminSession = null;
        return null;
      }
      return clone(adminSession);
    }
  };

  const init = async () => {
    if (state) {
      return clone(state);
    }

    if (!initPromise) {
      initPromise = (async () => {
        const stored = loadStoredState();
        const defaults = stored || (await loadDefaultState());
        const legacyCredentials =
          extractLegacyAdminCredentials(stored?.settings) || extractLegacyAdminCredentials(defaults?.settings);
        state = normalizeState(defaults);
        state.settings = legacyCredentials
          ? {
              ...state.settings,
              adminEmail: legacyCredentials.email,
              adminPassword: legacyCredentials.password,
            }
          : stripAdminCredentials(state.settings);

        if (localStorage.getItem(VISITOR_THREAD_KEY)) {
          const threadId = localStorage.getItem(VISITOR_THREAD_KEY);
          const exists = state.messages.some((thread) => thread.id === threadId);

          if (!exists) {
            localStorage.removeItem(VISITOR_THREAD_KEY);
          }
        }

        await bootstrapAdminAccountFromLegacyState(legacyCredentials);
        await refreshAdminSession();
        try {
          const persistedProducts = await loadPersistedProducts();
          if (Array.isArray(persistedProducts)) {
            state = normalizeState({
              ...state,
              products: persistedProducts,
            });
          }
        } catch (error) {
          // Fall back to the locally available snapshot if the product API is unavailable.
        }
        if (hasServerAdminAccount) {
          state.settings = stripAdminCredentials(state.settings);
        }
        persist();
        return clone(state);
      })();
    }

    return initPromise;
  };

  const withState = async (selector) => {
    const current = await init();
    return selector(current);
  };

  const trackVisit = async () => {
    await init();
    const session = await refreshAdminSession();

    if (!isPublicStorefrontPage() || isLocalDevelopmentHost() || Boolean(session?.email) || isVisitCooldownActive()) {
      return false;
    }

    const key = dateKeyFrom();

    setState((current) => ({
      ...current,
      analytics: {
        ...current.analytics,
        totalVisits: current.analytics.totalVisits + 1,
        visitsByDate: bumpCounter(current.analytics.visitsByDate, key),
      },
    }));

    setVisitWindowState({
      lastTrackedAt: Date.now(),
      pathname: window.location.pathname,
      hostname: getHostname(),
    });
    return true;
  };

  const recordAIMatchUsage = async (criteria, items) => {
    await init();
    const key = dateKeyFrom();

    setState((current) => ({
      ...current,
      analytics: {
        ...current.analytics,
        totalAIMatch: current.analytics.totalAIMatch + 1,
        aiMatchByDate: bumpCounter(current.analytics.aiMatchByDate, key),
      },
      aiMatch: {
        ...current.aiMatch,
        lastRun: {
          criteria: clone(criteria || {}),
          productIds: Array.isArray(items) ? items.map((item) => item.id) : [],
          createdAt: nowIso(),
        },
      },
    }));
  };

  const listInquiries = async () =>
    withState((current) =>
      clone(
        current.inquiries.slice().sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      )
    );

  const getInquiryById = async (id) =>
    withState((current) => clone(current.inquiries.find((item) => item.id === id) || null));

  const createInquiry = async (value) => {
    await init();
    const inquiry = normalizeInquiry(value);
    const key = dateKeyFrom(inquiry.createdAt);

    setState((current) => ({
      ...current,
      inquiries: [inquiry, ...current.inquiries],
      analytics: {
        ...current.analytics,
        totalInquiries: current.analytics.totalInquiries + 1,
        inquiriesByDate: bumpCounter(current.analytics.inquiriesByDate, key),
      },
    }));

    return clone(inquiry);
  };

  const updateInquiry = async (id, partial) => {
    await init();
    let updated = null;

    setState((current) => ({
      ...current,
      inquiries: current.inquiries.map((item) => {
        if (item.id !== id) {
          return item;
        }

        updated = normalizeInquiry({
          ...item,
          ...partial,
          id: item.id,
          createdAt: item.createdAt,
          updatedAt: nowIso(),
        });
        return updated;
      }),
    }));

    return clone(updated);
  };

  const updateInquiryStatus = async (id, status) => updateInquiry(id, { status });

  const deleteInquiry = async (id) => {
    await init();

    setState((current) => ({
      ...current,
      inquiries: current.inquiries.filter((item) => item.id !== id),
    }));
  };

  const listContactMessages = async () =>
    withState((current) =>
      clone(
        (Array.isArray(current.contactMessages) ? current.contactMessages : [])
          .slice()
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      )
    );

  const createContactMessage = async (value) => {
    await init();
    const contactMessage = normalizeContactMessage(value);

    setState((current) => ({
      ...current,
      contactMessages: [contactMessage, ...(Array.isArray(current.contactMessages) ? current.contactMessages : [])],
    }));

    return clone(contactMessage);
  };

  const getProducts = async () => withState((current) => clone(current.products));

  const getProductById = async (id) =>
    withState((current) => clone(current.products.find((item) => item.id === id) || null));

  const upsertProduct = async (value) => {
    await init();
    const product = normalizeProduct({
      ...value,
      updatedAt: nowIso(),
      createdAt: value?.createdAt || nowIso(),
    });
    const exists = state.products.some((item) => item.id === product.id);
    const payload = await requestJson(exists ? `/api/products/${encodeURIComponent(product.id)}` : "/api/products", {
      method: exists ? "PUT" : "POST",
      body: JSON.stringify({
        product,
      }),
    });
    const persistedProducts = Array.isArray(payload?.products) ? payload.products : [];

    setState((current) => ({
      ...current,
      products: persistedProducts.map(normalizeProduct),
    }));

    return clone(normalizeProduct(payload?.product || product));
  };

  const deleteProduct = async (id) => {
    await init();
    const payload = await requestJson(`/api/products/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify({}),
    });
    const persistedProducts = Array.isArray(payload?.products) ? payload.products : [];

    setState((current) => ({
      ...current,
      products: persistedProducts.map(normalizeProduct),
    }));
  };

  const listCustomerThreads = async () =>
    withState((current) =>
      clone(
        current.messages
          .slice()
          .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
          .map((thread) => {
            const unreadCount = thread.messages.filter((message) => {
              if (message.sender !== "customer") {
                return false;
              }

              if (!thread.lastAdminReadAt) {
                return true;
              }

              return new Date(message.createdAt).getTime() > new Date(thread.lastAdminReadAt).getTime();
            }).length;

            return {
              ...thread,
              unreadCount,
              lastMessage: thread.messages[thread.messages.length - 1] || null,
            };
          })
      )
    );

  const getMessageThreadById = async (id) =>
    withState((current) => clone(current.messages.find((item) => item.id === id) || null));

  const createMessageThread = async (value) => {
    await init();
    const thread = normalizeThread(value);

    setState((current) => ({
      ...current,
      messages: [thread, ...current.messages],
    }));

    return clone(thread);
  };

  const ensureVisitorSupportThread = async (profile = {}) => {
    await init();
    const existingId = localStorage.getItem(VISITOR_THREAD_KEY);

    if (existingId) {
      const existing = state.messages.find((thread) => thread.id === existingId);
      if (existing) {
        return clone(existing);
      }
    }

    const thread = await createMessageThread({
      customerName: profile.customerName || "Website Visitor",
      email: profile.email || "",
      country: profile.country || "",
      status: "open",
      source: "support",
      messages: [],
    });

    localStorage.setItem(VISITOR_THREAD_KEY, thread.id);
    return thread;
  };

  const appendMessage = async (threadId, value) => {
    await init();
    let updated = null;

    setState((current) => ({
      ...current,
      messages: current.messages.map((thread) => {
        if (thread.id !== threadId) {
          return thread;
        }

        const message = normalizeMessage(value);
        updated = {
          ...thread,
          status: value?.sender === "admin" ? "replied" : thread.status === "closed" ? "open" : thread.status,
          updatedAt: message.createdAt,
          messages: [...thread.messages, message],
        };
        return updated;
      }),
    }));

    return clone(updated);
  };

  const updateMessageStatus = async (threadId, status) => {
    await init();

    setState((current) => ({
      ...current,
      messages: current.messages.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              status: ["open", "replied", "closed"].includes(status) ? status : "open",
              updatedAt: nowIso(),
            }
          : thread
      ),
    }));
  };

  const updateMessageThreadMeta = async (threadId, partial) => {
    await init();

    setState((current) => ({
      ...current,
      messages: current.messages.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              customerName:
                partial?.customerName !== undefined ? String(partial.customerName).trim() : thread.customerName,
              email: partial?.email !== undefined ? String(partial.email).trim() : thread.email,
              country: partial?.country !== undefined ? String(partial.country).trim() : thread.country,
              updatedAt: nowIso(),
            }
          : thread
      ),
    }));
  };

  const markMessageThreadRead = async (threadId) => {
    await init();

    setState((current) => ({
      ...current,
      messages: current.messages.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              lastAdminReadAt: nowIso(),
            }
          : thread
      ),
    }));
  };

  const deleteMessageThread = async (threadId) => {
    await init();

    setState((current) => ({
      ...current,
      messages: current.messages.filter((thread) => thread.id !== threadId),
    }));

    if (localStorage.getItem(VISITOR_THREAD_KEY) === threadId) {
      localStorage.removeItem(VISITOR_THREAD_KEY);
    }
  };

  const normalizeRemoteMediaAsset = (asset) => ({
    id: String(asset?.id || ""),
    publicId: String(asset?.publicId || ""),
    name: String(asset?.displayName || asset?.name || asset?.originalFilename || ""),
    originalFilename: String(asset?.originalFilename || ""),
    url: String(asset?.secureUrl || asset?.url || ""),
    secureUrl: String(asset?.secureUrl || asset?.url || ""),
    type: String(asset?.resourceType || "image"),
    usageType: String(asset?.usageType || "misc"),
    usage: asStringArray(asset?.usage).length ? asStringArray(asset?.usage) : [String(asset?.usageType || "misc")],
    folder: String(asset?.folder || ""),
    format: String(asset?.format || ""),
    width: parseInteger(asset?.width, 0),
    height: parseInteger(asset?.height, 0),
    bytes: parseInteger(asset?.bytes, 0),
    createdAt: String(asset?.createdAt || nowIso()),
  });

  const listMedia = async (filters = {}) => {
    await init();

    if (isAdminRoute() && isAdminAuthenticated()) {
      const params = new URLSearchParams();
      if (filters.query) {
        params.set("q", String(filters.query));
      }
      if (filters.usageType) {
        params.set("usageType", String(filters.usageType));
      }
      if (filters.folder) {
        params.set("folder", String(filters.folder));
      }
      const payload = await requestJson(`/api/admin/media${params.toString() ? `?${params.toString()}` : ""}`, {
        method: "GET",
      });
      return Array.isArray(payload?.assets) ? payload.assets.map(normalizeRemoteMediaAsset) : [];
    }

    return withState((current) =>
      clone(current.media.slice().sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()))
    );
  };

  const listPayments = async () =>
    withState((current) =>
      clone(
        (current.payments || [])
          .slice()
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      )
    );

  const getPaymentById = async (id) =>
    withState((current) => clone((current.payments || []).find((item) => item.id === id) || null));

  const listPaymentsByOrder = async (orderId) =>
    withState((current) =>
      clone(
        (current.payments || [])
          .filter((item) => item.orderId === orderId)
          .slice()
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      )
    );

  const createPaymentRecord = async (value) => {
    await init();
    const payment = normalizePayment({
      ...value,
      createdAt: value?.createdAt || nowIso(),
      updatedAt: nowIso(),
    });

    setState((current) => ({
      ...current,
      payments: [payment, ...(current.payments || [])],
    }));

    return clone(payment);
  };

  const updatePaymentRecord = async (id, partial) => {
    await init();
    let updated = null;

    setState((current) => ({
      ...current,
      payments: (current.payments || []).map((item) => {
        if (item.id !== id) {
          return item;
        }

        updated = normalizePayment({
          ...item,
          ...partial,
          id: item.id,
          paymentId: item.paymentId,
          createdAt: item.createdAt,
          updatedAt: nowIso(),
        });
        return updated;
      }),
    }));

    return clone(updated);
  };

  const addMedia = async (value) => {
    await init();

    if (isAdminRoute() && isAdminAuthenticated()) {
      if (value?.file instanceof File) {
        return normalizeRemoteMediaAsset(
          await uploadMediaAsset(value.file, {
            usageType: value.usageType || value?.usage?.[0] || "misc",
            displayName: value.name || value.displayName,
            altText: value.altText,
          })
        );
      }
      throw new Error("Media creation now requires a file upload.");
    }

    const item = normalizeMediaItem(value);
    if (!item.url) {
      throw new Error("Media URL is required.");
    }
    setState((current) => ({
      ...current,
      media: [item, ...current.media],
    }));
    return clone(item);
  };

  const deleteMedia = async (id, options = {}) => {
    await init();

    if (isAdminRoute() && isAdminAuthenticated()) {
      const query = options.force ? "?force=1" : "";
      await requestJson(`/api/admin/media/${encodeURIComponent(id)}${query}`, {
        method: "DELETE",
      });
      return;
    }

    setState((current) => ({
      ...current,
      media: current.media.filter((item) => item.id !== id),
    }));
  };

  const getHomepage = async () => {
    await init();
    const cms = isAdminRoute() && isAdminAuthenticated() ? await fetchAdminCmsConfig() : await fetchPublicCmsConfig();
    return clone(cms.homepage);
  };

  const updateHomepage = async (partial) => {
    await init();
    const payload = await requestJson("/api/admin/site-config/homepage", {
      method: "PATCH",
      body: JSON.stringify({
        value: partial,
      }),
    });
    const cms = normalizeCmsPayload(payload?.siteConfig || payload, state?.products || []);
    adminSiteConfigCache = clone(cms);
    publicSiteConfigCache = clone(cms);
    return clone(cms.homepage);
  };

  const getWebsiteSettings = async () => {
    await init();
    const cms = isAdminRoute() && isAdminAuthenticated() ? await fetchAdminCmsConfig() : await fetchPublicCmsConfig();
    return clone(cms.website);
  };

  const updateWebsiteSettings = async (partial) => {
    await init();
    const payload = await requestJson("/api/admin/site-config", {
      method: "PATCH",
      body: JSON.stringify(partial),
    });
    const cms = normalizeCmsPayload(payload?.siteConfig || payload, state?.products || []);
    adminSiteConfigCache = clone(cms);
    publicSiteConfigCache = clone(cms);
    return clone(cms.website);
  };

  const getSettings = async () => {
    await init();
    const currentSettings = await withState((current) => clone(current.settings));
    const cms = isAdminRoute() && isAdminAuthenticated() ? await fetchAdminCmsConfig() : await fetchPublicCmsConfig();
    const cmsSettings = clone(cms.settings);

    if (!isAdminRoute() || !isAdminAuthenticated()) {
      return {
        ...cmsSettings,
        adminEmail: "",
        adminPassword: ADMIN_PASSWORD_MASK,
        recoveryEmail: currentSettings.recoveryEmail || "",
      };
    }

    try {
      const account = await requestJson("/api/admin/account", {
        method: "GET",
      });

      return {
        ...cmsSettings,
        adminEmail: String(account.email || "").trim(),
        adminPassword: ADMIN_PASSWORD_MASK,
        recoveryEmail: currentSettings.recoveryEmail || "",
      };
    } catch (error) {
      adminSession = null;
      return {
        ...cmsSettings,
        adminEmail: "",
        adminPassword: ADMIN_PASSWORD_MASK,
        recoveryEmail: currentSettings.recoveryEmail || "",
      };
    }
  };

  const updateSettings = async (partial) => {
    await init();
    const currentSettings = await getSettings();
    const nextSettings = normalizeSettings({ ...currentSettings, ...partial });
    const nextEmail = String(partial?.adminEmail || "").trim().toLowerCase();
    const nextPassword = String(partial?.adminPassword || "");
    const shouldUpdateAdminAccount = Boolean(nextEmail) || Boolean(nextPassword && nextPassword !== ADMIN_PASSWORD_MASK);
    let reauthRequired = false;

    if (shouldUpdateAdminAccount) {
      const accountResponse = await requestJson("/api/admin/account", {
        method: "PUT",
        body: JSON.stringify({
          email: nextEmail,
          password: nextPassword && nextPassword !== ADMIN_PASSWORD_MASK ? nextPassword : "",
        }),
      });

      hasServerAdminAccount = true;
      reauthRequired = Boolean(accountResponse.reauthRequired);
      if (reauthRequired) {
        adminSession = null;
      }
    }

    const cmsPayload = await requestJson("/api/admin/site-config", {
      method: "PATCH",
      body: JSON.stringify({
        paymentMethods: nextSettings.paymentMethods,
        language: nextSettings.language,
        themeColor: nextSettings.themeColor,
        systemConfig: nextSettings.systemConfig,
      }),
    });
    const cms = normalizeCmsPayload(cmsPayload?.siteConfig || cmsPayload, state?.products || []);
    adminSiteConfigCache = clone(cms);
    publicSiteConfigCache = clone(cms);

    if (partial?.recoveryEmail !== undefined) {
      setState((current) => ({
        ...current,
        settings: {
          ...current.settings,
          recoveryEmail: nextSettings.recoveryEmail,
        },
      }));
    }

    return clone({
      ...cms.settings,
      adminEmail: nextEmail,
      adminPassword: ADMIN_PASSWORD_MASK,
      recoveryEmail: nextSettings.recoveryEmail,
      reauthRequired,
    });
  };

  const getAIMatchConfig = async () => withState((current) => clone(current.aiMatch));

  const updateAIMatchConfig = async (partial) => {
    await init();

    setState((current) => ({
      ...current,
      aiMatch: normalizeState({
        ...current,
        aiMatch: {
          ...current.aiMatch,
          ...partial,
          priceRangeRule: { ...current.aiMatch.priceRangeRule, ...(partial?.priceRangeRule || {}) },
          moqRule: { ...current.aiMatch.moqRule, ...(partial?.moqRule || {}) },
          shippingRule: { ...current.aiMatch.shippingRule, ...(partial?.shippingRule || {}) },
          recommendationRule: {
            ...current.aiMatch.recommendationRule,
            ...(partial?.recommendationRule || {}),
          },
        },
      }).aiMatch,
    }));

    return getAIMatchConfig();
  };

  const buildTrend = (counterMap) =>
    lastSevenDays().map((key) => ({
      key,
      value: parseInteger(counterMap[key], 0),
    }));

  const getDashboardStats = async () =>
    withState((current) => {
      const todayKey = dateKeyFrom();
      const inquiryCounts = current.inquiries.reduce((accumulator, inquiry) => {
        const key = dateKeyFrom(inquiry.createdAt);
        accumulator[key] = (accumulator[key] || 0) + 1;
        return accumulator;
      }, {});
      const recentInquiries = current.inquiries
        .slice()
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 5);

      return clone({
        today: {
          visits: parseInteger(current.analytics.visitsByDate[todayKey], 0),
          aiMatch: parseInteger(current.analytics.aiMatchByDate[todayKey], 0),
          inquiries: parseInteger(inquiryCounts[todayKey], 0),
        },
        totals: {
          visits: current.analytics.totalVisits,
          aiMatch: current.analytics.totalAIMatch,
          inquiries: current.inquiries.length,
          products: current.products.length,
        },
        trends: {
          visits: buildTrend(current.analytics.visitsByDate),
          inquiries: buildTrend(inquiryCounts),
        },
        recentInquiries,
        environment: {
          isDevelopment: isLocalDevelopmentHost(),
        },
      });
    });

  const resetDevelopmentAnalytics = async () => {
    await init();

    if (!isLocalDevelopmentHost()) {
      return false;
    }

    setState((current) => ({
      ...current,
      analytics: {
        ...current.analytics,
        totalVisits: 0,
        visitsByDate: {},
        totalAIMatch: 0,
        aiMatchByDate: {},
      },
    }));
    clearVisitWindowState();
    return true;
  };

  const exportState = async () => withState((current) => clone(current));

  const resetState = async () => {
    const defaults = await loadDefaultState();
    state = normalizeState(defaults);
    state.settings = stripAdminCredentials(state.settings);
    localStorage.removeItem(VISITOR_THREAD_KEY);
    persist();
    return clone(state);
  };

  const loginAdmin = async (email, password) => {
    try {
      const payload = await requestJson("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          email: String(email || "").trim().toLowerCase(),
          password: String(password || ""),
        }),
      });
      hasServerAdminAccount = true;
      adminSession = payload.session || null;
      return {
        ok: Boolean(adminSession?.email),
        message: "",
      };
    } catch (error) {
      adminSession = null;
      return {
        ok: false,
        message: error.message || "Invalid email or password.",
      };
    }
  };

  const logoutAdmin = async () => {
    try {
      await requestJson("/api/admin/logout", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch (error) {
      // Ignore logout network errors and clear the local session state anyway.
    }

    adminSession = null;
  };

  const getAdminSession = () => clone(adminSession);

  const isAdminAuthenticated = () => Boolean(adminSession?.email);
  const getSiteConfig = async () => clone(await fetchPublicCmsConfig());

  window.NorthstarStore = {
    ready: init(),
    init,
    slugify,
    formatCurrency,
    trackVisit,
    recordAIMatchUsage,
    getDashboardStats,
    resetDevelopmentAnalytics,
    getProducts,
    getProductById,
    upsertProduct,
    deleteProduct,
    listInquiries,
    getInquiryById,
    createInquiry,
    updateInquiry,
    updateInquiryStatus,
    deleteInquiry,
    listContactMessages,
    createContactMessage,
    listCustomerThreads,
    getMessageThreadById,
    createMessageThread,
    ensureVisitorSupportThread,
    appendMessage,
    updateMessageStatus,
    updateMessageThreadMeta,
    markMessageThreadRead,
    deleteMessageThread,
    listPayments,
    getPaymentById,
    listPaymentsByOrder,
    createPaymentRecord,
    updatePaymentRecord,
    listMedia,
    addMedia,
    deleteMedia,
    getHomepage,
    updateHomepage,
    getWebsiteSettings,
    updateWebsiteSettings,
    getSettings,
    updateSettings,
    getSiteConfig,
    getAIMatchConfig,
    updateAIMatchConfig,
    exportState,
    resetState,
    loginAdmin,
    logoutAdmin,
    refreshAdminSession,
    uploadProductImage,
    uploadMediaAsset,
    uploadMediaAssets,
    getAdminSession,
    isAdminAuthenticated,
  };
})();
