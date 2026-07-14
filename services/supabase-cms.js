const fs = require("fs");
const path = require("path");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ADMIN_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

const defaultDataFile = path.join(__dirname, "..", "data", "default-data.json");
const WEBSITE_SECTIONS = new Set(["brand", "hero", "footer", "contact", "social", "seo", "homepage"]);
const APP_SETTING_SECTIONS = new Set(["paymentMethods", "language", "themeColor", "systemConfig"]);
const ALLOWED_SECTIONS = new Set([...WEBSITE_SECTIONS, ...APP_SETTING_SECTIONS]);
const LOGO_FALLBACK_PATH = "/assets/brand/apexlink-mark.png";
const LEGACY_WORDMARK_PATHS = new Set([
  "assets/brand/apexlink-wordmark.png",
  "/assets/brand/apexlink-wordmark.png",
]);

const requireConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
    throw new Error(
      "Supabase CMS service is not configured. Set SUPABASE_URL and either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
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

const nowIso = () => new Date().toISOString();
const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
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
const withFallbackArray = (value, fallback) => {
  const normalized = asStringArray(value);
  return normalized.length ? normalized : asStringArray(fallback);
};
const asText = (value, fallback = "") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};
const normalizeBrandName = (value, fallback = "AvelixLink") => {
  const normalized = String(value ?? "").trim();
  return !normalized || normalized === "ApexLink Global" || normalized === "ApexLink" ? fallback : normalized;
};
const normalizeBrandBottom = (value, fallback = "") => {
  const normalized = String(value ?? "").trim();
  return !normalized || normalized === "Global" ? fallback : normalized;
};
const normalizePublicEmail = (value, fallback = "avelixlink@outlook.com") => {
  const normalized = String(value ?? "").trim();
  return !normalized || normalized === "sales@apexlinkglobal.com" || normalized === "ApexLink080918@outlook.com"
    ? fallback
    : normalized;
};
const normalizePublicWhatsapp = (value, fallback = "+44 7597 653224") => {
  const normalized = String(value ?? "").trim();
  return !normalized || normalized === "+86 138 0000 2211" ? fallback : normalized;
};
const asNullableText = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};
const normalizeLogoImage = (value, fallback = LOGO_FALLBACK_PATH) => {
  const normalized = String(value ?? "").trim();

  if (!normalized || LEGACY_WORDMARK_PATHS.has(normalized)) {
    return fallback;
  }

  if (normalized === "assets/brand/apexlink-mark.png") {
    return LOGO_FALLBACK_PATH;
  }

  if (normalized === "/assets/brand/apexlink-mark.png") {
    return LOGO_FALLBACK_PATH;
  }

  if (/^(https?:)?\/\//i.test(normalized)) {
    return normalized;
  }

  if (normalized.startsWith("/assets/")) {
    return normalized;
  }

  if (normalized.startsWith("assets/")) {
    return `/${normalized}`;
  }

  return fallback;
};

const readDefaultData = () => JSON.parse(fs.readFileSync(defaultDataFile, "utf8"));

