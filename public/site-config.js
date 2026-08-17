(function () {
  let siteConfigCache = null;
  let siteConfigPromise = null;
  const LOGO_FALLBACK_SRC = "/assets/brand/avelixlink-mark.png";
  const LEGACY_WORDMARK_PATHS = new Set([
    "assets/brand/apexlink-wordmark.png",
    "/assets/brand/apexlink-wordmark.png",
  ]);
  const normalizeLogoSrc = (value) => {
    const normalized = String(value || "").trim();

    if (!normalized || LEGACY_WORDMARK_PATHS.has(normalized)) {
      return LOGO_FALLBACK_SRC;
    }

    if (
      normalized === "assets/brand/avelixlink-mark.png" ||
      normalized === "/assets/brand/avelixlink-mark.png"
    ) {
      return LOGO_FALLBACK_SRC;
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

    return LOGO_FALLBACK_SRC;
  };
  const normalizeBrandName = (value, fallback = "AvelixLink") => {
    const normalized = String(value || "").trim();
    return !normalized || normalized === "ApexLink Global" || normalized === "ApexLink" ? fallback : normalized;
  };
  const normalizeBrandBottom = (value) => {
    const normalized = String(value || "").trim();
    return !normalized || normalized === "Global" ? "" : normalized;
  };
  const ensureMetaTag = (name) => {
    let node = document.querySelector(`meta[name="${name}"]`);
    if (!node) {
      node = document.createElement("meta");
      node.setAttribute("name", name);
      document.head.appendChild(node);
    }
    return node;
  };
  const ensurePropertyMetaTag = (property) => {
    let node = document.querySelector(`meta[property="${property}"]`);
    if (!node) {
      node = document.createElement("meta");
      node.setAttribute("property", property);
      document.head.appendChild(node);
    }
    return node;
  };
  const ensureCanonicalTag = () => {
    let node = document.querySelector('link[rel="canonical"]');
    if (!node) {
      node = document.createElement("link");
      node.setAttribute("rel", "canonical");
      document.head.appendChild(node);
    }
    return node;
  };
  const normalizeCanonicalBaseUrl = (value) => {
    try {
      const parsed = new URL(String(value || "https://avelixlink.com").trim());
      if (!["http:", "https:"].includes(parsed.protocol)) return "https://avelixlink.com";
      return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
    } catch (error) {
      return "https://avelixlink.com";
    }
  };
  const getCanonicalPath = () => {
    const aliases = {
      "/index.html": "/",
      "/products.html": "/products",
      "/about.html": "/about",
      "/contact.html": "/contact",
      "/support.html": "/support",
      "/detail.html": "/detail",
      "/privacy.html": "/privacy",
      "/terms.html": "/terms",
      "/shipping-policy": "/shipping",
      "/shipping-policy.html": "/shipping",
      "/shipping.html": "/shipping",
      "/returns-refunds": "/refund",
      "/returns-refunds.html": "/refund",
      "/refund.html": "/refund",
    };
    const pathname = aliases[window.location.pathname] || window.location.pathname || "/";
    if (pathname === "/detail") {
      const productId = new URLSearchParams(window.location.search).get("id");
      return productId ? `/detail?id=${encodeURIComponent(productId)}` : "/detail";
    }
    return pathname;
  };
  const getAbsoluteAssetUrl = (value, baseUrl) => {
    const normalized = String(value || "").trim();
    if (!normalized) return "";
    try {
      return new URL(normalized, `${baseUrl}/`).toString();
    } catch (error) {
      return "";
    }
  };
  const NON_INDEXABLE_PATHS = new Set(["/checkout", "/checkout.html", "/payment", "/payment.html", "/results", "/results.html"]);
  const ensureJsonLdScript = (id) => {
    let node = document.querySelector(`#${id}`);
    if (!node) {
      node = document.createElement("script");
      node.type = "application/ld+json";
      node.id = id;
      document.head.appendChild(node);
    }
    return node;
  };

  const getSiteConfig = async (options = {}) => {
    if (siteConfigCache && !options.force) {
      return siteConfigCache;
    }

    if (siteConfigPromise && !options.force) {
      return siteConfigPromise;
    }

    const store = window.NorthstarStore;
    if (!store || typeof store.getSiteConfig !== "function") {
      return null;
    }

    siteConfigPromise = store
      .getSiteConfig()
      .then((config) => {
        siteConfigCache = config || null;
        return siteConfigCache;
      })
      .catch((error) => {
        console.error("[site-config] Failed to load CMS config:", error);
        throw error;
      })
      .finally(() => {
        siteConfigPromise = null;
      });

    return siteConfigPromise;
  };

  const applySiteSettings = async (options = {}) => {
    try {
      const config = await getSiteConfig(options);
      const website = config?.website || null;

      if (!website) {
        return null;
      }

      const brand = website.brand || {};
      const footer = website.footer || {};
      const contact = website.contact || {};
      const seo = website.seo || {};
      const brandName = normalizeBrandName(brand.name);
      const logoTop = normalizeBrandName(brand.logoTop, "AvelixLink");
      const logoBottom = normalizeBrandBottom(brand.logoBottom);
      const isHomePage = document.body.classList.contains("page-home");
      const canonicalBaseUrl = normalizeCanonicalBaseUrl(seo.canonicalBaseUrl);
      const canonicalUrl = new URL(getCanonicalPath(), `${canonicalBaseUrl}/`).toString();
      const indexingAllowed = seo.allowIndexing !== false && !NON_INDEXABLE_PATHS.has(window.location.pathname);

      document.querySelectorAll('link[rel~="icon"]').forEach((node) => {
        if (brand.favicon) {
          node.setAttribute("href", brand.favicon);
        }
      });

      if (isHomePage && seo.metaDescription) {
        ensureMetaTag("description").setAttribute("content", seo.metaDescription);
      }

      if (isHomePage && seo.metaKeywords) {
        ensureMetaTag("keywords").setAttribute("content", seo.metaKeywords);
      }

      const currentTitle = document.title || "";
      if (isHomePage) {
        document.title = brand.browserTitle || currentTitle || brandName;
      } else if (currentTitle.includes("|")) {
        const parts = currentTitle.split("|").map((item) => item.trim());
        parts[parts.length - 1] = brandName;
        document.title = parts.join(" | ");
      }

      ensureCanonicalTag().setAttribute("href", canonicalUrl);
      ensureMetaTag("robots").setAttribute("content", indexingAllowed ? "index,follow" : "noindex,nofollow");

      const pageDescription = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
      const ogTitle = isHomePage ? seo.ogTitle || document.title : document.title || seo.ogTitle;
      const ogDescription = isHomePage
        ? seo.ogDescription || seo.metaDescription || pageDescription
        : pageDescription || seo.ogDescription || seo.metaDescription;
      const ogImage = getAbsoluteAssetUrl(seo.ogImage || brand.logoImage, canonicalBaseUrl);
      ensurePropertyMetaTag("og:title").setAttribute("content", ogTitle || brandName);
      ensurePropertyMetaTag("og:description").setAttribute("content", ogDescription || "");
      ensurePropertyMetaTag("og:url").setAttribute("content", canonicalUrl);
      ensurePropertyMetaTag("og:type").setAttribute("content", "website");
      if (ogImage) {
        ensurePropertyMetaTag("og:image").setAttribute("content", ogImage);
      }

      document.querySelectorAll(".logo").forEach((logo) => {
        logo.setAttribute("aria-label", `${brandName} Home`);
        const image = logo.querySelector(".logo-mark img");
        const topLine = logo.querySelector(".logo-text strong");
        const bottomLine = logo.querySelector(".logo-text span");

        if (image) {
          image.onerror = () => {
            image.onerror = null;
            image.setAttribute("src", LOGO_FALLBACK_SRC);
          };
          image.setAttribute("src", normalizeLogoSrc(brand.logoImage));
          image.setAttribute("alt", `${brandName} mark`);
        }

        if (topLine) {
          topLine.textContent = logoTop;
        }

        if (bottomLine) {
          bottomLine.textContent = logoBottom;
        }
      });

      const footerRoot = document.querySelector(".site-footer .footer-content");
      if (footerRoot) {
        const brandTitle = footerRoot.querySelector(".footer-brand-title");
        const taglineNode = footerRoot.querySelector(".footer-tagline");
        const emailNode = footerRoot.querySelector(".footer-email");
        const copyrightNode = footerRoot.querySelector(".footer-copyright");

        if (brandTitle) {
          brandTitle.textContent = logoTop;
        }

        if (taglineNode) {
          taglineNode.textContent = footer.tagline || "";
        }

        if (emailNode) {
          emailNode.textContent = `Email: ${contact.email || ""}`;
        }

        if (copyrightNode) {
          copyrightNode.textContent = footer.copyright || "";
        }
      }

      document.querySelectorAll(".contact-list li").forEach((item) => {
        const text = item.textContent || "";
        if (text.startsWith("Email:")) {
          item.textContent = `Email: ${contact.email || ""}`;
        }
      });

      document.querySelectorAll("[data-contact-email]").forEach((node) => {
        const email = contact.email || "";
        node.textContent = email;

        if (node.tagName === "A") {
          node.setAttribute("href", email ? `mailto:${email}` : "#");
        }
      });

      document.querySelectorAll(".support-contact-item").forEach((item) => {
        const label = item.querySelector("span")?.textContent?.trim();
        const value = item.querySelector("strong");

        if (!label || !value) {
          return;
        }

        if (label === "Email") {
          value.textContent = contact.email || "";
        }
      });

      if (isHomePage) {
        const organizationSchema = {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: brandName,
          url: `${window.location.origin}/`,
          logo: normalizeLogoSrc(brand.logoImage),
          contactPoint: contact.email
            ? [
                {
                  "@type": "ContactPoint",
                  contactType: "customer support",
                  email: contact.email,
                },
              ]
            : undefined,
        };
        ensureJsonLdScript("organization-schema").textContent = JSON.stringify(organizationSchema);
      }

      return config;
    } catch (error) {
      console.error("[site-config] Applying site settings failed:", error);
      return null;
    }
  };

  const ready = applySiteSettings();
  window.NorthstarSiteConfig = {
    ready,
    getConfig: () => getSiteConfig(),
    refresh: () => applySiteSettings({ force: true }),
  };
})();
