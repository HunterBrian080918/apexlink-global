require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { Readable } = require("stream");
const { URL } = require("url");
const {
  listProducts: listSupabaseProducts,
  getProductById: getSupabaseProductById,
  createProduct: createSupabaseProduct,
  updateProduct: updateSupabaseProduct,
  upsertProduct: upsertSupabaseProduct,
  deleteProduct: deleteSupabaseProduct,
} = require("./services/supabase-products");
const {
  listOrders: listSupabaseOrders,
  getOrderById: getSupabaseOrderById,
  getOrderByNumber: getSupabaseOrderByNumber,
  listOrderEvents: listSupabaseOrderEvents,
  createOrderEvent: createSupabaseOrderEvent,
  createOrder: createSupabaseOrder,
  updateOrder: updateSupabaseOrder,
  updateOrderStatus: updateSupabaseOrderStatus,
  updateOrderPaymentStatus: updateSupabaseOrderPaymentStatus,
  updateOrderShippingStatus: updateSupabaseOrderShippingStatus,
  deleteOrder: deleteSupabaseOrder,
} = require("./services/supabase-orders");
const {
  listPayments: listSupabasePayments,
  getPaymentById: getSupabasePaymentById,
  listPaymentsByOrder: listSupabasePaymentsByOrder,
  createPaymentForOrder: createSupabasePaymentForOrder,
  updatePayment: updateSupabasePayment,
} = require("./services/supabase-payments");
const {
  createConversationWithFirstMessage: createSupabaseSupportConversation,
  getConversationById: getSupabaseSupportConversationById,
  listAdminConversations: listSupabaseAdminSupportConversations,
  listMessagesByConversation: listSupabaseSupportMessagesByConversation,
  addCustomerMessage: addSupabaseCustomerSupportMessage,
  addAdminMessage: addSupabaseAdminSupportMessage,
  updateConversationStatus: updateSupabaseSupportConversationStatus,
  markAdminRead: markSupabaseSupportConversationRead,
  markCustomerRead: markSupabaseSupportConversationReadByCustomer,
  updateCustomerProfile: updateSupabaseCustomerProfile,
} = require("./services/supabase-support");
const {
  ALLOWED_SECTIONS: CMS_ALLOWED_SECTIONS,
  getSiteConfig: getSupabaseSiteConfig,
  updateSiteConfig: updateSupabaseSiteConfig,
  updateSiteConfigSection: updateSupabaseSiteConfigSection,
} = require("./services/supabase-cms");
const {
  listMediaAssets: listSupabaseMediaAssets,
  getMediaAssetById: getSupabaseMediaAssetById,
  getMediaAssetByPublicId: getSupabaseMediaAssetByPublicId,
  upsertMediaAsset: upsertSupabaseMediaAsset,
  deleteMediaAssetById: deleteSupabaseMediaAssetById,
  findMediaReferences: findSupabaseMediaReferences,
} = require("./services/supabase-media");
const {
  uploadFile: uploadCloudinaryFile,
  uploadFiles: uploadCloudinaryFiles,
  destroyAsset: destroyCloudinaryAsset,
} = require("./services/cloudinary-media");
const {
  getActiveAdminAuth: getSupabaseActiveAdminAuth,
  getAdminAuthByEmail: getSupabaseAdminAuthByEmail,
  createAdminAuthAccount: createSupabaseAdminAuthAccount,
  updateAdminAuthAccount: updateSupabaseAdminAuthAccount,
  touchAdminLastLogin: touchSupabaseAdminLastLogin,
} = require("./services/supabase-admin-auth");
const {
  listNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
} = require("./services/supabase-notifications");
const {
  sendAdminSubmissionEmail,
  verifyEmailTransport,
  logEmailConfigurationWarning,
  getEmailConfigurationStatus,
} = require("./services/email-notifications");
const { createContactInquiry, validateContactPayload } = require("./services/supabase-contact");

const root = __dirname;
const publicRoot = path.join(root, "public");
const port = Number.parseInt(process.env.PORT || "8000", 10);
const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
const pidFile = path.join(root, ".server.pid");
const defaultDataFile = path.join(root, "data", "default-data.json");
const uploadLogFile = path.join(root, "logs", "media-upload.log");
const adminSessionCookieName = "northstar_admin_session";
const adminSessionMaxAgeSeconds = 60 * 60 * 24 * 7;
const redirectMap = {
  "/collections": "/products",
  "/collections.html": "/products",
  "/ai-match": "/workspace-finder",
  "/ai-match.html": "/workspace-finder",
};

const runBackgroundTask = (label, task) => {
  Promise.resolve().then(task).catch((error) => console.error(`[${label}] ${error?.message || error}`));
};

const notifyAdmin = (input) => runBackgroundTask("notifications", () => createNotification(input));
const emailAdmin = (kind, input) => runBackgroundTask("email", () => sendAdminSubmissionEmail(kind, input));
const getAdminBaseUrl = () => String(process.env.ADMIN_URL || `http://127.0.0.1:${port}/admin`).trim();
const buildAdminDeepLink = (section, entityId) => {
  const base = getAdminBaseUrl().replace(/\/+$/, "");
  if (!section) {
    return base;
  }
  if (!entityId) {
    return `${base}?section=${encodeURIComponent(section)}`;
  }
  return `${base}?section=${encodeURIComponent(section)}&id=${encodeURIComponent(entityId)}`;
};
const buildNotificationMetadata = (input = {}) => ({
  customerName: String(input.customerName || "").trim() || null,
  email: String(input.email || "").trim() || null,
  timestamp: String(input.timestamp || nowIso()).trim(),
  adminLink: String(input.adminLink || "").trim() || null,
  orderNumber: String(input.orderNumber || "").trim() || null,
  relatedProductName: String(input.relatedProductName || "").trim() || null,
  purchaseMode: String(input.purchaseMode || "").trim() || null,
  ...((input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)) ? input.metadata : {}),
});

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const pageRouteMap = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/about", "about.html"],
  ["/about.html", "about.html"],
  ["/products", "products.html"],
  ["/products.html", "products.html"],
  ["/workspace-finder", "workspace-finder.html"],
  ["/workspace-finder.html", "workspace-finder.html"],
  ["/contact", "contact.html"],
  ["/contact.html", "contact.html"],
  ["/support", "support.html"],
  ["/support.html", "support.html"],
  ["/results", "results.html"],
  ["/results.html", "results.html"],
  ["/detail", "detail.html"],
  ["/detail.html", "detail.html"],
  ["/checkout", "checkout.html"],
  ["/checkout.html", "checkout.html"],
  ["/payment", "payment.html"],
  ["/payment.html", "payment.html"],
  ["/privacy", "privacy.html"],
  ["/privacy.html", "privacy.html"],
  ["/terms", "terms.html"],
  ["/terms.html", "terms.html"],
  ["/shipping", "shipping-policy.html"],
  ["/shipping.html", "shipping-policy.html"],
  ["/shipping-policy", "shipping-policy.html"],
  ["/shipping-policy.html", "shipping-policy.html"],
  ["/refund", "returns-refunds.html"],
  ["/refund.html", "returns-refunds.html"],
  ["/returns-refunds", "returns-refunds.html"],
  ["/returns-refunds.html", "returns-refunds.html"],
  ["/admin", path.join("admin", "index.html")],
  ["/admin/", path.join("admin", "index.html")],
  ["/admin/index.html", path.join("admin", "index.html")],
]);

const publicRootFileAllowlist = new Set([
  "styles.css",
  "page-transition.js",
  "data-store.js",
  "public-shell.js",
  "site-config.js",
  "script.js",
  "products.js",
  "detail.js",
  "checkout.js",
  "payment.js",
  "contact.js",
  "support.js",
  "matching.js",
  "ai-match.js",
  "results.js",
  "collections.html",
  "ai-match.html",
  "404.html",
  "robots.txt",
  "sitemap.xml",
]);