const buildDefaultSiteConfig = () => {
  const raw = readDefaultData();
  const website = asObject(raw.website);
  const homepage = asObject(raw.homepage);
  const brand = asObject(website.brand);
  const hero = asObject(website.hero);
  const footer = asObject(website.footer);
  const contact = asObject(website.contact);
  const social = asObject(website.social);
  const seo = asObject(website.seo);
  const settings = asObject(raw.settings);
  const brandName = normalizeBrandName(brand.name, "AvelixLink");

  return {
    website: {
      brand: {
        name: brandName,
        logoTop: normalizeBrandName(brand.logoTop, "AvelixLink"),
        logoBottom: normalizeBrandBottom(brand.logoBottom, ""),
        logoImage: normalizeLogoImage(brand.logoImage, LOGO_FALLBACK_PATH),
        logoPublicId: asText(brand.logoPublicId),
        favicon: asText(brand.favicon, "assets/brand/apexlink-favicon.png"),
        faviconPublicId: asText(brand.faviconPublicId),
        browserTitle: asText(brand.browserTitle, brandName),
        subtitle: asText(brand.subtitle),
      },
      hero: {
        eyebrow: asText(hero.eyebrow, asText(homepage.eyebrow)),
        title: asText(hero.title, asText(homepage.title)),
        subtitle: asText(hero.subtitle, asText(homepage.subtitle)),
        backgroundImage: asText(hero.backgroundImage, asText(homepage.heroBackgroundImage)),
        backgroundImagePublicId: asText(hero.backgroundImagePublicId),
        banner: asText(hero.banner),
      },
      footer: {
        tagline: asText(footer.tagline, "Better Workspace.\nBetter Work."),
        copyright: asText(footer.copyright, "© 2026 AvelixLink. All rights reserved."),
      },
      contact: {
        email: normalizePublicEmail(contact.email, "avelixlink@outlook.com"),
        phone: asText(contact.phone),
        address: asText(contact.address),
      },
      social: {
        linkedin: asText(social.linkedin),
        whatsapp: normalizePublicWhatsapp(social.whatsapp, "+44 7597 653224"),
        instagram: asText(social.instagram),
        x: asText(social.x),
      },
      seo: {
        metaDescription: asText(
          seo.metaDescription,
          "Premium workspace products designed to improve productivity, organization and comfort."
        ),
        metaKeywords: asText(
          seo.metaKeywords,
          "workspace products, desk accessories, productivity, workspace setup, premium office essentials"
        ),
      },
    },
    homepage: {
      eyebrow: asText(homepage.eyebrow, asText(hero.eyebrow)),
      title: asText(homepage.title, asText(hero.title)),
      subtitle: asText(homepage.subtitle, asText(hero.subtitle)),
      heroBackgroundImage: asText(homepage.heroBackgroundImage, asText(hero.backgroundImage)),
      heroCtaPrimaryLabel: asText(homepage.heroCtaPrimaryLabel, "Explore Products"),
      heroCtaPrimaryLink: asText(homepage.heroCtaPrimaryLink, "/products"),
      heroCtaSecondaryLabel: asText(homepage.heroCtaSecondaryLabel, "Learn More"),
      heroCtaSecondaryLink: asText(homepage.heroCtaSecondaryLink, "/about"),
      trustedBadges: asStringArray(homepage.trustedBadges || ["New Arrivals", "Premium Quality", "Worldwide Shipping"]),
      featuredProductId: asText(homepage.featuredProductId),
      spotlightTitle: asText(homepage.spotlightTitle, "Featured Product"),
      spotlightSubtitle: asText(
        homepage.spotlightSubtitle,
        "An all-in-one portable workspace organizer designed for modern professionals."
      ),
      aboutTitle: asText(homepage.aboutTitle, "Why AvelixLink"),
      aboutText: asText(homepage.aboutText),
      aboutPoints: asStringArray(homepage.aboutPoints || []),
    },
    settings: {
      paymentMethods: asStringArray(settings.paymentMethods || ["Credit Card", "PayPal", "Bank Transfer", "Wise"]),
      language: asText(settings.language, "English"),
      themeColor: asText(settings.themeColor, "#111827"),
      systemConfig: asText(settings.systemConfig),
    },
  };
};

const getWebsiteSettingsRow = async () => {
  const rows = await requestSupabase("website_settings?select=*&id=eq.1&limit=1");
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
};

const getAppSettingsRow = async () => {
  const rows = await requestSupabase("app_settings?select=*&id=eq.1&limit=1");
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
};

const ensureValidFeaturedProductId = async (value) => {
  const normalizedId = asText(value);
  if (!normalizedId) {
    return null;
  }

  const rows = await requestSupabase(`products?select=id&id=eq.${encodeURIComponent(normalizedId)}&limit=1`);
  return Array.isArray(rows) && rows[0]?.id ? normalizedId : null;
};

