const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ADMIN_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

const MEDIA_SELECT = [
  "id",
  "public_id",
  "secure_url",
  "url",
  "original_filename",
  "display_name",
  "name",
  "folder",
  "resource_type",
  "format",
  "width",
  "height",
  "bytes",
  "usage_type",
  "media_type",
  "usage",
  "alt_text",
  "created_at",
  "updated_at",
].join(",");

const requireConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
    throw new Error(
      "Supabase media service is not configured. Set SUPABASE_URL and either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
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
const normalizeMediaSchemaError = (error) => {
  const message = String(error?.message || error || "");
  if (
    message.includes("column media_assets.public_id does not exist") ||
    message.includes("column media_assets.secure_url does not exist") ||
    message.includes("column website_settings.brand_logo_public_id does not exist") ||
    message.includes("column website_settings.favicon_public_id does not exist") ||
    message.includes("column website_settings.hero_background_public_id does not exist")
  ) {
    throw new Error(
      "Cloudinary media schema is not ready. Run Supabase migration 20260712000400_cloudinary_media_architecture.sql first."
    );
  }
  throw error;
};

const escapeFilterValue = (value) => encodeURIComponent(String(value || "").trim());
const escapeLikeValue = (value) => encodeURIComponent(`*${String(value || "").trim().replace(/\*/g, "")}*`);
const asStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return [];
};

const mapMediaAsset = (row) => ({
  id: String(row?.id || "").trim(),
  publicId: String(row?.public_id || "").trim(),
  secureUrl: String(row?.secure_url || row?.url || "").trim(),
  url: String(row?.secure_url || row?.url || "").trim(),
  originalFilename: String(row?.original_filename || "").trim(),
  displayName: String(row?.display_name || row?.name || row?.original_filename || "").trim(),
  name: String(row?.display_name || row?.name || row?.original_filename || "").trim(),
  folder: String(row?.folder || "").trim(),
  resourceType: String(row?.resource_type || row?.media_type || "image").trim(),
  format: String(row?.format || "").trim(),
  width: Number(row?.width || 0),
  height: Number(row?.height || 0),
  bytes: Number(row?.bytes || 0),
  usageType: String(row?.usage_type || "").trim(),
  usage: asStringArray(row?.usage).length ? asStringArray(row?.usage) : [String(row?.usage_type || "misc").trim() || "misc"],
  altText: String(row?.alt_text || "").trim(),
  createdAt: String(row?.created_at || "").trim(),
  updatedAt: String(row?.updated_at || "").trim(),
});

const toInsertRow = (asset) => {
  const usageType = String(asset?.usageType || "misc").trim() || "misc";
  const displayName = String(asset?.displayName || asset?.originalFilename || asset?.publicId || "").trim();
  return {
    public_id: String(asset?.publicId || "").trim(),
    secure_url: String(asset?.secureUrl || asset?.url || "").trim(),
    url: String(asset?.secureUrl || asset?.url || "").trim(),
    original_filename: String(asset?.originalFilename || "").trim() || null,
    display_name: displayName || null,
    name: displayName || null,
    folder: String(asset?.folder || "").trim() || null,
    resource_type: String(asset?.resourceType || "image").trim() || "image",
    format: String(asset?.format || "").trim() || null,
    width: Number(asset?.width || 0) || null,
    height: Number(asset?.height || 0) || null,
    bytes: Number(asset?.bytes || 0) || null,
    usage_type: usageType,
    media_type: "image",
    usage: [usageType],
    alt_text: String(asset?.altText || "").trim() || null,
  };
};

const listMediaAssets = async (filters = {}) => {
  const searchParams = new URLSearchParams();
  searchParams.set("select", MEDIA_SELECT);
  searchParams.set("order", "created_at.desc");

  if (filters.query) {
    searchParams.set(
      "or",
      `display_name.ilike.${escapeLikeValue(filters.query)},original_filename.ilike.${escapeLikeValue(
        filters.query
      )},public_id.ilike.${escapeLikeValue(filters.query)}`
    );
  }

  if (filters.usageType && filters.usageType !== "all") {
    searchParams.set("usage_type", `eq.${escapeFilterValue(filters.usageType)}`);
  }

  if (filters.folder && filters.folder !== "all") {
    searchParams.set("folder", `eq.${escapeFilterValue(filters.folder)}`);
  }

  let rows;
  try {
    rows = await requestSupabase(`media_assets?${searchParams.toString()}`);
  } catch (error) {
    normalizeMediaSchemaError(error);
  }
  return Array.isArray(rows) ? rows.map(mapMediaAsset) : [];
};

const getMediaAssetById = async (id) => {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    return null;
  }

  let rows;
  try {
    rows = await requestSupabase(`media_assets?select=${MEDIA_SELECT}&id=eq.${escapeFilterValue(normalizedId)}&limit=1`);
  } catch (error) {
    normalizeMediaSchemaError(error);
  }
  return Array.isArray(rows) && rows[0] ? mapMediaAsset(rows[0]) : null;
};

