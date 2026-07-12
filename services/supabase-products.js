const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ADMIN_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

const PRODUCT_SELECT = [
  "id",
  "slug",
  "name",
  "category",
  "image_url",
  "main_image_public_id",
  "price_value",
  "price_label",
  "moq_value",
  "moq_label",
  "shipping_days",
  "shipping_time",
  "stock",
  "status",
  "description",
  "detail_description",
  "seo_title",
  "meta_description",
  "keywords",
  "functions",
  "scenarios",
  "markets",
  "tags",
  "specs",
  "b2c_enabled",
  "b2c_retail_price",
  "b2c_compare_at_price",
  "b2c_retail_stock",
  "b2c_minimum_quantity",
  "b2b_enabled",
  "b2b_wholesale_moq",
  "b2b_wholesale_lead_time",
  "b2b_deposit_terms",
  "b2b_deposit_required",
  "b2b_deposit_type",
  "b2b_deposit_value",
  "b2b_balance_due_stage",
  "b2b_custom_payment_terms",
  "b2b_deposit_refundable",
  "b2b_deposit_notes",
  "created_at",
  "updated_at",
].join(",");
const PRODUCT_SELECT_LEGACY = PRODUCT_SELECT.replace(",main_image_public_id", "");

const PRODUCT_IMAGE_SELECT = [
  "id",
  "product_id",
  "image_type",
  "url",
  "public_id",
  "title",
  "detail_text",
  "sort_order",
].join(",");
const PRODUCT_IMAGE_SELECT_LEGACY = PRODUCT_IMAGE_SELECT.replace(",public_id", "");
const PRODUCT_TIER_SELECT = ["id", "product_id", "min_quantity", "max_quantity", "unit_price", "sort_order"].join(",");

const requireConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
    throw new Error(
      "Supabase products service is not configured. Set SUPABASE_URL and either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
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
    throw new Error(detail || `Supabase request failed with status ${response.status}.`);
  }

  return payload;
};

const escapeFilterValue = (value) => encodeURIComponent(String(value || "").trim());
const asStringArray = (value) => (Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : []);
const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const isMissingColumnError = (error, columnName) =>
  String(error?.message || error || "").includes(`column ${columnName} does not exist`);
const omitKey = (value, key) => {
  const nextValue = { ...(value || {}) };
  delete nextValue[key];
  return nextValue;
};