const adminStaticFileAllowlist = new Set(["admin.css", "admin.js"]);
const publicAssetExtensions = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico", ".woff", ".woff2", ".css", ".js"]);
const publicTextFileAllowlist = new Set(["robots.txt", "sitemap.xml"]);
const requiredEnvGroups = [
  {
    label: "Admin session signing",
    variables: ["ADMIN_SESSION_SECRET"],
  },
  {
    label: "Supabase server access",
    variables: ["SUPABASE_URL"],
    alternatives: [["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]],
  },
  {
    label: "Cloudinary media uploads",
    variables: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
  },
];

const nowIso = () => new Date().toISOString();
const randomToken = (size = 32) => crypto.randomBytes(size).toString("hex");
const ensureDirectory = (dirPath) => fs.mkdirSync(dirPath, { recursive: true });
const logProductUploadError = (message, detail = "") => {
  const line = `[${nowIso()}] ${message}${detail ? ` | ${detail}` : ""}`;
  console.error(line);
  ensureDirectory(path.dirname(uploadLogFile));
  fs.appendFileSync(uploadLogFile, `${line}\n`, "utf8");
};
const readDefaultData = () => {
  const raw = fs.readFileSync(defaultDataFile, "utf8");
  return JSON.parse(raw);
};
const parseOrigin = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    return new URL(normalized).origin;
  } catch (error) {
    return "";
  }
};
const buildContentSecurityPolicy = () => {
  const connectSrc = new Set(["'self'"]);
  const imgSrc = new Set(["'self'", "data:", "blob:"]);
  const styleSrc = new Set(["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]);
  const fontSrc = new Set(["'self'", "data:", "https://fonts.gstatic.com"]);
  const frameAncestors = new Set(["'self'"]);
  const formAction = new Set(["'self'", "mailto:", "https://wa.me", "https://api.whatsapp.com"]);

  const supabaseOrigin = parseOrigin(process.env.SUPABASE_URL);
  const renderOrigin = parseOrigin(process.env.RENDER_EXTERNAL_URL);
  const adminOrigin = parseOrigin(process.env.ADMIN_URL);

  [supabaseOrigin, renderOrigin, adminOrigin].filter(Boolean).forEach((origin) => connectSrc.add(origin));
  imgSrc.add("https://res.cloudinary.com");

  return [
    "default-src 'self'",
    `script-src 'self'`,
    `style-src ${Array.from(styleSrc).join(" ")}`,
    `img-src ${Array.from(imgSrc).join(" ")}`,
    `font-src ${Array.from(fontSrc).join(" ")}`,
    `connect-src ${Array.from(connectSrc).join(" ")}`,
    `form-action ${Array.from(formAction).join(" ")}`,
    `navigate-to ${Array.from(formAction).join(" ")}`,
    "base-uri 'self'",
    `frame-ancestors ${Array.from(frameAncestors).join(" ")}`,
    "object-src 'none'",
  ].join("; ");
};
const getSecurityHeaders = (headers = {}) => ({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": buildContentSecurityPolicy(),
  ...headers,
});

const decodePathnameRepeatedly = (value, maxDepth = 3) => {
  let current = String(value || "/");

  for (let index = 0; index < maxDepth; index += 1) {
    let decoded;

    try {
      decoded = decodeURIComponent(current);
    } catch (error) {
      return null;
    }

    if (decoded === current) {
      return decoded;
    }

    current = decoded;
  }

  return current;
};

const normalizePublicRequestPath = (requestPath) => {
  const decoded = decodePathnameRepeatedly(requestPath);

  if (!decoded || decoded.includes("\0") || decoded.includes("\\")) {
    return null;
  }

  if (/^[A-Za-z]:/.test(decoded) || decoded.startsWith("//")) {
    return null;
  }

  const normalized = path.posix.normalize(decoded.startsWith("/") ? decoded : `/${decoded}`);
  const segments = normalized.split("/").filter(Boolean);

  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.startsWith(".") ||
        segment.includes(":")
    )
  ) {
    return null;
  }

  return normalized === "/" ? "/" : `/${segments.join("/")}`;
};

const isPathInside = (basePath, targetPath) => {
  const relative = path.relative(basePath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const safePublicFilePath = (relativePath) => {
  const absolutePath = path.resolve(publicRoot, relativePath);

  if (!isPathInside(publicRoot, absolutePath) || !fs.existsSync(absolutePath)) {
    return null;
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    return null;
  }

  const realPublicRoot = fs.realpathSync(publicRoot);
  const realFilePath = fs.realpathSync(absolutePath);
  return isPathInside(realPublicRoot, realFilePath) ? realFilePath : null;
};

const resolvePublicFile = (requestPath) => {
  const normalizedPath = normalizePublicRequestPath(requestPath);

  if (!normalizedPath) {
    return null;
  }

  if (pageRouteMap.has(normalizedPath)) {
    return safePublicFilePath(pageRouteMap.get(normalizedPath));
  }

  const segments = normalizedPath.slice(1).split("/").filter(Boolean);

  if (!segments.length) {
    return null;
  }

  if (segments.length === 1) {
    const fileName = segments[0];

    if (!publicRootFileAllowlist.has(fileName)) {
      return null;
    }

    if (fileName.endsWith(".txt") || fileName.endsWith(".xml")) {
      return publicTextFileAllowlist.has(fileName) ? safePublicFilePath(fileName) : null;
    }

    return safePublicFilePath(fileName);
  }

  if (segments[0] === "assets") {
    const extension = path.extname(segments[segments.length - 1]).toLowerCase();
    return publicAssetExtensions.has(extension) ? safePublicFilePath(path.join(...segments)) : null;
  }

  if (segments[0] === "admin" && segments.length === 2 && adminStaticFileAllowlist.has(segments[1])) {
    return safePublicFilePath(path.join(...segments));
  }

  return null;
};

const send = (response, statusCode, body, contentType = "text/plain; charset=utf-8", headers = {}) => {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    ...getSecurityHeaders(headers),
  });
  response.end(body);
};

const sendJson = (response, statusCode, payload, headers = {}) =>
  send(response, statusCode, JSON.stringify(payload), "application/json; charset=utf-8", headers);

const reportStartupEnvWarnings = () => {
  for (const group of requiredEnvGroups) {
    const missingVariables = (group.variables || []).filter((name) => !String(process.env[name] || "").trim());
    const missingAlternatives = (group.alternatives || [])
      .map((names) => ({
        names,
        missing: names.filter((name) => !String(process.env[name] || "").trim()),
      }))
      .filter((entry) => entry.missing.length === entry.names.length);

    if (!missingVariables.length && !missingAlternatives.length) {
      continue;
    }

    const missingNames = [
      ...missingVariables,
      ...missingAlternatives.map((entry) => entry.names.join(" or ")),
    ];
    console.warn(`[startup] ${group.label} is not fully configured. Missing: ${missingNames.join(", ")}`);
  }
};

const readJsonBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("Request body too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    request.on("error", reject);
  });

const readMultipartFormData = async (request) => {
  const formRequest = new Request("http://127.0.0.1/upload", {
    method: request.method,
    headers: request.headers,
    body: Readable.toWeb(request),
    duplex: "half",
  });
  return formRequest.formData();
};

const normalizeUsageType = (value) => {
  const usageType = String(value || "misc").trim();
  return usageType || "misc";
};

const normalizeMediaAssetResponse = (asset) => ({
  id: String(asset?.id || "").trim(),
  publicId: String(asset?.publicId || "").trim(),
  secureUrl: String(asset?.secureUrl || asset?.url || "").trim(),
  url: String(asset?.secureUrl || asset?.url || "").trim(),
  originalFilename: String(asset?.originalFilename || "").trim(),
  displayName: String(asset?.displayName || asset?.name || asset?.originalFilename || "").trim(),
  folder: String(asset?.folder || "").trim(),
  resourceType: String(asset?.resourceType || "image").trim(),
  format: String(asset?.format || "").trim(),
  width: Number(asset?.width || 0),
  height: Number(asset?.height || 0),
  bytes: Number(asset?.bytes || 0),
  usageType: normalizeUsageType(asset?.usageType),
  createdAt: String(asset?.createdAt || nowIso()),
});

const storeUploadedAsset = async (file, options = {}) => {
  const usageType = normalizeUsageType(options.usageType);
  const uploaded = await uploadCloudinaryFile(file, {
    usageType,
  });
  const asset = await upsertSupabaseMediaAsset({
    ...uploaded,
    usageType,
    displayName: options.displayName || uploaded.displayName || file?.name || "",
    altText: options.altText || "",
  });
  return normalizeMediaAssetResponse(asset || { ...uploaded, usageType });
};

const storeUploadedAssets = async (files, options = {}) => {
  const usageType = normalizeUsageType(options.usageType);
  const uploadedAssets = await uploadCloudinaryFiles(files, {
    usageType,
  });
  const storedAssets = [];
  for (const uploaded of uploadedAssets) {
    const asset = await upsertSupabaseMediaAsset({
      ...uploaded,
      usageType,
      displayName: options.displayName || uploaded.displayName || uploaded.originalFilename || "",
      altText: options.altText || "",
    });
    storedAssets.push(normalizeMediaAssetResponse(asset || { ...uploaded, usageType }));
  }
  return storedAssets;
};

const resolveMediaAssetByToken = async (token) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return null;
  }

  const byId = await getSupabaseMediaAssetById(normalizedToken);
  if (byId) {
    return byId;
  }

  return getSupabaseMediaAssetByPublicId(normalizedToken);
};

const sendAdminMediaList = async (request, response, requestUrl) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const assets = await listSupabaseMediaAssets({
      query: requestUrl.searchParams.get("q") || "",
      usageType: requestUrl.searchParams.get("usageType") || "all",
      folder: requestUrl.searchParams.get("folder") || "all",
    });
    sendJson(response, 200, { assets });
  } catch (error) {
    console.error("[media] list failed:", error);
    sendJson(response, error?.status || 500, {
      error: error?.message || "Unable to load media assets.",
    });
  }

  return true;
};

const sendAdminMediaDetail = async (request, response, token) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const asset = await resolveMediaAssetByToken(token);
    if (!asset) {
      sendJson(response, 404, {
        error: "Media asset not found.",
      });
      return true;
    }

    sendJson(response, 200, {
      asset,
      references: await findSupabaseMediaReferences(asset),
    });
  } catch (error) {
    console.error("[media] detail failed:", error);
    sendJson(response, error?.status || 500, {
      error: error?.message || "Unable to load media asset.",
    });
  }

  return true;
};

const handleAdminMediaUpload = async (request, response) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const formData = await readMultipartFormData(request);
    const file = formData.get("file");

    if (!(file instanceof File)) {
      sendJson(response, 400, {
        error: "No image file was selected.",
      });
      return true;
    }

    const asset = await storeUploadedAsset(file, {
      usageType: formData.get("usageType"),
      displayName: formData.get("displayName"),
      altText: formData.get("altText"),
    });
    sendJson(response, 201, {
      ok: true,
      asset,
    });
  } catch (error) {
    logProductUploadError("Media upload failed", error?.stack || error?.message || String(error));
    sendJson(response, error?.status || 400, {
      error: error?.message || "Image upload failed.",
    });
  }

  return true;
};