const normalizeSiteConfig = (websiteRow, appRow) => {
  const defaults = buildDefaultSiteConfig();

  return {
    website: {
      brand: {
        name: normalizeBrandName(websiteRow?.brand_name, defaults.website.brand.name),
        logoTop: normalizeBrandName(websiteRow?.brand_logo_top, defaults.website.brand.logoTop),
        logoBottom: normalizeBrandBottom(websiteRow?.brand_logo_bottom, defaults.website.brand.logoBottom),
        logoImage: normalizeLogoImage(websiteRow?.brand_logo_image, defaults.website.brand.logoImage),
        logoPublicId: asText(websiteRow?.brand_logo_public_id, defaults.website.brand.logoPublicId),
        favicon: asText(websiteRow?.favicon, defaults.website.brand.favicon),
        faviconPublicId: asText(websiteRow?.favicon_public_id, defaults.website.brand.faviconPublicId),
        browserTitle: asText(websiteRow?.browser_title, defaults.website.brand.browserTitle),
        subtitle: asText(websiteRow?.brand_subtitle, defaults.website.brand.subtitle),
      },
      hero: {
        eyebrow: asText(websiteRow?.hero_eyebrow, defaults.website.hero.eyebrow),
        title: asText(websiteRow?.hero_title, defaults.website.hero.title),
        subtitle: asText(websiteRow?.hero_subtitle, defaults.website.hero.subtitle),
        backgroundImage: asText(websiteRow?.hero_background_image, defaults.website.hero.backgroundImage),
        backgroundImagePublicId: asText(
          websiteRow?.hero_background_public_id,
          defaults.website.hero.backgroundImagePublicId
        ),
        banner: asText(websiteRow?.hero_banner, defaults.website.hero.banner),
      },
      footer: {
        tagline: asText(websiteRow?.footer_tagline, defaults.website.footer.tagline),
        copyright: asText(websiteRow?.footer_copyright, defaults.website.footer.copyright),
      },
      contact: {
        email: normalizePublicEmail(websiteRow?.contact_email, defaults.website.contact.email),
        phone: asText(websiteRow?.contact_phone, defaults.website.contact.phone),
        address: asText(websiteRow?.contact_address, defaults.website.contact.address),
      },
      social: {
        linkedin: asText(websiteRow?.social_linkedin, defaults.website.social.linkedin),
        whatsapp: normalizePublicWhatsapp(websiteRow?.social_whatsapp, defaults.website.social.whatsapp),
        instagram: asText(websiteRow?.social_instagram, defaults.website.social.instagram),
        x: asText(websiteRow?.social_x, defaults.website.social.x),
      },
      seo: {
        metaDescription: asText(websiteRow?.seo_meta_description, defaults.website.seo.metaDescription),
        metaKeywords: asText(websiteRow?.seo_meta_keywords, defaults.website.seo.metaKeywords),
      },
    },
    homepage: {
      eyebrow: asText(websiteRow?.hero_eyebrow, defaults.homepage.eyebrow),
      title: asText(websiteRow?.hero_title, defaults.homepage.title),
      subtitle: asText(websiteRow?.hero_subtitle, defaults.homepage.subtitle),
      heroBackgroundImage: asText(websiteRow?.hero_background_image, defaults.homepage.heroBackgroundImage),
      heroCtaPrimaryLabel: asText(websiteRow?.hero_cta_primary_label, defaults.homepage.heroCtaPrimaryLabel),
      heroCtaPrimaryLink: asText(websiteRow?.hero_cta_primary_link, defaults.homepage.heroCtaPrimaryLink),
      heroCtaSecondaryLabel: asText(websiteRow?.hero_cta_secondary_label, defaults.homepage.heroCtaSecondaryLabel),
      heroCtaSecondaryLink: asText(websiteRow?.hero_cta_secondary_link, defaults.homepage.heroCtaSecondaryLink),
      trustedBadges: withFallbackArray(websiteRow?.trusted_badges, defaults.homepage.trustedBadges),
      featuredProductId: asText(websiteRow?.featured_product_id, defaults.homepage.featuredProductId),
      spotlightTitle: asText(websiteRow?.spotlight_title, defaults.homepage.spotlightTitle),
      spotlightSubtitle: asText(websiteRow?.spotlight_subtitle, defaults.homepage.spotlightSubtitle),
      aboutTitle: asText(websiteRow?.about_title, defaults.homepage.aboutTitle),
      aboutText: asText(websiteRow?.about_text, defaults.homepage.aboutText),
      aboutPoints: withFallbackArray(websiteRow?.about_points, defaults.homepage.aboutPoints),
    },
    settings: {
      paymentMethods: withFallbackArray(appRow?.payment_methods, defaults.settings.paymentMethods),
      language: asText(appRow?.language, defaults.settings.language),
      themeColor: asText(appRow?.theme_color, defaults.settings.themeColor),
      systemConfig: asText(appRow?.system_config, defaults.settings.systemConfig),
    },
  };
};