const mapProductRow = (row, imageRows, tierRows) => ({
  id: String(row.id || ""),
  slug: String(row.slug || row.id || ""),
  name: String(row.name || ""),
  category: String(row.category || ""),
  image: String(row.image_url || ""),
  mainImagePublicId: String(row.main_image_public_id || ""),
  priceValue: Number(row.price_value || 0),
  price: String(row.price_label || "$0.00"),
  moqValue: Number(row.moq_value || 1),
  moq: String(row.moq_label || "1 units"),
  shippingDays: Number(row.shipping_days || 1),
  shippingTime: String(row.shipping_time || "1 days"),
  stock: Number(row.stock || 0),
  status: String(row.status || "active"),
  b2c: {
    enabled: Boolean(row.b2c_enabled),
    retailPrice: Number(row.b2c_retail_price || 0),
    compareAtPrice: Number(row.b2c_compare_at_price || 0),
    retailStock: Number(row.b2c_retail_stock || 0),
    minimumQuantity: Number(row.b2c_minimum_quantity || 1),
  },
  b2b: {
    enabled: Boolean(row.b2b_enabled),
    wholesaleMoq: Number(row.b2b_wholesale_moq || 1),
    wholesaleLeadTime: Number(row.b2b_wholesale_lead_time || 1),
    priceTiers: tierRows
      .filter((tier) => String(tier.product_id || "") === String(row.id))
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
      .map((tier) => ({
        id: String(tier.id || ""),
        minQuantity: Number(tier.min_quantity || 1),
        maxQuantity: tier.max_quantity === null || tier.max_quantity === undefined ? 0 : Number(tier.max_quantity || 0),
        unitPrice: Number(tier.unit_price || 0),
      })),
    depositTerms: String(row.b2b_deposit_terms || ""),
    deposit: {
      required: Boolean(row.b2b_deposit_required),
      type: String(row.b2b_deposit_type || "percentage"),
      value: Number(row.b2b_deposit_value || 0),
      balanceDueStage: String(row.b2b_balance_due_stage || "before-shipment"),
      customPaymentTerms: String(row.b2b_custom_payment_terms || row.b2b_deposit_terms || ""),
      refundable: Boolean(row.b2b_deposit_refundable),
      notes: String(row.b2b_deposit_notes || ""),
    },
  },
  description: String(row.description || ""),
  detailDescription: String(row.detail_description || ""),
  seoTitle: String(row.seo_title || ""),
  metaDescription: String(row.meta_description || ""),
  keywords: asStringArray(row.keywords),
  functions: asStringArray(row.functions),
  scenarios: asStringArray(row.scenarios),
  markets: asStringArray(row.markets),
  tags: asStringArray(row.tags),
  specs: asObject(row.specs),
  detailImages: imageRows
    .filter((image) => String(image.product_id || "") === String(row.id) && image.image_type !== "main")
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
      .map((image) => ({
        id: String(image.id || ""),
        publicId: String(image.public_id || ""),
        title: String(image.title || ""),
        text: String(image.detail_text || ""),
        url: String(image.url || ""),
    })),
  createdAt: String(row.created_at || ""),
  updatedAt: String(row.updated_at || ""),
});

const mapProductInputToRow = (product) => ({
  id: String(product.id || "").trim(),
  slug: String(product.slug || product.id || "").trim() || null,
  name: String(product.name || "").trim(),
  category: String(product.category || "").trim() || null,
  image_url: String(product.image || "").trim() || null,
  main_image_public_id: String(product.mainImagePublicId || "").trim() || null,
  price_value: Number(product.priceValue || 0),
  price_label: String(product.price || "$0.00").trim(),
  moq_value: Number(product.moqValue || 1),
  moq_label: String(product.moq || "1 units").trim(),
  shipping_days: Number(product.shippingDays || 1),
  shipping_time: String(product.shippingTime || "1 days").trim(),
  stock: Number(product.stock || 0),
  status: String(product.status || "active").trim() || "active",
  description: String(product.description || "").trim(),
  detail_description: String(product.detailDescription || "").trim(),
  seo_title: String(product.seoTitle || "").trim(),
  meta_description: String(product.metaDescription || "").trim(),
  keywords: asStringArray(product.keywords),
  functions: asStringArray(product.functions),
  scenarios: asStringArray(product.scenarios),
  markets: asStringArray(product.markets),
  tags: asStringArray(product.tags),
  specs: asObject(product.specs),
  b2c_enabled: product?.b2c?.enabled !== false,
  b2c_retail_price: Number(product?.b2c?.retailPrice || 0),
  b2c_compare_at_price: Number(product?.b2c?.compareAtPrice || 0),
  b2c_retail_stock: Number(product?.b2c?.retailStock || 0),
  b2c_minimum_quantity: Number(product?.b2c?.minimumQuantity || 1),
  b2b_enabled: product?.b2b?.enabled !== false,
  b2b_wholesale_moq: Number(product?.b2b?.wholesaleMoq || product.moqValue || 1),
  b2b_wholesale_lead_time: Number(product?.b2b?.wholesaleLeadTime || product.shippingDays || 1),
  b2b_deposit_terms: String(product?.b2b?.depositTerms || "").trim(),
  b2b_deposit_required: Boolean(product?.b2b?.deposit?.required),
  b2b_deposit_type: String(product?.b2b?.deposit?.type || "percentage").trim() || "percentage",
  b2b_deposit_value: Number(product?.b2b?.deposit?.value || 0),
  b2b_balance_due_stage: String(product?.b2b?.deposit?.balanceDueStage || "before-shipment").trim() || "before-shipment",
  b2b_custom_payment_terms: String(product?.b2b?.deposit?.customPaymentTerms || "").trim(),
  b2b_deposit_refundable: Boolean(product?.b2b?.deposit?.refundable),
  b2b_deposit_notes: String(product?.b2b?.deposit?.notes || "").trim(),
  created_at: product.createdAt || new Date().toISOString(),
  updated_at: product.updatedAt || new Date().toISOString(),
});