const handleAdminMediaUploadMultiple = async (request, response) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const formData = await readMultipartFormData(request);
    const files = formData
      .getAll("files")
      .filter((file) => file instanceof File);

    if (!files.length) {
      sendJson(response, 400, {
        error: "No image files were selected.",
      });
      return true;
    }

    const assets = await storeUploadedAssets(files, {
      usageType: formData.get("usageType"),
      displayName: formData.get("displayName"),
      altText: formData.get("altText"),
    });
    sendJson(response, 201, {
      ok: true,
      assets,
    });
  } catch (error) {
    logProductUploadError("Multiple media upload failed", error?.stack || error?.message || String(error));
    sendJson(response, error?.status || 400, {
      error: error?.message || "Image upload failed.",
    });
  }

  return true;
};

const handleAdminMediaDelete = async (request, response, token, requestUrl) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const asset = await resolveMediaAssetByToken(token);
    if (!asset) {
      sendJson(response, 404, {
        error: "Media asset not found.",
      });
      return true;
    }

    const references = await findSupabaseMediaReferences(asset);
    const forceDelete = ["1", "true", "yes"].includes(String(requestUrl.searchParams.get("force") || "").toLowerCase());

    if (references.length && !forceDelete) {
      sendJson(response, 409, {
        error: "This media asset is still referenced. Confirm deletion to continue.",
        references,
      });
      return true;
    }

    await destroyCloudinaryAsset(asset.publicId || token);
    await deleteSupabaseMediaAssetById(asset.id);
    sendJson(response, 200, {
      ok: true,
      deletedId: asset.id,
      deletedPublicId: asset.publicId,
      references,
    });
  } catch (error) {
    console.error("[media] delete failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to delete media asset.",
    });
  }

  return true;
};

const hashPassword = (password, salt = randomToken(16)) => ({
  passwordSalt: salt,
  passwordHash: crypto.scryptSync(password, salt, 64).toString("hex"),
});

const verifyPassword = (password, record) => {
  if (!record || !password) {
    return false;
  }

  const expected = Buffer.from(String(record.passwordHash || ""), "hex");
  const actual = crypto.scryptSync(password, String(record.passwordSalt || ""), 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

const encodeBase64Url = (value) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const decodeBase64Url = (value) => {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(String(value || "").length / 4) * 4, "=");
  return Buffer.from(normalized, "base64").toString("utf8");
};

const signSessionPayload = (payload, secret) =>
  crypto.createHmac("sha256", secret).update(payload).digest("base64url");

const parseCookies = (request) =>
  String(request.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((accumulator, item) => {
      const separatorIndex = item.indexOf("=");
      if (separatorIndex === -1) {
        return accumulator;
      }
      const key = item.slice(0, separatorIndex).trim();
      const value = item.slice(separatorIndex + 1).trim();
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});

const parseRequestHostname = (request) => {
  const hostHeader = String(request?.headers?.host || "").trim().toLowerCase();
  if (!hostHeader) {
    return "";
  }

  if (hostHeader.startsWith("[")) {
    const closingIndex = hostHeader.indexOf("]");
    return closingIndex === -1 ? hostHeader : hostHeader.slice(1, closingIndex);
  }

  const separatorIndex = hostHeader.indexOf(":");
  return separatorIndex === -1 ? hostHeader : hostHeader.slice(0, separatorIndex);
};

const isLocalCookieHost = (hostname) => {
  const normalizedHost = String(hostname || "").trim().toLowerCase();
  if (!normalizedHost) {
    return false;
  }

  if (
    normalizedHost === "localhost" ||
    normalizedHost === "::1" ||
    normalizedHost === "127.0.0.1"
  ) {
    return true;
  }

  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalizedHost)) {
    return true;
  }

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalizedHost)) {
    return true;
  }

  const private172Match = normalizedHost.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (private172Match) {
    const secondOctet = Number.parseInt(private172Match[1], 10);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
};

const shouldUseSecureAdminCookie = (request) => isProduction && !isLocalCookieHost(parseRequestHostname(request));

const serializeCookie = (name, value, options = {}) => {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires instanceof Date && !Number.isNaN(options.expires.getTime())) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  parts.push(`Path=${options.path || "/"}`);
  parts.push(`SameSite=${options.sameSite || "Lax"}`);

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
};

const clearAdminSessionCookie = (request) =>
  serializeCookie(adminSessionCookieName, "", {
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: shouldUseSecureAdminCookie(request),
  });

const getAdminSessionSecret = () => String(process.env.ADMIN_SESSION_SECRET || "").trim();

const ensureAdminSessionSecret = (response) => {
  const secret = getAdminSessionSecret();
  if (secret) {
    return secret;
  }

  sendJson(response, 503, {
    error: "Admin session signing is not configured. Set ADMIN_SESSION_SECRET.",
  });
  return null;
};

const buildAdminSessionCookie = (record, sessionSecret, request) => {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + adminSessionMaxAgeSeconds * 1000;
  const payload = JSON.stringify({
    email: record.email,
    version: record.sessionVersion,
    issuedAt,
    expiresAt,
    loggedInAt: new Date(issuedAt).toISOString(),
  });
  const encodedPayload = encodeBase64Url(payload);
  const signature = signSessionPayload(encodedPayload, sessionSecret);

  return serializeCookie(adminSessionCookieName, `${encodedPayload}.${signature}`, {
    maxAge: adminSessionMaxAgeSeconds,
    expires: new Date(expiresAt),
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: shouldUseSecureAdminCookie(request),
  });
};

const getAuthenticatedAdminSession = async (request, sessionSecret) => {
  const cookieValue = parseCookies(request)[adminSessionCookieName];

  if (!cookieValue) {
    return null;
  }

  const separatorIndex = cookieValue.lastIndexOf(".");
  if (separatorIndex === -1) {
    return null;
  }

  const encodedPayload = cookieValue.slice(0, separatorIndex);
  const signature = cookieValue.slice(separatorIndex + 1);
  const expectedSignature = signSessionPayload(encodedPayload, sessionSecret);

  try {
    const actualSignature = Buffer.from(signature, "utf8");
    const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");
    if (
      actualSignature.length !== expectedSignatureBuffer.length ||
      !crypto.timingSafeEqual(actualSignature, expectedSignatureBuffer)
    ) {
      return null;
    }

    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    const email = String(payload.email || "").trim().toLowerCase();
    const expiresAt = Number.parseInt(payload.expiresAt || 0, 10);
    const record = await getSupabaseAdminAuthByEmail(email);

    if (!record?.id || !record.isActive) {
      return null;
    }

    if (Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() >= expiresAt) {
      return null;
    }

    if (
      email !== record.email ||
      Number.parseInt(payload.version || 0, 10) !== record.sessionVersion
    ) {
      return null;
    }

    return {
      record,
      session: {
        authenticated: true,
        email: record.email,
        loggedInAt: String(payload.loggedInAt || ""),
      },
    };
  } catch (error) {
    return null;
  }
};

const requireAuthenticatedAdmin = async (request, response) => {
  const sessionSecret = ensureAdminSessionSecret(response);
  if (!sessionSecret) {
    return null;
  }

  let auth;
  try {
    auth = await getAuthenticatedAdminSession(request, sessionSecret);
  } catch (error) {
    sendJson(
      response,
      error?.status || 500,
      {
        error: error?.message || "Unable to verify admin session.",
      },
      {
        "Set-Cookie": clearAdminSessionCookie(request),
      }
    );
    return null;
  }

  if (!auth) {
    sendJson(
      response,
      401,
      {
        error: "Authentication required.",
      },
      {
        "Set-Cookie": clearAdminSessionCookie(request),
      }
    );
    return null;
  }

  return auth;
};

const supportPublicStreamClients = new Map();
const supportAdminStreamClients = new Set();

const writeSseEvent = (response, eventName, payload) => {
  if (!response || response.writableEnded) {
    return;
  }

  const body =
    payload === undefined
      ? ""
      : `data: ${JSON.stringify(payload)
          .split("\n")
          .join("\ndata: ")}\n`;
  response.write(`event: ${eventName}\n${body}\n`);
};

const createSseClient = (response, payload) => {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write("retry: 3000\n\n");
  writeSseEvent(response, "connected", payload);

  const heartbeat = setInterval(() => {
    if (!response.writableEnded) {
      response.write(": keep-alive\n\n");
    }
  }, 25000);

  return {
    response,
    isClosed: false,
    close() {
      if (this.isClosed) {
        return;
      }
      this.isClosed = true;
      clearInterval(heartbeat);
      if (!response.writableEnded) {
        response.end();
      }
    },
  };
};

const addSupportPublicStreamClient = (conversationId, client) => {
  const key = String(conversationId || "").trim();
  if (!key) {
    return;
  }

  const existing = supportPublicStreamClients.get(key) || new Set();
  existing.add(client);
  supportPublicStreamClients.set(key, existing);
};

const removeSupportPublicStreamClient = (conversationId, client) => {
  const key = String(conversationId || "").trim();
  if (!key) {
    return;
  }

  const existing = supportPublicStreamClients.get(key);
  if (!existing) {
    return;
  }

  existing.delete(client);
  if (!existing.size) {
    supportPublicStreamClients.delete(key);
  }
};