const cloneConfig = (config) => JSON.parse(JSON.stringify(config));

const mergeSiteConfig = (current, patch) => {
  const source = cloneConfig(current);
  const next = cloneConfig(current);
  const normalizedPatch = asObject(patch);
  const hasHomepagePatch = normalizedPatch.homepage !== undefined;
  const hasHeroPatch = asObject(normalizedPatch.website).hero !== undefined;

  if (normalizedPatch.website) {
    const websitePatch = asObject(normalizedPatch.website);
    Object.keys(next.website).forEach((key) => {
      if (websitePatch[key] !== undefined) {
        next.website[key] = {
          ...asObject(source.website[key]),
          ...asObject(websitePatch[key]),
        };
      }
    });
  }

  if (normalizedPatch.homepage) {
    next.homepage = {
      ...source.homepage,
      ...asObject(normalizedPatch.homepage),
    };
  }

  if (normalizedPatch.settings) {
    next.settings = {
      ...source.settings,
      ...asObject(normalizedPatch.settings),
    };
  }

  if (hasHeroPatch && !hasHomepagePatch) {
    next.homepage = {
      ...next.homepage,
      eyebrow: next.website.hero.eyebrow,
      title: next.website.hero.title,
      subtitle: next.website.hero.subtitle,
      heroBackgroundImage: next.website.hero.backgroundImage,
    };
  }

  if (hasHomepagePatch) {
    next.website.hero = {
      ...next.website.hero,
      eyebrow: next.homepage.eyebrow,
      title: next.homepage.title,
      subtitle: next.homepage.subtitle,
      backgroundImage: next.homepage.heroBackgroundImage,
    };
  }

  return normalizeSiteConfig(serializeWebsiteSettingsRow(next, null), serializeAppSettingsRow(next, null));
};