const toMutableProductRow = (row) => {
  const { id, created_at, ...mutableRow } = row;
  return mutableRow;
};

const mapDetailImagesToRows = (productId, detailImages) =>
  (Array.isArray(detailImages) ? detailImages : []).map((image, index) => ({
    id: String(image?.id || `${productId}-detail-${index + 1}`),
    product_id: productId,
    image_type: "detail",
    url: String(image?.url || "").trim(),
    public_id: String(image?.publicId || "").trim() || null,
    title: String(image?.title || "").trim(),
    detail_text: String(image?.text || "").trim(),
    sort_order: index,
  }));

const mapPriceTiersToRows = (productId, priceTiers) =>
  (Array.isArray(priceTiers) ? priceTiers : []).map((tier, index) => ({
    id: String(tier?.id || `${productId}-tier-${index + 1}`),
    product_id: productId,
    min_quantity: Number(tier?.minQuantity || 1),
    max_quantity: Number(tier?.maxQuantity || 0) > 0 ? Number(tier.maxQuantity) : null,
    unit_price: Number(tier?.unitPrice || 0),
    sort_order: index,
  }));

const fetchRelatedRows = async (productIds) => {
  if (!productIds.length) {
    return {
      imageRows: [],
      tierRows: [],
    };
  }

  const filter = `product_id=in.(${productIds.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(",")})`;
  const tierRowsPromise = requestSupabase(`product_price_tiers?select=${PRODUCT_TIER_SELECT}&${filter}&order=sort_order.asc`);
  let imageRows;

  try {
    [imageRows] = await Promise.all([
      requestSupabase(`product_images?select=${PRODUCT_IMAGE_SELECT}&${filter}&order=sort_order.asc`),
      tierRowsPromise,
    ]);
  } catch (error) {
    if (!isMissingColumnError(error, "product_images.public_id")) {
      throw error;
    }
    imageRows = await requestSupabase(`product_images?select=${PRODUCT_IMAGE_SELECT_LEGACY}&${filter}&order=sort_order.asc`);
  }
  const tierRows = await tierRowsPromise;

  return {
    imageRows: Array.isArray(imageRows) ? imageRows : [],
    tierRows: Array.isArray(tierRows) ? tierRows : [],
  };
};

const listProducts = async () => {
  let productRows;
  try {
    productRows = await requestSupabase(`products?select=${PRODUCT_SELECT}&order=created_at.desc`);
  } catch (error) {
    if (!isMissingColumnError(error, "products.main_image_public_id")) {
      throw error;
    }
    productRows = await requestSupabase(`products?select=${PRODUCT_SELECT_LEGACY}&order=created_at.desc`);
  }
  const rows = Array.isArray(productRows) ? productRows : [];
  const { imageRows, tierRows } = await fetchRelatedRows(rows.map((row) => row.id));
  return rows.map((row) => mapProductRow(row, imageRows, tierRows));
};