const broadcastSupportConversation = (conversation) => {
  const normalizedId = String(conversation?.id || "").trim();
  if (!normalizedId) {
    return;
  }

  const payload = {
    conversation,
    conversationId: normalizedId,
  };
  const publicClients = supportPublicStreamClients.get(normalizedId);
  if (publicClients?.size) {
    publicClients.forEach((client) => writeSseEvent(client.response, "support-conversation", payload));
  }
  supportAdminStreamClients.forEach((client) => writeSseEvent(client.response, "support-conversation", payload));
};

const broadcastSupportMessage = (conversation, message) => {
  const normalizedId = String(conversation?.id || message?.conversationId || "").trim();
  if (!normalizedId || !message?.id) {
    return;
  }

  const payload = {
    conversation,
    message,
    conversationId: normalizedId,
  };
  const publicClients = supportPublicStreamClients.get(normalizedId);
  if (publicClients?.size) {
    publicClients.forEach((client) => writeSseEvent(client.response, "support-message", payload));
  }
  supportAdminStreamClients.forEach((client) => writeSseEvent(client.response, "support-message", payload));
};

const parseProductIdFromPath = (pathname, prefix) => decodeURIComponent(pathname.slice(prefix.length)).trim();
const parseOrderIdFromPath = (pathname, prefix) => decodeURIComponent(pathname.slice(prefix.length)).trim();
const parseMediaAssetTokenFromPath = (pathname, prefix) => decodeURIComponent(pathname.slice(prefix.length)).trim();
const parseNestedOrderIdFromPath = (pathname, suffix) => {
  const prefix = "/api/orders/";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return "";
  }

  return decodeURIComponent(pathname.slice(prefix.length, pathname.length - suffix.length)).trim();
};
const parsePaymentIdFromPath = (pathname, prefix) => decodeURIComponent(pathname.slice(prefix.length)).trim();
const parseSupportConversationIdFromPath = (pathname, prefix) => decodeURIComponent(pathname.slice(prefix.length)).trim();
const parseNestedSupportConversationIdFromPath = (pathname, suffix) => {
  const prefix = "/api/support/conversations/";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return "";
  }

  return decodeURIComponent(pathname.slice(prefix.length, pathname.length - suffix.length)).trim();
};
const parseNestedAdminSupportConversationIdFromPath = (pathname, suffix) => {
  const prefix = "/api/admin/support/conversations/";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return "";
  }

  return decodeURIComponent(pathname.slice(prefix.length, pathname.length - suffix.length)).trim();
};

const sendProductList = async (response) => {
  const products = await listSupabaseProducts();
  sendJson(response, 200, { products });
};

const sendProductDetail = async (response, productId) => {
  const product = await getSupabaseProductById(productId);

  if (!product) {
    sendJson(response, 404, {
      error: "Product not found.",
    });
    return;
  }

  sendJson(response, 200, { product });
};

const handleProductWrite = async (request, response, mode, productId = "") => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const body = await readJsonBody(request);
    const product = body?.product;

    if (!product || typeof product !== "object" || !String(product.id || productId || "").trim()) {
      sendJson(response, 400, {
        error: "A valid product payload is required.",
      });
      return true;
    }

    const persistedProduct =
      mode === "create"
        ? await createSupabaseProduct(product)
        : mode === "update"
          ? await updateSupabaseProduct(productId || product.id, product)
          : await upsertSupabaseProduct(product);

    sendJson(response, 200, {
      ok: true,
      product: persistedProduct,
      products: await listSupabaseProducts(),
    });
  } catch (error) {
    console.error("[products] save failed:", error);
    sendJson(response, 400, {
      error: error?.message || "Unable to save product.",
    });
  }

  return true;
};

const handleProductDelete = async (request, response, productId) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  if (!productId) {
    sendJson(response, 400, {
      error: "Product id is required.",
    });
    return true;
  }

  try {
    const result = await deleteSupabaseProduct(productId);
    sendJson(response, 200, {
      ok: true,
      deletedId: result.deletedId,
      products: await listSupabaseProducts(),
    });
  } catch (error) {
    console.error("[products] delete failed:", error);
    sendJson(response, 400, {
      error: error?.message || "Unable to delete product.",
    });
  }

  return true;
};

const sendOrderList = async (request, response) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const orders = await listSupabaseOrders();
    sendJson(response, 200, { orders });
  } catch (error) {
    console.error("[orders] list failed:", error);
    sendJson(response, 500, {
      error: error?.message || "Unable to load orders.",
    });
  }

  return true;
};

const sendOrderDetail = async (response, orderId) => {
  try {
    const order = await getSupabaseOrderById(orderId);

    if (!order) {
      sendJson(response, 404, {
        error: "Order not found.",
      });
      return true;
    }

    sendJson(response, 200, { order });
  } catch (error) {
    console.error("[orders] detail failed:", error);
    sendJson(response, 500, {
      error: error?.message || "Unable to load order.",
    });
  }

  return true;
};

const sendOrderByNumber = async (response, orderNumber) => {
  try {
    const order = await getSupabaseOrderByNumber(orderNumber);

    if (!order) {
      sendJson(response, 404, {
        error: "Order not found.",
      });
      return true;
    }

    sendJson(response, 200, { order });
  } catch (error) {
    console.error("[orders] by-number failed:", error);
    sendJson(response, 500, {
      error: error?.message || "Unable to load order.",
    });
  }

  return true;
};

const handleOrderCreate = async (request, response) => {
  try {
    const body = await readJsonBody(request);
    const orderInput = body?.order && typeof body.order === "object" ? body.order : body;
    const order = await createSupabaseOrder(orderInput);

    const isWholesale = String(order?.purchaseMode || orderInput?.purchaseMode || "").toLowerCase() === "wholesale";
    const adminLink = buildAdminDeepLink("order", order?.id);
    notifyAdmin({
      type: isWholesale ? "new_wholesale_inquiry" : "new_retail_order",
      title: isWholesale ? "New wholesale inquiry" : "New retail order",
      message: `Order ${order?.orderNumber || order?.orderId || order?.id || "created"} created`,
      entityType: "order",
      entityId: order?.id,
      metadata: buildNotificationMetadata({
        customerName: order?.customerName || orderInput?.customerName,
        email: order?.email || orderInput?.email,
        timestamp: order?.createdAt || nowIso(),
        adminLink,
        orderNumber: order?.orderNumber || order?.orderId || "",
        relatedProductName: order?.productName || orderInput?.productName,
        purchaseMode: order?.purchaseMode || orderInput?.purchaseMode,
      }),
    });
    emailAdmin(isWholesale ? "wholesale" : "retail", {
      customerName: order?.customerName || orderInput?.customerName,
      email: order?.email || orderInput?.email,
      country: order?.country || orderInput?.country,
      product: order?.productName || orderInput?.productName,
      message: order?.message || orderInput?.message,
      time: order?.createdAt || nowIso(),
      adminUrl: adminLink,
    });

    sendJson(response, 201, {
      ok: true,
      order,
    });
  } catch (error) {
    console.error("[orders] create failed:", error);
    sendJson(response, 400, {
      error: error?.message || "Unable to create order.",
    });
  }

  return true;
};

const handleOrderUpdate = async (request, response, orderId) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const body = await readJsonBody(request);
    const order = await updateSupabaseOrder(orderId, body?.order && typeof body.order === "object" ? body.order : body, {
      createdBy: auth.session.email || "admin",
    });
    sendJson(response, 200, {
      ok: true,
      order,
    });
  } catch (error) {
    console.error("[orders] update failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to update order.",
    });
  }

  return true;
};

const handleOrderStatusUpdate = async (request, response, orderId, updateMode) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const body = await readJsonBody(request);
    const payload = body?.order && typeof body.order === "object" ? body.order : body;
    const value =
      updateMode === "order"
        ? payload?.orderStatus
        : updateMode === "payment"
          ? payload?.paymentStatus
          : payload?.shippingStatus;
    const order =
      updateMode === "order"
        ? await updateSupabaseOrderStatus(orderId, value, { createdBy: auth.session.email || "admin" })
        : updateMode === "payment"
          ? await updateSupabaseOrderPaymentStatus(orderId, value, { createdBy: auth.session.email || "admin" })
          : await updateSupabaseOrderShippingStatus(orderId, value, { createdBy: auth.session.email || "admin" });

    sendJson(response, 200, {
      ok: true,
      order,
    });
  } catch (error) {
    console.error("[orders] status update failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to update order status.",
    });
  }

  return true;
};

const handleOrderDelete = async (request, response, orderId) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const result = await deleteSupabaseOrder(orderId);
    sendJson(response, 200, {
      ok: true,
      deletedId: result.deletedId,
    });
  } catch (error) {
    console.error("[orders] delete failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to delete order.",
    });
  }

  return true;
};

const sendOrderPayments = async (response, orderId) => {
  try {
    const payments = await listSupabasePaymentsByOrder(orderId);
    sendJson(response, 200, { payments });
  } catch (error) {
    console.error("[payments] order payments load failed:", error);
    sendJson(response, error?.status || 500, {
      error: error?.message || "Unable to load payments.",
    });
  }

  return true;
};

