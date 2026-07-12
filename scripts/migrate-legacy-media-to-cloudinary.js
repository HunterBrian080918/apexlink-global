require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { uploadBuffer } = require("../services/cloudinary-media");
const { upsertMediaAsset } = require("../services/supabase-media");
const { listProducts, upsertProduct } = require("../services/supabase-products");
const { getSiteConfig, updateSiteConfig } = require("../services/supabase-cms");

const projectRoot = path.resolve(__dirname, "..");
const CLOUDINARY_PREFIX = "https://res.cloudinary.com/";
const UGUU_PREFIX = "https://uguu.se/";

const mimeByExtension = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/png",
};

const toPosixName = (value) =>
  String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop() || "asset";

const isCloudinaryUrl = (value) => String(value || "").trim().startsWith(CLOUDINARY_PREFIX);
const isDataUrl = (value) => String(value || "").trim().startsWith("data:image/");
const isStaticAssetPath = (value) => {
  const normalized = String(value || "").trim();
  return normalized.startsWith("assets/") || normalized.startsWith("/assets/");
};
const isRemoteUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());

const decodeDataUrl = (value) => {
  const match = String(value || "").match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    throw new Error("Unsupported data URL format.");
  }
  const mimeType = match[1].toLowerCase();
  return {
    mimeType,
    buffer: Buffer.from(match[2], "base64"),
    fileName: `inline-image${mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg"}`,
  };
};

const readStaticAsset = (value) => {
  const normalized = String(value || "").trim().replace(/^\//, "");
  const absolutePath = path.join(projectRoot, normalized);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Static file not found: ${absolutePath}`);
  }
  const extension = path.extname(absolutePath).toLowerCase();
  const mimeType = mimeByExtension[extension];
  if (!mimeType) {
    throw new Error(`Unsupported static asset extension: ${extension}`);
  }
  return {
    mimeType,
    buffer: fs.readFileSync(absolutePath),
    fileName: path.basename(absolutePath),
  };
};

const readRemoteAsset = async (value) => {
  const response = await fetch(String(value || "").trim());
  if (!response.ok) {
    throw new Error(`Unable to download remote asset: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const url = new URL(String(value));
  const extension = path.extname(url.pathname).toLowerCase();
  const mimeType = String(response.headers.get("content-type") || mimeByExtension[extension] || "image/jpeg")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return {
    mimeType,
    buffer: Buffer.from(arrayBuffer),
    fileName: path.basename(url.pathname) || "remote-image.jpg",
  };
};

const resolveSource = async (value) => {
  if (isDataUrl(value)) {
    return decodeDataUrl(value);
  }
  if (isStaticAssetPath(value)) {
    return readStaticAsset(value);
  }
  if (isRemoteUrl(value)) {
    return readRemoteAsset(value);
  }
  throw new Error(`Unsupported media source: ${value}`);
};

const migrateAssetValue = async ({ value, usageType, displayName, preferredFileName }) => {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue || isCloudinaryUrl(normalizedValue)) {
    return null;
  }

  const source = await resolveSource(normalizedValue);
  const uploaded = await uploadBuffer({
    buffer: source.buffer,
    fileName: preferredFileName || source.fileName,
    mimeType: source.mimeType,
    usageType,
  });
  const asset = await upsertMediaAsset({
    ...uploaded,
    usageType,
    displayName: displayName || preferredFileName || source.fileName,
  });
  return asset || uploaded;
};

const migrateWebsiteConfig = async () => {
  const siteConfig = await getSiteConfig();
  const nextConfig = JSON.parse(JSON.stringify(siteConfig));
  let changed = false;

  const brandLogo = await migrateAssetValue({
    value: siteConfig?.website?.brand?.logoImage,
    usageType: "brand_logo",
    displayName: "Website Logo",
    preferredFileName: "brand-logo.png",
  });
  if (brandLogo) {
    nextConfig.website.brand.logoImage = brandLogo.secureUrl || brandLogo.url;
    nextConfig.website.brand.logoPublicId = brandLogo.publicId || "";
    changed = true;
  }

  const favicon = await migrateAssetValue({
    value: siteConfig?.website?.brand?.favicon,
    usageType: "favicon",
    displayName: "Website Favicon",
    preferredFileName: "favicon.png",
  });
  if (favicon) {
    nextConfig.website.brand.favicon = favicon.secureUrl || favicon.url;
    nextConfig.website.brand.faviconPublicId = favicon.publicId || "";
    changed = true;
  }

  const hero = await migrateAssetValue({
    value: siteConfig?.website?.hero?.backgroundImage || siteConfig?.homepage?.heroBackgroundImage,
    usageType: "homepage_hero",
    displayName: "Homepage Hero",
    preferredFileName: "homepage-hero.jpg",
  });
  if (hero) {
    nextConfig.website.hero.backgroundImage = hero.secureUrl || hero.url;
    nextConfig.website.hero.backgroundImagePublicId = hero.publicId || "";
    nextConfig.homepage.heroBackgroundImage = hero.secureUrl || hero.url;
    changed = true;
  }

  if (changed) {
    await updateSiteConfig(nextConfig);
  }

  return changed;
};

const migrateProducts = async () => {
  const products = await listProducts();
  let changedCount = 0;

  for (const product of products) {
    let changed = false;
    const nextProduct = JSON.parse(JSON.stringify(product));

    const mainImageAsset = await migrateAssetValue({
      value: product.image,
      usageType: "product_main",
      displayName: `${product.name || product.id} Main Image`,
      preferredFileName: `${toPosixName(product.slug || product.id || product.name)}-main.jpg`,
    });

    if (mainImageAsset) {
      nextProduct.image = mainImageAsset.secureUrl || mainImageAsset.url;
      nextProduct.mainImagePublicId = mainImageAsset.publicId || "";
      changed = true;
    }

    const nextDetailImages = [];
    for (let index = 0; index < (product.detailImages || []).length; index += 1) {
      const image = product.detailImages[index];
      const migrated = await migrateAssetValue({
        value: image?.url,
        usageType: "product_gallery",
        displayName: `${product.name || product.id} Gallery ${index + 1}`,
        preferredFileName: `${toPosixName(product.slug || product.id || product.name)}-gallery-${index + 1}.jpg`,
      });

      if (migrated) {
        nextDetailImages.push({
          ...image,
          url: migrated.secureUrl || migrated.url,
          publicId: migrated.publicId || "",
        });
        changed = true;
      } else {
        nextDetailImages.push(image);
      }
    }

    if (changed) {
      nextProduct.detailImages = nextDetailImages;
      await upsertProduct(nextProduct);
      changedCount += 1;
    }
  }

  return changedCount;
};

const run = async () => {
  console.info("[media-migration] Starting legacy media migration...");
  const websiteChanged = await migrateWebsiteConfig();
  const productCount = await migrateProducts();
  console.info(
    `[media-migration] Completed. websiteChanged=${websiteChanged ? "yes" : "no"} productUpdates=${productCount}`
  );
};

run().catch((error) => {
  console.error("[media-migration] Failed:", error);
  process.exitCode = 1;
});