const serializeWebsiteSettingsRow = (config, existingRow) => ({
  ...(existingRow || {}),
  id: 1,
  brand_name: asNullableText(config?.website?.brand?.name),
  brand_logo_top: asNullableText(config?.website?.brand?.logoTop),
  brand_logo_bottom: asNullableText(config?.website?.brand?.logoBottom),
  brand_logo_image: asNullableText(config?.website?.brand?.logoImage),
  brand_logo_public_id: asNullableText(config?.website?.brand?.logoPublicId),
  favicon: asNullableText(config?.website?.brand?.favicon),
  favicon_public_id: asNullableText(config?.website?.brand?.faviconPublicId),
  browser_title: asNullableText(config?.website?.brand?.browserTitle),
  brand_subtitle: asNullableText(config?.website?.brand?.subtitle),
  hero_eyebrow: asNullableText(config?.homepage?.eyebrow || config?.website?.hero?.eyebrow),
  hero_title: asNullableText(config?.homepage?.title || config?.website?.hero?.title),
  hero_subtitle: asNullableText(config?.homepage?.subtitle || config?.website?.hero?.subtitle),
  hero_background_image: asNullableText(
    config?.homepage?.heroBackgroundImage || config?.website?.hero?.backgroundImage
  ),
  hero_background_public_id: asNullableText(config?.website?.hero?.backgroundImagePublicId),
  hero_banner: asNullableText(config?.website?.hero?.banner),
  hero_cta_primary_label: asNullableText(config?.homepage?.heroCtaPrimaryLabel),
  hero_cta_primary_link: asNullableText(config?.homepage?.heroCtaPrimaryLink),
  hero_cta_secondary_label: asNullableText(config?.homepage?.heroCtaSecondaryLabel),
  hero_cta_secondary_link: asNullableText(config?.homepage?.heroCtaSecondaryLink),
  trusted_badges: asStringArray(config?.homepage?.trustedBadges),
  featured_product_id: asNullableText(config?.homepage?.featuredProductId),
  spotlight_title: asNullableText(config?.homepage?.spotlightTitle),
  spotlight_subtitle: asNullableText(config?.homepage?.spotlightSubtitle),
  about_title: asNullableText(config?.homepage?.aboutTitle),
  about_text: asNullableText(config?.homepage?.aboutText),
  about_points: asStringArray(config?.homepage?.aboutPoints),
  footer_tagline: asNullableText(config?.website?.footer?.tagline),
  footer_copyright: asNullableText(config?.website?.footer?.copyright),
  contact_email: asNullableText(config?.website?.contact?.email),
  contact_phone: asNullableText(config?.website?.contact?.phone),
  contact_address: asNullableText(config?.website?.contact?.address),
  social_linkedin: asNullableText(config?.website?.social?.linkedin),
  social_whatsapp: asNullableText(config?.website?.social?.whatsapp),
  social_instagram: asNullableText(config?.website?.social?.instagram),
  social_x: asNullableText(config?.website?.social?.x),
  seo_meta_description: asNullableText(config?.website?.seo?.metaDescription),
  seo_meta_keywords: asNullableText(config?.website?.seo?.metaKeywords),
  created_at: existingRow?.created_at || nowIso(),
  updated_at: nowIso(),
});

const serializeAppSettingsRow = (config, existingRow) => ({
  ...(existingRow || {}),
  id: 1,
  platform_name: asNullableText(existingRow?.platform_name || config?.website?.brand?.name || "AvelixLink"),
  platform_version:
    Number.isFinite(Number(existingRow?.platform_version)) && Number(existingRow.platform_version) > 0
      ? Number(existingRow.platform_version)
      : 1,
  admin_login_email: existingRow?.admin_login_email || null,
  recovery_email: existingRow?.recovery_email || null,
  payment_methods: asStringArray(config?.settings?.paymentMethods),
  language: asNullableText(config?.settings?.language),
  theme_color: asNullableText(config?.settings?.themeColor),
  system_config: asNullableText(config?.settings?.systemConfig),
  created_at: existingRow?.created_at || nowIso(),
  updated_at: nowIso(),
});

