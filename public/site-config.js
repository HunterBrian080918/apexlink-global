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
      normalized === "assets/brand/apexlink-mark.png" ||
      normalized === "/assets/brand/apexlink-mark.png" ||
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

      document.querySelectorAll('link[rel~="icon"]').forEach((node) => {
        if (brand.favicon) {
          node.setAttribute("href", brand.favicon);
        }
      });

      const description = document.querySelector('meta[name="description"]');
      if (description && seo.metaDescription) {
        description.setAttribute("content", seo.metaDescription);
      }

      const currentTitle = document.title || "";
      if (document.body.classList.contains("page-home")) {
        document.title = brand.browserTitle || currentTitle || brandName;
      } else if (currentTitle.includes("|")) {
        const parts = currentTitle.split("|").map((item) => item.trim());
        parts[parts.length - 1] = brandName;
        document.title = parts.join(" | ");
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