const handleOrderPaymentCreate = async (request, response, orderId) => {
  try {
    const body = await readJsonBody(request);
    const paymentInput = body?.payment && typeof body.payment === "object" ? body.payment : body;
    const payload = await createSupabasePaymentForOrder(orderId, paymentInput);
    const adminLink = buildAdminDeepLink("order", payload.order?.id || orderId);
    notifyAdmin({
      type: "new_payment",
      title: "New payment received",
      message: `${payload.payment?.currency || "USD"} ${payload.payment?.amount || 0} for ${payload.order?.orderNumber || payload.order?.orderId || orderId}`,
      entityType: "payment",
      entityId: payload.payment?.id,
      metadata: buildNotificationMetadata({
        customerName: payload.order?.customerName,
        email: payload.order?.email,
        timestamp: payload.payment?.createdAt || nowIso(),
        adminLink,
        orderNumber: payload.order?.orderNumber || payload.order?.orderId || "",
        purchaseMode: payload.order?.purchaseMode,
        metadata: {
          orderId,
          amount: payload.payment?.amount || 0,
          currency: payload.payment?.currency || "USD",
          paymentMethod: payload.payment?.paymentMethod || "",
        },
      }),
    });
    sendJson(response, 201, {
      ok: true,
      payment: payload.payment,
      order: payload.order,
    });
  } catch (error) {
    console.error("[payments] create failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to create payment record.",
    });
  }

  return true;
};

const sendOrderEvents = async (request, response, orderId) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const events = await listSupabaseOrderEvents(orderId);
    sendJson(response, 200, { events });
  } catch (error) {
    console.error("[orders] events load failed:", error);
    sendJson(response, error?.status || 500, {
      error: error?.message || "Unable to load order events.",
    });
  }

  return true;
};

const handleOrderEventCreate = async (request, response, orderId) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const body = await readJsonBody(request);
    const eventInput = body?.event && typeof body.event === "object" ? body.event : body;
    const event = await createSupabaseOrderEvent(orderId, {
      ...eventInput,
      createdBy: auth.session.email || "admin",
    });
    sendJson(response, 201, {
      ok: true,
      event,
    });
  } catch (error) {
    console.error("[orders] event create failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to create order event.",
    });
  }

  return true;
};

const sendPaymentList = async (request, response) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const payments = await listSupabasePayments();
    sendJson(response, 200, { payments });
  } catch (error) {
    console.error("[payments] list failed:", error);
    sendJson(response, error?.status || 500, {
      error: error?.message || "Unable to load payments.",
    });
  }

  return true;
};

const sendPaymentDetail = async (request, response, paymentId) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const payment = await getSupabasePaymentById(paymentId);
    if (!payment) {
      sendJson(response, 404, {
        error: "Payment not found.",
      });
      return true;
    }

    sendJson(response, 200, { payment });
  } catch (error) {
    console.error("[payments] detail failed:", error);
    sendJson(response, error?.status || 500, {
      error: error?.message || "Unable to load payment.",
    });
  }

  return true;
};

const handlePaymentUpdate = async (request, response, paymentId) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const body = await readJsonBody(request);
    const paymentInput = body?.payment && typeof body.payment === "object" ? body.payment : body;
    const payment = await updateSupabasePayment(paymentId, paymentInput);
    sendJson(response, 200, {
      ok: true,
      payment,
    });
  } catch (error) {
    console.error("[payments] update failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to update payment.",
    });
  }

  return true;
};

const sendSupportConversation = async (response, conversationId) => {
  try {
    const conversation = await getSupabaseSupportConversationById(conversationId);

    if (!conversation) {
      sendJson(response, 404, {
        error: "Support conversation not found.",
      });
      return true;
    }

    sendJson(response, 200, { conversation });
  } catch (error) {
    console.error("[support] detail failed:", error);
    sendJson(response, error?.status || 500, {
      error: error?.message || "Unable to load support conversation.",
    });
  }

  return true;
};

const sendSupportMessages = async (response, conversationId, options = {}) => {
  try {
    const conversation = options.markCustomerRead
      ? await markSupabaseSupportConversationReadByCustomer(conversationId)
      : await getSupabaseSupportConversationById(conversationId);
    if (!conversation) {
      sendJson(response, 404, {
        error: "Support conversation not found.",
      });
      return true;
    }

    const messages = await listSupabaseSupportMessagesByConversation(conversationId);
    sendJson(response, 200, {
      conversation,
      messages,
    });
  } catch (error) {
    console.error("[support] messages failed:", error);
    sendJson(response, error?.status || 500, {
      error: error?.message || "Unable to load support messages.",
    });
  }

  return true;
};

const handleSupportConversationStream = async (request, response, conversationId) => {
  try {
    const conversation = await getSupabaseSupportConversationById(conversationId);
    if (!conversation?.id) {
      sendJson(response, 404, {
        error: "Support conversation not found.",
      });
      return true;
    }

    const client = createSseClient(response, {
      connectionState: "connected",
      role: "customer",
      conversationId: conversation.id,
      connectedAt: nowIso(),
    });
    addSupportPublicStreamClient(conversation.id, client);

    const cleanup = () => {
      removeSupportPublicStreamClient(conversation.id, client);
      client.close();
    };

    request.on("close", cleanup);
    response.on("close", cleanup);
  } catch (error) {
    console.error("[support] stream open failed:", error);
    sendJson(response, error?.status || 500, {
      error: error?.message || "Unable to open support stream.",
    });
  }

  return true;
};

const handleSupportConversationCreate = async (request, response) => {
  const startedAt = Date.now();
  try {
    const body = await readJsonBody(request);
    const input = body?.conversation && typeof body.conversation === "object" ? body.conversation : body;
    const result = await createSupabaseSupportConversation(input);
    const source = String(input?.source || result.conversation?.source || "support").toLowerCase();
    const conversationType = String(input?.conversationType || result.conversation?.conversationType || "general_contact").toLowerCase();
    const isContact = source === "contact";
    const isQuote = conversationType === "product_inquiry" || conversationType === "wholesale_inquiry";
    const notificationType = isContact ? "new_contact_inquiry" : isQuote ? "new_quote_request" : "new_support_message";
    const adminLink = buildAdminDeepLink("customers", result.conversation?.id);
    notifyAdmin({
      type: notificationType,
      title: isContact ? "New contact inquiry" : isQuote ? "New quote request" : "New support message",
      message: `${result.conversation?.customerName || input?.customerName || "A customer"} sent a new inquiry`,
      entityType: "conversation",
      entityId: result.conversation?.id,
      metadata: buildNotificationMetadata({
        customerName: result.conversation?.customerName || input?.customerName,
        email: result.conversation?.email || input?.email,
        timestamp: result.message?.createdAt || nowIso(),
        adminLink,
        relatedProductName: result.conversation?.relatedProductName || input?.productName,
        metadata: {
          source,
          conversationType,
          subject: result.conversation?.subject || input?.subject || "",
        },
      }),
    });
    emailAdmin(isContact ? "contact" : isQuote ? "quote" : "support", {
      customerName: result.conversation?.customerName || input?.customerName,
      email: result.conversation?.email || input?.email,
      country: result.conversation?.country || input?.customerCountry || input?.country,
      product: result.conversation?.relatedProductName || input?.productName || input?.product,
      message: result.message?.text || input?.message || input?.text,
      time: result.message?.createdAt || nowIso(),
      adminUrl: adminLink,
    });
    console.info(`[support][request][POST /api/support/conversations] total_ms=${Date.now() - startedAt}`);
    broadcastSupportConversation(result.conversation);
    broadcastSupportMessage(result.conversation, result.message);
    sendJson(response, 201, {
      ok: true,
      conversation: result.conversation,
      message: result.message,
    });
  } catch (error) {
    console.error("[support] create failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to create support conversation.",
    });
  }

  return true;
};

const handleContactCreate = async (request, response) => {
  try {
    const body = await readJsonBody(request);
    const input = body?.contact && typeof body.contact === "object" ? body.contact : body;
    const payload = validateContactPayload(input);
    const result = await createContactInquiry(payload);
    const adminLink = buildAdminDeepLink("customers", result.conversation?.id);

    notifyAdmin({
      type: "new_contact_inquiry",
      title: "New contact inquiry",
      message: `${payload.name} submitted a new contact inquiry.`,
      entityType: "conversation",
      entityId: result.conversation?.id,
      metadata: buildNotificationMetadata({
        customerName: payload.name,
        email: payload.email,
        timestamp: result.contactMessage?.created_at || nowIso(),
        adminLink,
        metadata: {
          source: "contact",
          subject: payload.subject,
          contactMessageId: result.contactMessage?.id || null,
        },
      }),
    });

    emailAdmin("contact", {
      customerName: payload.name,
      email: payload.email,
      country: payload.country,
      product: payload.subject,
      message: payload.company ? `Company: ${payload.company}\n\n${payload.message}` : payload.message,
      time: result.contactMessage?.created_at || nowIso(),
      adminUrl: adminLink,
    });

    broadcastSupportConversation(result.conversation);
    broadcastSupportMessage(result.conversation, result.firstMessage);

    sendJson(response, 201, {
      ok: true,
      inquiry: {
        id: result.contactMessage?.id || "",
        status: result.contactMessage?.status || "unprocessed",
      },
      conversation: result.conversation,
    });
  } catch (error) {
    console.error("[contact] create failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to submit contact inquiry.",
    });
  }

  return true;
};