const writeSingleRow = async (tableName, row, existingRow) => {
  if (existingRow?.id) {
    const rows = await requestSupabase(`${tableName}?id=eq.1`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: row,
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  const rows = await requestSupabase(tableName, {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: row,
  });
  return Array.isArray(rows) ? rows[0] || null : null;
};

const getSiteConfig = async () => {
  const [websiteRow, appRow] = await Promise.all([getWebsiteSettingsRow(), getAppSettingsRow()]);
  return normalizeSiteConfig(websiteRow, appRow);
};

const getSiteConfigSection = async (section) => {
  const normalizedSection = String(section || "").trim();
  if (!ALLOWED_SECTIONS.has(normalizedSection)) {
    throw new Error("Unknown CMS section.");
  }

  const config = await getSiteConfig();
  if (WEBSITE_SECTIONS.has(normalizedSection) && normalizedSection !== "homepage") {
    return cloneConfig(config.website[normalizedSection]);
  }
  if (normalizedSection === "homepage") {
    return cloneConfig(config.homepage);
  }
  return cloneConfig(config.settings[normalizedSection]);
};

const toPatchPayload = (input) => {
  const source = asObject(input);
  const patch = {
    website: {},
    homepage: {},
    settings: {},
  };

  ["brand", "hero", "footer", "contact", "social", "seo"].forEach((key) => {
    if (source[key] !== undefined) {
      patch.website[key] = asObject(source[key]);
    }
  });

  if (source.homepage !== undefined) {
    patch.homepage = asObject(source.homepage);
  }

  ["paymentMethods", "language", "themeColor", "systemConfig"].forEach((key) => {
    if (source[key] !== undefined) {
      patch.settings[key] = source[key];
    }
  });

  return patch;
};

const updateSiteConfig = async (input) => {
  const patch = toPatchPayload(input);
  const [websiteRow, appRow] = await Promise.all([getWebsiteSettingsRow(), getAppSettingsRow()]);
  const current = normalizeSiteConfig(websiteRow, appRow);
  const next = mergeSiteConfig(current, patch);
  const nextWebsiteRow = serializeWebsiteSettingsRow(next, websiteRow);
  const nextAppRow = serializeAppSettingsRow(next, appRow);
  nextWebsiteRow.featured_product_id = await ensureValidFeaturedProductId(nextWebsiteRow.featured_product_id);

  await Promise.all([
    writeSingleRow("website_settings", nextWebsiteRow, websiteRow),
    writeSingleRow("app_settings", nextAppRow, appRow),
  ]);

  return getSiteConfig();
};

const updateSiteConfigSection = async (section, value) => {
  const normalizedSection = String(section || "").trim();
  if (!ALLOWED_SECTIONS.has(normalizedSection)) {
    throw new Error("Unknown CMS section.");
  }

  if (WEBSITE_SECTIONS.has(normalizedSection) && normalizedSection !== "homepage") {
    return updateSiteConfig({
      [normalizedSection]: asObject(value),
    });
  }

  if (normalizedSection === "homepage") {
    return updateSiteConfig({
      homepage: asObject(value),
    });
  }

  return updateSiteConfig({
    [normalizedSection]: value,
  });
};

const seedDefaultSiteConfig = async (options = {}) => {
  const overwrite = Boolean(options.overwrite);
  const [websiteRow, appRow] = await Promise.all([getWebsiteSettingsRow(), getAppSettingsRow()]);

  if (!overwrite && websiteRow?.id && appRow?.id) {
    return {
      skipped: true,
      config: normalizeSiteConfig(websiteRow, appRow),
    };
  }

  const defaults = buildDefaultSiteConfig();
  const nextWebsiteRow = serializeWebsiteSettingsRow(defaults, websiteRow);
  const nextAppRow = serializeAppSettingsRow(defaults, appRow);
  nextWebsiteRow.featured_product_id = await ensureValidFeaturedProductId(nextWebsiteRow.featured_product_id);

  await Promise.all([
    writeSingleRow("website_settings", nextWebsiteRow, websiteRow),
    writeSingleRow("app_settings", nextAppRow, appRow),
  ]);

  return {
    skipped: false,
    config: await getSiteConfig(),
  };
};

module.exports = {
  ALLOWED_SECTIONS,
  WEBSITE_SECTIONS,
  APP_SETTING_SECTIONS,
  buildDefaultSiteConfig,
  getSiteConfig,
  getSiteConfigSection,
  updateSiteConfig,
  updateSiteConfigSection,
  seedDefaultSiteConfig,
};