const getMediaAssetByPublicId = async (publicId) => {
  const normalizedPublicId = String(publicId || "").trim();
  if (!normalizedPublicId) {
    return null;
  }

  let rows;
  try {
    rows = await requestSupabase(
      `media_assets?select=${MEDIA_SELECT}&public_id=eq.${escapeFilterValue(normalizedPublicId)}&limit=1`
    );
  } catch (error) {
    normalizeMediaSchemaError(error);
  }
  return Array.isArray(rows) && rows[0] ? mapMediaAsset(rows[0]) : null;
};

const upsertMediaAsset = async (asset) => {
  const row = toInsertRow(asset);
  if (!row.public_id || !row.secure_url) {
    throw new Error("Media asset public_id and secure_url are required.");
  }

  const existing = await getMediaAssetByPublicId(row.public_id);
  if (existing?.id) {
    let updatedRows;
    try {
      updatedRows = await requestSupabase(`media_assets?id=eq.${escapeFilterValue(existing.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: row,
      });
    } catch (error) {
      normalizeMediaSchemaError(error);
    }
    return Array.isArray(updatedRows) && updatedRows[0] ? mapMediaAsset(updatedRows[0]) : getMediaAssetById(existing.id);
  }

  let createdRows;
  try {
    createdRows = await requestSupabase("media_assets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: row,
    });
  } catch (error) {
    normalizeMediaSchemaError(error);
  }
  return Array.isArray(createdRows) && createdRows[0] ? mapMediaAsset(createdRows[0]) : null;
};

const deleteMediaAssetById = async (id) => {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    throw new Error("Media asset id is required.");
  }

  let deletedRows;
  try {
    deletedRows = await requestSupabase(`media_assets?id=eq.${escapeFilterValue(normalizedId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
  } catch (error) {
    normalizeMediaSchemaError(error);
  }
  return Array.isArray(deletedRows) && deletedRows[0] ? mapMediaAsset(deletedRows[0]) : null;
};

const findMediaReferences = async (asset) => {
  const normalizedUrl = String(asset?.secureUrl || asset?.url || "").trim();
  const normalizedPublicId = String(asset?.publicId || "").trim();
  const references = [];

  if (!normalizedUrl && !normalizedPublicId) {
    return references;
  }

  const escapedUrl = escapeFilterValue(normalizedUrl);
  const escapedPublicId = escapeFilterValue(normalizedPublicId);
  let products;
  let productImages;
  let websiteSettingsRows;
  try {
    [products, productImages, websiteSettingsRows] = await Promise.all([
      normalizedUrl
        ? requestSupabase(
            `products?select=id,name,image_url,main_image_public_id&or=(image_url.eq.${escapedUrl},main_image_public_id.eq.${escapedPublicId})`
          )
        : Promise.resolve([]),
      normalizedUrl
        ? requestSupabase(`product_images?select=id,product_id,url,public_id&or=(url.eq.${escapedUrl},public_id.eq.${escapedPublicId})`)
        : Promise.resolve([]),
      requestSupabase(
        `website_settings?select=id,brand_logo_image,brand_logo_public_id,favicon,favicon_public_id,hero_background_image,hero_background_public_id&id=eq.1&limit=1`
      ),
    ]);
  } catch (error) {
    normalizeMediaSchemaError(error);
  }

  (Array.isArray(products) ? products : []).forEach((product) => {
    references.push({
      type: "product_main",
      id: String(product.id || ""),
      label: String(product.name || product.id || "Product"),
    });
  });

  (Array.isArray(productImages) ? productImages : []).forEach((image) => {
    references.push({
      type: "product_gallery",
      id: String(image.id || ""),
      label: String(image.product_id || "Product gallery image"),
    });
  });

  const websiteSettings = Array.isArray(websiteSettingsRows) ? websiteSettingsRows[0] : null;
  if (websiteSettings) {
    if (
      (normalizedUrl && String(websiteSettings.brand_logo_image || "").trim() === normalizedUrl) ||
      (normalizedPublicId && String(websiteSettings.brand_logo_public_id || "").trim() === normalizedPublicId)
    ) {
      references.push({ type: "brand_logo", id: "website_settings.brand_logo_image", label: "Website Logo" });
    }
    if (
      (normalizedUrl && String(websiteSettings.favicon || "").trim() === normalizedUrl) ||
      (normalizedPublicId && String(websiteSettings.favicon_public_id || "").trim() === normalizedPublicId)
    ) {
      references.push({ type: "favicon", id: "website_settings.favicon", label: "Website Favicon" });
    }
    if (
      (normalizedUrl && String(websiteSettings.hero_background_image || "").trim() === normalizedUrl) ||
      (normalizedPublicId && String(websiteSettings.hero_background_public_id || "").trim() === normalizedPublicId)
    ) {
      references.push({
        type: "homepage_hero",
        id: "website_settings.hero_background_image",
        label: "Homepage Hero Image",
      });
    }
  }

  return references;
};

module.exports = {
  listMediaAssets,
  getMediaAssetById,
  getMediaAssetByPublicId,
  upsertMediaAsset,
  deleteMediaAssetById,
  findMediaReferences,
  mapMediaAsset,
};