const handleSupportCustomerMessageCreate = async (request, response, conversationId) => {
  const startedAt = Date.now();
  try {
    const body = await readJsonBody(request);
    const messageInput = body?.message && typeof body.message === "object" ? body.message : body;
    const result = await addSupabaseCustomerSupportMessage(conversationId, messageInput);
    const adminLink = buildAdminDeepLink("customers", result.conversation?.id || conversationId);
    notifyAdmin({
      type: "customer_reply",
      title: "Customer replied to conversation",
      message: `${result.conversation?.customerName || "A customer"} sent a new support message`,
      entityType: "conversation",
      entityId: result.conversation?.id || conversationId,
      metadata: buildNotificationMetadata({
        customerName: result.conversation?.customerName,
        email: result.conversation?.email,
        timestamp: result.message?.createdAt || nowIso(),
        adminLink,
        relatedProductName: result.conversation?.relatedProductName,
        metadata: {
          conversationType: result.conversation?.conversationType || "",
        },
      }),
    });
    emailAdmin("support", {
      customerName: result.conversation?.customerName,
      email: result.conversation?.email,
      country: result.conversation?.country,
      product: result.conversation?.relatedProductName,
      message: result.message?.text || messageInput?.text,
      time: result.message?.createdAt || nowIso(),
      adminUrl: adminLink,
    });
    console.info(
      `[support][request][POST /api/support/conversations/:id/messages] total_ms=${Date.now() - startedAt} conversation_id=${conversationId}`
    );
    broadcastSupportConversation(result.conversation);
    broadcastSupportMessage(result.conversation, result.message);
    sendJson(response, 201, {
      ok: true,
      conversation: result.conversation,
      message: result.message,
    });
  } catch (error) {
    console.error("[support] customer reply failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to send support reply.",
    });
  }

  return true;
};

const sendPublicSiteConfig = async (response) => {
  try {
    const config = await getSupabaseSiteConfig();
    sendJson(response, 200, config);
  } catch (error) {
    console.error("[site-config] public read failed:", error);
    sendJson(response, error?.status || 500, {
      error: error?.message || "Unable to load site configuration.",
    });
  }

  return true;
};

const sendAdminSiteConfig = async (request, response) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const config = await getSupabaseSiteConfig();
    sendJson(response, 200, config);
  } catch (error) {
    console.error("[site-config-admin] read failed:", error);
    sendJson(response, error?.status || 500, {
      error: error?.message || "Unable to load admin site configuration.",
    });
  }

  return true;
};

const handleAdminSiteConfigPatch = async (request, response) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const body = await readJsonBody(request);
    const input = body?.siteConfig && typeof body.siteConfig === "object" ? body.siteConfig : body;
    const config = await updateSupabaseSiteConfig(input);
    sendJson(response, 200, {
      ok: true,
      siteConfig: config,
      ...config,
    });
  } catch (error) {
    console.error("[site-config-admin] patch failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to update site configuration.",
    });
  }

  return true;
};

const handleAdminSiteConfigSectionPatch = async (request, response, section) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  const normalizedSection = String(section || "").trim();
  if (!CMS_ALLOWED_SECTIONS.has(normalizedSection)) {
    sendJson(response, 400, {
      error: "Unknown CMS section.",
    });
    return true;
  }

  try {
    const body = await readJsonBody(request);
    const value =
      body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "value") ? body.value : body;
    const config = await updateSupabaseSiteConfigSection(normalizedSection, value);
    sendJson(response, 200, {
      ok: true,
      section: normalizedSection,
      siteConfig: config,
      ...config,
    });
  } catch (error) {
    console.error("[site-config-admin] section patch failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to update CMS section.",
    });
  }

  return true;
};

const sendAdminSupportConversationList = async (request, response, requestUrl) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const conversations = await listSupabaseAdminSupportConversations({
      query: requestUrl.searchParams.get("q") || "",
      status: requestUrl.searchParams.get("status") || "",
      conversationType: requestUrl.searchParams.get("type") || "",
    });
    sendJson(response, 200, { conversations });
  } catch (error) {
    console.error("[support-admin] list failed:", error);
    sendJson(response, error?.status || 500, {
      error: error?.message || "Unable to load support conversations.",
    });
  }

  return true;
};

const sendAdminSupportConversation = async (request, response, conversationId) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  return sendSupportConversation(response, conversationId);
};

const sendAdminSupportMessages = async (request, response, conversationId) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  return sendSupportMessages(response, conversationId);
};

const handleAdminSupportMessageCreate = async (request, response, conversationId) => {
  const startedAt = Date.now();
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const body = await readJsonBody(request);
    const messageInput = body?.message && typeof body.message === "object" ? body.message : body;
    const result = await addSupabaseAdminSupportMessage(conversationId, messageInput);
    console.info(
      `[support][request][POST /api/admin/support/conversations/:id/messages] total_ms=${Date.now() - startedAt} conversation_id=${conversationId}`
    );
    broadcastSupportConversation(result.conversation);
    broadcastSupportMessage(result.conversation, result.message);
    sendJson(response, 201, {
      ok: true,
      conversation: result.conversation,
      message: result.message,
    });
  } catch (error) {
    console.error("[support-admin] reply failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to send admin support reply.",
    });
  }

  return true;
};

const handleAdminSupportStream = async (request, response) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  const client = createSseClient(response, {
    connectionState: "connected",
    role: "admin",
    connectedAt: nowIso(),
  });
  supportAdminStreamClients.add(client);

  const cleanup = () => {
    supportAdminStreamClients.delete(client);
    client.close();
  };

  request.on("close", cleanup);
  response.on("close", cleanup);
  return true;
};

const handleAdminSupportConversationUpdate = async (request, response, conversationId) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const body = await readJsonBody(request);
    const input = body?.conversation && typeof body.conversation === "object" ? body.conversation : body;
    const conversation = await updateSupabaseSupportConversationStatus(conversationId, input.status);
    broadcastSupportConversation(conversation);
    sendJson(response, 200, {
      ok: true,
      conversation,
    });
  } catch (error) {
    console.error("[support-admin] update failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to update support conversation.",
    });
  }

  return true;
};

const handleAdminSupportConversationRead = async (request, response, conversationId) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) {
    return true;
  }

  try {
    const conversation = await markSupabaseSupportConversationRead(conversationId);
    broadcastSupportConversation(conversation);
    sendJson(response, 200, {
      ok: true,
      conversation,
    });
  } catch (error) {
    console.error("[support-admin] read failed:", error);
    sendJson(response, error?.status || 400, {
      error: error?.message || "Unable to mark support conversation read.",
    });
  }

  return true;
};

const handleAdminCustomerUpdate = async (request, response, customerId) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) return true;
  try {
    const body = await readJsonBody(request);
    const customer = await updateSupabaseCustomerProfile(customerId, body?.customer || body);
    sendJson(response, 200, { ok: true, customer });
  } catch (error) {
    sendJson(response, error?.status || 400, { error: error?.message || "Unable to update customer." });
  }
  return true;
};

const sendAdminNotifications = async (request, response) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) return true;
  try {
    const [notifications, unreadCount] = await Promise.all([listNotifications(60), getUnreadNotificationCount()]);
    sendJson(response, 200, { notifications, unreadCount });
  } catch (error) {
    sendJson(response, 500, { error: error?.message || "Unable to load notifications." });
  }
  return true;
};

const handleAdminNotificationRead = async (request, response, notificationId) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) return true;
  try {
    const notification = await markNotificationRead(notificationId);
    sendJson(response, 200, { ok: true, notification });
  } catch (error) {
    sendJson(response, 400, { error: error?.message || "Unable to mark notification read." });
  }
  return true;
};

const handleAdminNotificationsReadAll = async (request, response) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) return true;
  await markAllNotificationsRead();
  sendJson(response, 200, { ok: true });
  return true;
};

const sendAdminGlobalSearch = async (request, response, requestUrl) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) return true;
  const query = String(requestUrl.searchParams.get("q") || "").trim().toLowerCase();
  if (query.length < 2) {
    sendJson(response, 200, { results: [] });
    return true;
  }
  const settled = await Promise.allSettled([
    listSupabaseOrders(), listSupabaseProducts(), listSupabasePayments(), listSupabaseAdminSupportConversations({ query }),
  ]);
  const values = settled.map((item) => item.status === "fulfilled" && Array.isArray(item.value) ? item.value : []);
  const includesQuery = (item) => JSON.stringify(item || {}).toLowerCase().includes(query);
  const results = [
    ...values[0].filter(includesQuery).slice(0, 8).map((item) => ({ type: "order", id: item.id, title: item.orderNumber || item.orderId || item.id, subtitle: `${item.customerName || "Customer"} · ${item.email || ""}`, section: "orders" })),
    ...values[1].filter(includesQuery).slice(0, 8).map((item) => ({ type: "product", id: item.id, title: item.name || item.id, subtitle: item.category || "Product", section: "products" })),
    ...values[2].filter(includesQuery).slice(0, 8).map((item) => ({ type: "payment", id: item.id, title: item.paymentId || item.id, subtitle: `${item.customer || "Customer"} · ${item.amount || 0} ${item.currency || "USD"}`, section: "payments" })),
    ...values[3].filter(includesQuery).slice(0, 8).map((item) => ({ type: "conversation", id: item.id, title: item.customerName || item.email || "Conversation", subtitle: item.lastMessageText || item.subject || "Customer message", section: "customers" })),
  ].slice(0, 20);
  sendJson(response, 200, { results });
  return true;
};

const sendAdminSystemValidation = async (request, response) => {
  const auth = await requireAuthenticatedAdmin(request, response);
  if (!auth) return true;
  const email = await verifyEmailTransport().catch((error) => ({
    ...getEmailConfigurationStatus(),
    verified: false,
    error: error.message,
  }));
  const [orders, customers, payments, conversations] = await Promise.all([
    listSupabaseOrders().catch(() => []),
    listSupabaseAdminSupportConversations({}).then((items) => new Set(items.map((item) => item.customerId).filter(Boolean))).catch(() => new Set()),
    listSupabasePayments().catch(() => []),
    listSupabaseAdminSupportConversations({}).catch(() => []),
  ]);
  sendJson(response, 200, {
    ok: true,
    email,
    counts: { orders: orders.length, customers: customers.size, payments: payments.length, messages: conversations.reduce((sum, item) => sum + Number(item.adminUnreadCount || 0), 0) },
    authenticated: true,
  });
  return true;
};