const getProductById = async (id) => {
  const productId = String(id || "").trim();
  if (!productId) {
    return null;
  }

  let rows;
  try {
    rows = await requestSupabase(`products?select=${PRODUCT_SELECT}&id=eq.${escapeFilterValue(productId)}&limit=1`);
  } catch (error) {
    if (!isMissingColumnError(error, "products.main_image_public_id")) {
      throw error;
    }
    rows = await requestSupabase(`products?select=${PRODUCT_SELECT_LEGACY}&id=eq.${escapeFilterValue(productId)}&limit=1`);
  }
  const row = Array.isArray(rows) ? rows[0] : null;

  if (!row) {
    return null;
  }

  const { imageRows, tierRows } = await fetchRelatedRows([productId]);
  return mapProductRow(row, imageRows, tierRows);
};

const replaceProductChildren = async (product) => {
  const productId = String(product.id || "").trim();
  await Promise.all([
    requestSupabase(`product_images?product_id=eq.${escapeFilterValue(productId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }),
    requestSupabase(`product_price_tiers?product_id=eq.${escapeFilterValue(productId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }),
  ]);

  const detailRows = mapDetailImagesToRows(productId, product.detailImages).filter((row) => row.url);
  const tierRows = mapPriceTiersToRows(productId, product?.b2b?.priceTiers).filter((row) => row.unit_price > 0);

  if (detailRows.length) {
    try {
      await requestSupabase("product_images", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: detailRows,
      });
    } catch (error) {
      if (!isMissingColumnError(error, "product_images.public_id")) {
        throw error;
      }
      await requestSupabase("product_images", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: detailRows.map((row) => omitKey(row, "public_id")),
      });
    }
  }

  if (tierRows.length) {
    await requestSupabase("product_price_tiers", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: tierRows,
    });
  }
};

const createProduct = async (product) => {
  const row = mapProductInputToRow(product);
  try {
    await requestSupabase("products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: row,
    });
  } catch (error) {
    if (!isMissingColumnError(error, "products.main_image_public_id")) {
      throw error;
    }
    await requestSupabase("products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: omitKey(row, "main_image_public_id"),
    });
  }
  await replaceProductChildren(product);
  return getProductById(row.id);
};

const updateProduct = async (id, product) => {
  const productId = String(id || product?.id || "").trim();
  const existing = await getProductById(productId);

  if (!existing) {
    throw new Error(`Product "${productId}" was not found.`);
  }

  const row = mapProductInputToRow({
    ...product,
    id: productId,
    createdAt: existing.createdAt,
  });

  let updatedRows;
  try {
    updatedRows = await requestSupabase(`products?id=eq.${escapeFilterValue(productId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: toMutableProductRow(row),
    });
  } catch (error) {
    if (!isMissingColumnError(error, "products.main_image_public_id")) {
      throw error;
    }
    updatedRows = await requestSupabase(`products?id=eq.${escapeFilterValue(productId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: omitKey(toMutableProductRow(row), "main_image_public_id"),
    });
  }

  if (!Array.isArray(updatedRows) || !updatedRows.length) {
    throw new Error(`Supabase did not update product "${productId}".`);
  }

  await replaceProductChildren({
    ...product,
    id: productId,
  });
  return getProductById(productId);
};

const upsertProduct = async (product) => {
  const existing = await getProductById(product?.id);
  return existing ? updateProduct(product.id, product) : createProduct(product);
};

const deleteProduct = async (id) => {
  const productId = String(id || "").trim();
  if (!productId) {
    throw new Error("Product id is required.");
  }

  const existing = await getProductById(productId);

  if (!existing) {
    throw new Error(`Product "${productId}" was not found.`);
  }

  await Promise.all([
    requestSupabase(`product_images?product_id=eq.${escapeFilterValue(productId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }),
    requestSupabase(`product_price_tiers?product_id=eq.${escapeFilterValue(productId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    }),
  ]);

  const deletedRows = await requestSupabase(`products?id=eq.${escapeFilterValue(productId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });

  if (!Array.isArray(deletedRows) || !deletedRows.length) {
    throw new Error(`Supabase did not delete product "${productId}".`);
  }

  return {
    deletedId: productId,
  };
};

module.exports = {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  upsertProduct,
  deleteProduct,
};
