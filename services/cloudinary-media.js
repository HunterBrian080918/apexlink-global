const crypto = require("crypto");

const CLOUDINARY_CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
const CLOUDINARY_API_KEY = String(process.env.CLOUDINARY_API_KEY || "").trim();
const CLOUDINARY_API_SECRET = String(process.env.CLOUDINARY_API_SECRET || "").trim();
const CLOUDINARY_UPLOAD_PRESET = String(process.env.CLOUDINARY_UPLOAD_PRESET || "apexlink-products").trim();

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const FOLDER_MAP = {
  product_main: "apexlink/products",
  product_gallery: "apexlink/products/gallery",
  brand_logo: "apexlink/brand",
  favicon: "apexlink/brand",
  homepage_hero: "apexlink/homepage",
  about: "apexlink/about",
  support: "apexlink/support",
  misc: "apexlink/misc",
};

const nowUnix = () => Math.floor(Date.now() / 1000);
const ensureConfig = () => {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error(
      "Cloudinary media service is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
    );
  }
};

const sanitizeFileNamePart = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "image";

const getExtension = (fileName, mimeType = "") => {
  const rawExtension = String(fileName || "")
    .split(".")
    .pop()
    .trim()
    .toLowerCase();

  if (ALLOWED_EXTENSIONS.has(rawExtension)) {
    return rawExtension;
  }

  const mimeMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  };

  return mimeMap[String(mimeType || "").toLowerCase()] || "";
};

const getFolderForUsageType = (usageType) => {
  const normalizedUsageType = String(usageType || "misc").trim();
  return FOLDER_MAP[normalizedUsageType] || FOLDER_MAP.misc;
};

const createPublicId = (fileName, usageType) => {
  const extension = getExtension(fileName);
  const parsedName = extension && String(fileName || "").toLowerCase().endsWith(`.${extension}`)
    ? String(fileName || "").slice(0, -(extension.length + 1))
    : String(fileName || "");
  const safeBase = sanitizeFileNamePart(parsedName || "image");
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  return `${getFolderForUsageType(usageType)}/${safeBase}-${Date.now()}-${randomSuffix}`;
};

const validateImageFile = (file) => {
  if (!file) {
    throw new Error("No image file was selected.");
  }

  const mimeType = String(file.type || "").toLowerCase();
  const extension = getExtension(file.name, mimeType);

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("Only JPG, JPEG, PNG, WEBP, and AVIF images are allowed.");
  }

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported image file extension.");
  }

  const size = Number(file.size || 0);
  if (size <= 0) {
    throw new Error("The selected image is empty.");
  }

  if (size > MAX_IMAGE_BYTES) {
    throw new Error("Image size must be 10MB or less.");
  }

  return {
    mimeType,
    extension,
    size,
  };
};

const buildSignature = (params) => {
  const serialized = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return crypto.createHash("sha1").update(`${serialized}${CLOUDINARY_API_SECRET}`).digest("hex");
};

const normalizeCloudinaryAsset = (asset, usageType) => ({
  publicId: String(asset.public_id || "").trim(),
  secureUrl: String(asset.secure_url || "").trim(),
  originalFilename: String(asset.original_filename || "").trim(),
  displayName: String(asset.original_filename || asset.public_id || "").trim(),
  folder: String(asset.folder || "").trim(),
  resourceType: String(asset.resource_type || "image").trim(),
  format: String(asset.format || "").trim(),
  width: Number(asset.width || 0),
  height: Number(asset.height || 0),
  bytes: Number(asset.bytes || 0),
  usageType: String(usageType || "misc").trim() || "misc",
  createdAt: String(asset.created_at || "").trim(),
});