const handleAdminApi = async (request, response, requestUrl) => {
  if (requestUrl.pathname === "/api/contact" && request.method === "POST") {
    return handleContactCreate(request, response);
  }

  if (requestUrl.pathname === "/api/support/conversations" && request.method === "POST") {
    return handleSupportConversationCreate(request, response);
  }

  if (requestUrl.pathname === "/api/site-config" && request.method === "GET") {
    return sendPublicSiteConfig(response);
  }

  if (requestUrl.pathname.startsWith("/api/support/conversations/") && requestUrl.pathname.endsWith("/stream") && request.method === "GET") {
    return handleSupportConversationStream(
      request,
      response,
      parseNestedSupportConversationIdFromPath(requestUrl.pathname, "/stream")
    );
  }

  if (requestUrl.pathname.startsWith("/api/support/conversations/") && requestUrl.pathname.endsWith("/messages")) {
    const conversationId = parseNestedSupportConversationIdFromPath(requestUrl.pathname, "/messages");
    if (request.method === "GET") {
      return sendSupportMessages(response, conversationId, { markCustomerRead: true });
    }
    if (request.method === "POST") {
      return handleSupportCustomerMessageCreate(request, response, conversationId);
    }
  }

  if (requestUrl.pathname.startsWith("/api/support/conversations/") && request.method === "GET") {
    return sendSupportConversation(response, parseSupportConversationIdFromPath(requestUrl.pathname, "/api/support/conversations/"));
  }

  if (requestUrl.pathname === "/api/admin/support/conversations" && request.method === "GET") {
    return sendAdminSupportConversationList(request, response, requestUrl);
  }

  if (requestUrl.pathname === "/api/admin/notifications" && request.method === "GET") {
    return sendAdminNotifications(request, response);
  }

  if (requestUrl.pathname.startsWith("/api/admin/customers/") && request.method === "PATCH") {
    return handleAdminCustomerUpdate(request, response, decodeURIComponent(requestUrl.pathname.slice("/api/admin/customers/".length)));
  }

  if (requestUrl.pathname === "/api/admin/notifications/read-all" && request.method === "POST") {
    return handleAdminNotificationsReadAll(request, response);
  }

  if (requestUrl.pathname.startsWith("/api/admin/notifications/") && requestUrl.pathname.endsWith("/read") && request.method === "POST") {
    const id = decodeURIComponent(requestUrl.pathname.slice("/api/admin/notifications/".length, -"/read".length));
    return handleAdminNotificationRead(request, response, id);
  }

  if (requestUrl.pathname === "/api/admin/search" && request.method === "GET") {
    return sendAdminGlobalSearch(request, response, requestUrl);
  }

  if (requestUrl.pathname === "/api/admin/system/validation" && request.method === "GET") {
    return sendAdminSystemValidation(request, response);
  }

  if (requestUrl.pathname === "/api/admin/support/stream" && request.method === "GET") {
    return handleAdminSupportStream(request, response);
  }

  if (requestUrl.pathname === "/api/admin/site-config" && request.method === "GET") {
    return sendAdminSiteConfig(request, response);
  }

  if (requestUrl.pathname === "/api/admin/site-config" && request.method === "PATCH") {
    return handleAdminSiteConfigPatch(request, response);
  }

  if (requestUrl.pathname.startsWith("/api/admin/site-config/") && request.method === "PATCH") {
    return handleAdminSiteConfigSectionPatch(
      request,
      response,
      parseSupportConversationIdFromPath(requestUrl.pathname, "/api/admin/site-config/")
    );
  }

  if (requestUrl.pathname.startsWith("/api/admin/support/conversations/") && requestUrl.pathname.endsWith("/messages")) {
    const conversationId = parseNestedAdminSupportConversationIdFromPath(requestUrl.pathname, "/messages");
    if (request.method === "GET") {
      return sendAdminSupportMessages(request, response, conversationId);
    }
    if (request.method === "POST") {
      return handleAdminSupportMessageCreate(request, response, conversationId);
    }
  }

  if (requestUrl.pathname.startsWith("/api/admin/support/conversations/") && requestUrl.pathname.endsWith("/read") && request.method === "POST") {
    return handleAdminSupportConversationRead(
      request,
      response,
      parseNestedAdminSupportConversationIdFromPath(requestUrl.pathname, "/read")
    );
  }

  if (requestUrl.pathname.startsWith("/api/admin/support/conversations/") && request.method === "GET") {
    return sendAdminSupportConversation(
      request,
      response,
      parseSupportConversationIdFromPath(requestUrl.pathname, "/api/admin/support/conversations/")
    );
  }

  if (requestUrl.pathname.startsWith("/api/admin/support/conversations/") && request.method === "PATCH") {
    return handleAdminSupportConversationUpdate(
      request,
      response,
      parseSupportConversationIdFromPath(requestUrl.pathname, "/api/admin/support/conversations/")
    );
  }

  if (requestUrl.pathname === "/api/orders" && request.method === "POST") {
    return handleOrderCreate(request, response);
  }

  if (requestUrl.pathname === "/api/orders" && request.method === "GET") {
    return sendOrderList(request, response);
  }

  if (requestUrl.pathname === "/api/payments" && request.method === "GET") {
    return sendPaymentList(request, response);
  }

  if (requestUrl.pathname.startsWith("/api/orders/by-number/") && request.method === "GET") {
    return sendOrderByNumber(response, parseOrderIdFromPath(requestUrl.pathname, "/api/orders/by-number/"));
  }

  if (requestUrl.pathname.startsWith("/api/orders/") && requestUrl.pathname.endsWith("/payments")) {
    const orderId = parseNestedOrderIdFromPath(requestUrl.pathname, "/payments");
    if (request.method === "GET") {
      return sendOrderPayments(response, orderId);
    }
    if (request.method === "POST") {
      return handleOrderPaymentCreate(request, response, orderId);
    }
  }

  if (requestUrl.pathname.startsWith("/api/orders/") && requestUrl.pathname.endsWith("/events")) {
    const orderId = parseNestedOrderIdFromPath(requestUrl.pathname, "/events");
    if (request.method === "GET") {
      return sendOrderEvents(request, response, orderId);
    }
    if (request.method === "POST") {
      return handleOrderEventCreate(request, response, orderId);
    }
  }

  if (requestUrl.pathname.startsWith("/api/orders/") && requestUrl.pathname.endsWith("/order-status") && request.method === "PATCH") {
    return handleOrderStatusUpdate(
      request,
      response,
      parseNestedOrderIdFromPath(requestUrl.pathname, "/order-status"),
      "order"
    );
  }

  if (requestUrl.pathname.startsWith("/api/orders/") && requestUrl.pathname.endsWith("/payment-status") && request.method === "PATCH") {
    return handleOrderStatusUpdate(
      request,
      response,
      parseNestedOrderIdFromPath(requestUrl.pathname, "/payment-status"),
      "payment"
    );
  }

  if (requestUrl.pathname.startsWith("/api/orders/") && requestUrl.pathname.endsWith("/shipping-status") && request.method === "PATCH") {
    return handleOrderStatusUpdate(
      request,
      response,
      parseNestedOrderIdFromPath(requestUrl.pathname, "/shipping-status"),
      "shipping"
    );
  }

  if (requestUrl.pathname.startsWith("/api/orders/") && request.method === "GET") {
    return sendOrderDetail(response, parseOrderIdFromPath(requestUrl.pathname, "/api/orders/"));
  }

  if (requestUrl.pathname.startsWith("/api/orders/") && request.method === "PATCH") {
    return handleOrderUpdate(request, response, parseOrderIdFromPath(requestUrl.pathname, "/api/orders/"));
  }

  if (requestUrl.pathname.startsWith("/api/orders/") && request.method === "DELETE") {
    return handleOrderDelete(request, response, parseOrderIdFromPath(requestUrl.pathname, "/api/orders/"));
  }

  if (requestUrl.pathname.startsWith("/api/payments/") && request.method === "GET") {
    return sendPaymentDetail(request, response, parsePaymentIdFromPath(requestUrl.pathname, "/api/payments/"));
  }

  if (requestUrl.pathname.startsWith("/api/payments/") && request.method === "PATCH") {
    return handlePaymentUpdate(request, response, parsePaymentIdFromPath(requestUrl.pathname, "/api/payments/"));
  }

  if (requestUrl.pathname === "/api/products" && request.method === "GET") {
    await sendProductList(response);
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/products/") && request.method === "GET") {
    await sendProductDetail(response, parseProductIdFromPath(requestUrl.pathname, "/api/products/"));
    return true;
  }

  if (requestUrl.pathname === "/api/products" && request.method === "POST") {
    return handleProductWrite(request, response, "create");
  }

  if (requestUrl.pathname.startsWith("/api/products/") && request.method === "PUT") {
    return handleProductWrite(
      request,
      response,
      "update",
      parseProductIdFromPath(requestUrl.pathname, "/api/products/")
    );
  }

  if (requestUrl.pathname.startsWith("/api/products/") && request.method === "DELETE") {
    return handleProductDelete(request, response, parseProductIdFromPath(requestUrl.pathname, "/api/products/"));
  }

  if (requestUrl.pathname === "/api/admin/session" && request.method === "GET") {
    try {
      const sessionSecret = ensureAdminSessionSecret(response);
      if (!sessionSecret) {
        return true;
      }

      const record = await getSupabaseActiveAdminAuth();
      const auth = await getAuthenticatedAdminSession(request, sessionSecret);

      sendJson(
        response,
        200,
        {
          authenticated: Boolean(auth?.session),
          hasAccount: Boolean(record),
          session: auth?.session || null,
        },
        auth?.session
          ? {}
          : {
              "Set-Cookie": clearAdminSessionCookie(request),
            }
      );
    } catch (error) {
      sendJson(response, error?.status || 500, {
        error: error?.message || "Unable to load admin session.",
      });
    }
    return true;
  }

  if (requestUrl.pathname === "/api/admin/bootstrap" && request.method === "POST") {
    try {
      if (await getSupabaseActiveAdminAuth()) {
        sendJson(response, 409, {
          error: "Admin account already exists.",
        });
        return true;
      }

      const body = await readJsonBody(request);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!email || !password) {
        sendJson(response, 400, {
          error: "Email and password are required.",
        });
        return true;
      }

      const timestamp = nowIso();
      const passwordRecord = hashPassword(password);
      const createdAccount = await createSupabaseAdminAuthAccount({
        email,
        ...passwordRecord,
        sessionVersion: 1,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      sendJson(response, 201, {
        ok: true,
        email: createdAccount?.email || email,
      });
    } catch (error) {
      sendJson(response, error?.status || 500, {
        error: error?.message || "Unable to create admin account.",
      });
    }
    return true;
  }

  if (requestUrl.pathname === "/api/admin/login" && request.method === "POST") {
    try {
      const sessionSecret = ensureAdminSessionSecret(response);
      if (!sessionSecret) {
        return true;
      }

      if (!(await getSupabaseActiveAdminAuth())) {
        sendJson(response, 503, {
          error: "No admin account is configured yet.",
        });
        return true;
      }

      const body = await readJsonBody(request);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const record = await getSupabaseAdminAuthByEmail(email);

      if (!email || !password || !record?.isActive || !verifyPassword(password, record)) {
        sendJson(
          response,
          401,
          {
            error: "Invalid email or password.",
          },
          {
            "Set-Cookie": clearAdminSessionCookie(request),
          }
        );
        return true;
      }

      await touchSupabaseAdminLastLogin(record.id);

      sendJson(
        response,
        200,
        {
          ok: true,
          session: {
            authenticated: true,
            email: record.email,
            loggedInAt: nowIso(),
          },
        },
        {
          "Set-Cookie": buildAdminSessionCookie(record, sessionSecret, request),
        }
      );
    } catch (error) {
      sendJson(response, error?.status || 500, {
        error: error?.message || "Unable to log in.",
      });
    }
    return true;
  }

  if (requestUrl.pathname === "/api/admin/logout" && request.method === "POST") {
    sendJson(
      response,
      200,
      {
        ok: true,
      },
      {
        "Set-Cookie": clearAdminSessionCookie(request),
      }
    );
    return true;
  }

  if (requestUrl.pathname === "/api/admin/account" && request.method === "GET") {
    try {
      const auth = await requireAuthenticatedAdmin(request, response);
      if (!auth) {
        return true;
      }

      sendJson(response, 200, {
        email: auth.record.email,
        updatedAt: auth.record.updatedAt,
      });
    } catch (error) {
      sendJson(response, error?.status || 500, {
        error: error?.message || "Unable to load admin account.",
      });
    }
    return true;
  }

  if (requestUrl.pathname === "/api/admin/account" && request.method === "PUT") {
    try {
      const auth = await requireAuthenticatedAdmin(request, response);
      if (!auth) {
        return true;
      }

      const body = await readJsonBody(request);
      const nextEmail = String(body.email || "").trim().toLowerCase();
      const nextPassword = String(body.password || "");

      if (!nextEmail) {
        sendJson(response, 400, {
          error: "Admin email is required.",
        });
        return true;
      }

      const credentialsChanged = nextEmail !== auth.record.email || Boolean(nextPassword);
      const passwordRecord = nextPassword ? hashPassword(nextPassword) : {};
      const nextRecord = await updateSupabaseAdminAuthAccount(auth.record.id, {
        ...passwordRecord,
        email: nextEmail,
        updatedAt: nowIso(),
        sessionVersion: credentialsChanged ? auth.record.sessionVersion + 1 : auth.record.sessionVersion,
      });

      sendJson(
        response,
        200,
        {
          ok: true,
          email: nextRecord.email,
          reauthRequired: credentialsChanged,
        },
        credentialsChanged
          ? {
              "Set-Cookie": clearAdminSessionCookie(request),
            }
          : {}
      );
    } catch (error) {
      sendJson(response, error?.status || 500, {
        error: error?.message || "Unable to update admin account.",
      });
    }
    return true;
  }

  if (requestUrl.pathname === "/api/admin/media" && request.method === "GET") {
    return sendAdminMediaList(request, response, requestUrl);
  }

  if (requestUrl.pathname === "/api/admin/media/upload" && request.method === "POST") {
    return handleAdminMediaUpload(request, response);
  }

  if (requestUrl.pathname === "/api/admin/media/upload-multiple" && request.method === "POST") {
    return handleAdminMediaUploadMultiple(request, response);
  }

  if (requestUrl.pathname.startsWith("/api/admin/media/") && request.method === "GET") {
    return sendAdminMediaDetail(request, response, parseMediaAssetTokenFromPath(requestUrl.pathname, "/api/admin/media/"));
  }

  if (requestUrl.pathname.startsWith("/api/admin/media/") && request.method === "DELETE") {
    return handleAdminMediaDelete(
      request,
      response,
      parseMediaAssetTokenFromPath(requestUrl.pathname, "/api/admin/media/"),
      requestUrl
    );
  }

  if (requestUrl.pathname === "/api/admin/product-images" && request.method === "POST") {
    const auth = await requireAuthenticatedAdmin(request, response);
    if (!auth) {
      return true;
    }

    try {
      const formData = await readMultipartFormData(request);
      const file = formData.get("file");

      if (!(file instanceof File)) {
        sendJson(response, 400, {
          error: "No image file was selected.",
        });
        return true;
      }

      const uploaded = await storeUploadedAsset(file, {
        usageType: "product_main",
      });
      sendJson(response, 200, {
        ok: true,
        service: "Cloudinary",
        url: uploaded.secureUrl || uploaded.url,
        fileName: uploaded.originalFilename || file.name,
        contentType: String(file.type || "").trim(),
        size: Number(file.size || 0),
        asset: uploaded,
      });
    } catch (error) {
      logProductUploadError("Product image upload failed", error?.stack || error?.message || String(error));
      sendJson(response, error?.status || 400, {
        error: error?.message || "Image upload failed.",
      });
    }

    return true;
  }

  if (requestUrl.pathname === "/api/admin/products" && request.method === "POST") {
    return handleProductWrite(request, response, "upsert");
  }

  if (requestUrl.pathname.startsWith("/api/admin/products/") && request.method === "DELETE") {
    return handleProductDelete(request, response, parseProductIdFromPath(requestUrl.pathname, "/api/admin/products/"));
  }

  return false;
};

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

    if ((requestUrl.pathname === "/health" || requestUrl.pathname === "/api/health") && request.method === "GET") {
      sendJson(response, 200, {
        status: "ok",
        service: "avelixlink",
        timestamp: nowIso(),
      });
      return;
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      const handled = await handleAdminApi(request, response, requestUrl);
      if (handled) {
        return;
      }

      sendJson(response, 404, {
        error: "Not found",
      });
      return;
    }

    const redirectTarget = redirectMap[requestUrl.pathname];

    if (redirectTarget) {
      response.writeHead(302, getSecurityHeaders({ Location: redirectTarget }));
      response.end();
      return;
    }

    const filePath = resolvePublicFile(requestUrl.pathname);

    if (!filePath) {
      send(response, 404, "404 Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = contentTypes[ext] || "application/octet-stream";

    response.writeHead(200, getSecurityHeaders({ "Content-Type": contentType }));
    fs.createReadStream(filePath).pipe(response);
  } catch (error) {
    send(response, 500, "500 Server Error");
  }
});