const uploadBuffer = async ({
  buffer,
  fileName,
  mimeType,
  usageType = "misc",
  folder,
  publicId,
  overwrite = false,
}) => {
  ensureConfig();

  if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("Upload buffer is empty.");
  }

  const extension = getExtension(fileName, mimeType);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported image file extension.");
  }
  if (!ALLOWED_MIME_TYPES.has(String(mimeType || "").toLowerCase())) {
    throw new Error("Only JPG, JPEG, PNG, WEBP, and AVIF images are allowed.");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image size must be 10MB or less.");
  }

  const timestamp = nowUnix();
  const normalizedUsageType = String(usageType || "misc").trim() || "misc";
  const targetFolder = String(folder || getFolderForUsageType(normalizedUsageType)).trim();
  if (!Object.values(FOLDER_MAP).includes(targetFolder)) {
    throw new Error("Unsupported upload folder.");
  }

  const nextPublicId = String(publicId || "").trim() || createPublicId(fileName, normalizedUsageType);
  const paramsToSign = {
    folder: targetFolder,
    overwrite: overwrite ? "true" : "false",
    public_id: nextPublicId,
    timestamp,
    upload_preset: CLOUDINARY_UPLOAD_PRESET || undefined,
  };
  const signature = buildSignature(paramsToSign);
  const formData = new FormData();

  formData.append(
    "file",
    new Blob([buffer], {
      type: mimeType || "application/octet-stream",
    }),
    `${sanitizeFileNamePart(fileName)}.${extension}`
  );
  formData.append("api_key", CLOUDINARY_API_KEY);
  formData.append("timestamp", String(timestamp));
  formData.append("folder", targetFolder);
  formData.append("public_id", nextPublicId);
  formData.append("overwrite", overwrite ? "true" : "false");
  if (CLOUDINARY_UPLOAD_PRESET) {
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  }
  formData.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || `Cloudinary upload failed with status ${response.status}.`;
    throw new Error(detail);
  }

  if (!payload?.secure_url || !payload?.public_id) {
    throw new Error("Cloudinary upload did not return a valid secure URL.");
  }

  return normalizeCloudinaryAsset(payload, normalizedUsageType);
};

const uploadFile = async (file, options = {}) => {
  const { mimeType } = validateImageFile(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  return uploadBuffer({
    buffer,
    fileName: file.name || "image",
    mimeType,
    usageType: options.usageType,
    folder: options.folder,
    publicId: options.publicId,
    overwrite: options.overwrite,
  });
};

const uploadFiles = async (files, options = {}) => {
  const fileList = Array.isArray(files) ? files : [];
  if (!fileList.length) {
    throw new Error("No image files were selected.");
  }

  const assets = [];
  for (const file of fileList) {
    assets.push(
      await uploadFile(file, {
        usageType: options.usageType,
        folder: options.folder,
      })
    );
  }
  return assets;
};

const destroyAsset = async (publicId, options = {}) => {
  ensureConfig();
  const normalizedPublicId = String(publicId || "").trim();
  if (!normalizedPublicId) {
    throw new Error("Cloudinary public_id is required.");
  }

  const timestamp = nowUnix();
  const paramsToSign = {
    invalidate: options.invalidate === false ? "false" : "true",
    public_id: normalizedPublicId,
    timestamp,
  };
  const signature = buildSignature(paramsToSign);
  const formData = new FormData();
  formData.append("public_id", normalizedPublicId);
  formData.append("api_key", CLOUDINARY_API_KEY);
  formData.append("timestamp", String(timestamp));
  formData.append("invalidate", options.invalidate === false ? "false" : "true");
  formData.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || `Cloudinary delete failed with status ${response.status}.`;
    throw new Error(detail);
  }

  if (!payload || (payload.result !== "ok" && payload.result !== "not found")) {
    throw new Error("Cloudinary did not confirm asset deletion.");
  }

  return {
    publicId: normalizedPublicId,
    result: payload.result,
  };
};

module.exports = {
  CLOUDINARY_UPLOAD_PRESET,
  MAX_IMAGE_BYTES,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  FOLDER_MAP,
  getFolderForUsageType,
  validateImageFile,
  normalizeCloudinaryAsset,
  uploadFile,
  uploadFiles,
  uploadBuffer,
  destroyAsset,
};