server.on("listening", () => {
  reportStartupEnvWarnings();
  logEmailConfigurationWarning();
  fs.writeFileSync(pidFile, String(process.pid), "utf8");
  console.log(`Serving ${publicRoot}`);
  console.log(`Local:   http://127.0.0.1:${port}/`);
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
  addresses.forEach((address) => {
    console.log(`Network: http://${address}:${port}/`);
  });
});

server.on("error", (error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

let shuttingDown = false;
let shutdownTimer = null;

const cleanupPidFile = () => {
  try {
    if (fs.existsSync(pidFile) && fs.readFileSync(pidFile, "utf8").trim() === String(process.pid)) {
      fs.unlinkSync(pidFile);
    }
  } catch (error) {
    // Ignore pid file cleanup failures during shutdown.
  }
};

const shutdown = (signal) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[shutdown] Received ${signal}. Closing server gracefully...`);

  shutdownTimer = setTimeout(() => {
    console.error("[shutdown] Graceful shutdown timed out after 10 seconds. Forcing exit.");
    cleanupPidFile();
    process.exit(1);
  }, 10000);

  server.close(() => {
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
    cleanupPidFile();
    process.exit(0);
  });

  cleanupPidFile();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", cleanupPidFile);
process.on("unhandledRejection", (error) => {
  console.error("[unhandledRejection]", error);
});

server.listen(port, "0.0.0.0");
