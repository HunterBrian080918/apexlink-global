document.body.classList.add("has-js");

const navbar = document.querySelector(".navbar");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const menuItems = document.querySelectorAll(".nav-links a");
const detailRoot = document.querySelector("#product-detail");
const detailForm = document.querySelector(".detail-form");
const formStatus = document.querySelector(".form-status");
const routes = window.ApexLinkRoutes || {
  checkout: (id) => `/checkout?id=${encodeURIComponent(id)}`,
};

let currentProduct = null;
let currentPurchaseMode = "retail";
let currentWholesaleCurrency = "USD";
let currentWholesaleQuantity = 1;
const DEFAULT_WHOLESALE_CURRENCY = "USD";

const getCheckoutUrl = (productId, mode, options = {}) => {
  const base = routes.checkout(productId);
  const params = new URLSearchParams(base.split("?")[1] || "");
  params.set("mode", mode);
  if (options.currency) {
    params.set("currency", String(options.currency || "").trim().toUpperCase());
  }
  if (options.quantity) {
    params.set("quantity", String(Math.max(1, Number(options.quantity || 1))));
  }
  const pathname = base.split("?")[0];
  return `${pathname}?${params.toString()}`;
};

const upsertMeta = (name, content) => {
  if (!content) {
    return;
  }
  let node = document.querySelector(`meta[name="${name}"]`);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute("name", name);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
};

const upsertCanonical = (href) => {
  if (!href) {
    return;
  }
  let node = document.querySelector('link[rel="canonical"]');
  if (!node) {
    node = document.createElement("link");
    node.setAttribute("rel", "canonical");
    document.head.appendChild(node);
  }
  node.setAttribute("href", href);
};

const upsertPropertyMeta = (property, content) => {
  if (!property || !content) {
    return;
  }
  let node = document.querySelector(`meta[property="${property}"]`);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute("property", property);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
};

const upsertJsonLd = (id, payload) => {
  let node = document.querySelector(`#${id}`);
  if (!node) {
    node = document.createElement("script");
    node.type = "application/ld+json";
    node.id = id;
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(payload);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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
    throw new Error(String(payload?.error || `Request failed with status ${response.status}.`));
  }

  return payload;
};

const formatCurrency = (value, currency = "USD") => {
  const amount = Number(value || 0);
  const normalizedCurrency = String(currency || "USD").trim().toUpperCase() || "USD";
  if (!Number.isFinite(amount)) {
    return normalizedCurrency === "HKD" ? "HK$0.00" : "$0.00";
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    return `${normalizedCurrency} ${amount.toFixed(2)}`;
  }
};

const formatLeadTime = (value, fallback = "") => {
  const days = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(days) && days > 0 ? `${days} days` : String(fallback || "");
};

const formatDepositValue = (deposit) => {
  const value = Number(deposit?.value || 0);

  if (deposit?.type === "fixed") {
    return formatCurrency(value);
  }

  if (Number.isInteger(value)) {
    return `${value}%`;
  }

  return `${value.toFixed(2)}%`;
};

const getRetailPriceLabel = (product) => {
  const retailPriceValue = Number(product?.b2c?.retailPrice || 0);
  return retailPriceValue > 0 ? formatCurrency(retailPriceValue) : "$0.00";
};

const getWholesalePriceTiers = (product, currency = DEFAULT_WHOLESALE_CURRENCY) =>
  Array.isArray(product?.b2b?.priceTiers)
    ? product.b2b.priceTiers
        .filter((tier) => String(tier?.currency || DEFAULT_WHOLESALE_CURRENCY).trim().toUpperCase() === currency)
        .filter((tier) => Number(tier?.unitPrice || 0) > 0)
        .slice()
        .sort((left, right) => Number(left?.minQuantity || 0) - Number(right?.minQuantity || 0))
    : [];

const resolveWholesaleTier = (tiers, quantity) => {
  const nextQuantity = Math.max(1, Number(quantity || 1));
  const sortedTiers = Array.isArray(tiers)
    ? tiers
        .filter((tier) => Number(tier?.unitPrice || 0) > 0)
        .slice()
        .sort((left, right) => Number(left?.minQuantity || 0) - Number(right?.minQuantity || 0))
    : [];

  if (!sortedTiers.length) {
    return null;
  }

  return (
    sortedTiers.find((tier) => {
      const min = Math.max(1, Number(tier?.minQuantity || 1));
      const max = Math.max(0, Number(tier?.maxQuantity || 0));
      return nextQuantity >= min && (max === 0 || nextQuantity <= max);
    }) || null
  );
};

const getAvailableWholesaleCurrencies = (product) => {
  const currencies = Array.from(
    new Set(
      (Array.isArray(product?.b2b?.priceTiers) ? product.b2b.priceTiers : [])
        .map((tier) => String(tier?.currency || DEFAULT_WHOLESALE_CURRENCY).trim().toUpperCase())
        .filter((currency) => ["USD", "HKD"].includes(currency))
    )
  );
  return currencies.length ? currencies : [DEFAULT_WHOLESALE_CURRENCY];
};

const getWholesalePricingState = (product, quantity, currency) => {
  const tiers = getWholesalePriceTiers(product, currency);
  const matchedTier = resolveWholesaleTier(tiers, quantity);
  const normalizedQuantity = Math.max(1, Number(quantity || 1));
  const subtotalValue = Number(matchedTier?.unitPrice || 0) * normalizedQuantity;
  const totalValue = subtotalValue;
  const depositConfig = product?.b2b?.deposit || {};
  const depositRawValue = Number(depositConfig?.value || 0);
  const depositAmountValue =
    depositConfig?.required && depositRawValue > 0
      ? depositConfig?.type === "fixed"
        ? depositRawValue
        : totalValue * (depositRawValue / 100)
      : 0;

  return {
    currency,
    quantity: normalizedQuantity,
    tiers,
    matchedTier,
    pricingAvailable: Boolean(matchedTier && Number(matchedTier.unitPrice || 0) > 0),
    subtotalValue,
    totalValue,
    depositAmountValue,
    balanceAmountValue: Math.max(0, totalValue - depositAmountValue),
  };
};

const getProductKeywordList = (product) => {
  const values = [
    ...(Array.isArray(product?.keywords) ? product.keywords : []),
    ...(Array.isArray(product?.tags) ? product.tags : []),
    ...(Array.isArray(product?.functions) ? product.functions : []),
    product?.category || "",
    product?.name || "",
  ];
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
};

const getProductSeoTitle = (product, brandName) => `${product.name} Supplier | ${brandName}`;

const getProductSeoDescription = (product, brandName) => {
  const category = String(product?.category || "workspace products").trim();
  return `${brandName} provides ${product.name} and related ${category.toLowerCase()} for global buyers, wholesale sourcing, and OEM workspace supply.`;
};

const applyProductSeo = (product, brandName, seoDefaults = {}) => {
  if (!product) {
    return;
  }

  let canonicalBaseUrl = "https://avelixlink.com";
  try {
    const parsedCanonicalBase = new URL(String(seoDefaults.canonicalBaseUrl || canonicalBaseUrl).trim());
    if (["http:", "https:"].includes(parsedCanonicalBase.protocol)) {
      canonicalBaseUrl = `${parsedCanonicalBase.origin}${parsedCanonicalBase.pathname.replace(/\/+$/, "")}`;
    }
  } catch (error) {
    canonicalBaseUrl = "https://avelixlink.com";
  }
  const canonicalUrl = new URL(`/detail?id=${encodeURIComponent(product.id)}`, `${canonicalBaseUrl}/`).toString();
  const keywordList = getProductKeywordList(product);
  const seoTitle = String(product.seoTitle || "").trim() || getProductSeoTitle(product, brandName);
  const seoDescription = String(product.metaDescription || "").trim() || getProductSeoDescription(product, brandName);
  const wholesalePriceTiers = getWholesalePriceTiers(product, DEFAULT_WHOLESALE_CURRENCY);
  const retailPriceValue = Number(product?.b2c?.retailPrice || 0);
  const primaryImageValue = String(product.image || seoDefaults.ogImage || "").trim();
  let primaryImage = primaryImageValue;
  if (primaryImageValue) {
    try {
      primaryImage = new URL(primaryImageValue, `${canonicalBaseUrl}/`).toString();
    } catch (error) {
      primaryImage = primaryImageValue;
    }
  }
  const offer =
    retailPriceValue > 0
      ? {
          "@type": "Offer",
          priceCurrency: "USD",
          price: retailPriceValue.toFixed(2),
          availability: "https://schema.org/InStock",
          url: canonicalUrl,
        }
      : wholesalePriceTiers.length
        ? {
            "@type": "AggregateOffer",
            priceCurrency: DEFAULT_WHOLESALE_CURRENCY,
            lowPrice: Number(wholesalePriceTiers[wholesalePriceTiers.length - 1]?.unitPrice || wholesalePriceTiers[0]?.unitPrice || 0).toFixed(2),
            highPrice: Number(wholesalePriceTiers[0]?.unitPrice || 0).toFixed(2),
            offerCount: wholesalePriceTiers.length,
            availability: "https://schema.org/InStock",
            url: canonicalUrl,
          }
        : {
            "@type": "Offer",
            availability: "https://schema.org/OutOfStock",
            url: canonicalUrl,
          };

  document.title = seoTitle;
  upsertMeta("description", seoDescription);
  upsertMeta("keywords", keywordList.join(", "));
  upsertCanonical(canonicalUrl);
  upsertPropertyMeta("og:title", seoTitle || seoDefaults.ogTitle || product.name);
  upsertPropertyMeta("og:description", seoDescription || seoDefaults.ogDescription || seoDefaults.metaDescription);
  upsertPropertyMeta("og:image", primaryImage);
  upsertPropertyMeta("og:url", canonicalUrl);
  upsertPropertyMeta("og:type", "product");
  upsertJsonLd("product-schema", {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: seoDescription,
    image: primaryImage ? [primaryImage] : [],
    brand: {
      "@type": "Brand",
      name: brandName,
    },
    category: product.category || undefined,
    offers: offer,
  });
};

const syncNavbarState = () => {
  if (!navbar) {
    return;
  }

  navbar.classList.toggle("is-scrolled", window.scrollY > 18);
};

const setupNavigation = () => {
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
      navbar?.classList.toggle("menu-open", isOpen);
    });
  }

  menuItems.forEach((item) => {
    item.addEventListener("click", () => {
      navLinks?.classList.remove("is-open");
      navToggle?.setAttribute("aria-expanded", "false");
      navbar?.classList.remove("menu-open");
    });
  });
};

const renderDetail = (product, brandName, seoDefaults = {}) => {
  if (!detailRoot) {
    return;
  }

  if (!product) {
    detailRoot.innerHTML =
      '<div class="detail-empty"><h1>Product not found</h1><p>Please return to the catalog and choose another item.</p></div>';
    return;
  }

  applyProductSeo(product, brandName, seoDefaults);
  const retailEnabled = product.b2c?.enabled !== false;
  const wholesaleEnabled = product.b2b?.enabled !== false;
  const retailPrice = getRetailPriceLabel(product);
  const retailShippingTime = formatLeadTime(product.shippingDays, product.shippingTime);
  const wholesaleMoq = Math.max(1, Number(product.b2b?.wholesaleMoq || product.moqValue || 1));
  const wholesaleLeadTime = formatLeadTime(product.b2b?.wholesaleLeadTime, product.shippingTime);
  const wholesaleCurrencies = getAvailableWholesaleCurrencies(product);
  currentWholesaleCurrency = wholesaleCurrencies.includes(currentWholesaleCurrency)
    ? currentWholesaleCurrency
    : wholesaleCurrencies[0] || DEFAULT_WHOLESALE_CURRENCY;
  currentWholesaleQuantity = Math.max(wholesaleMoq, currentWholesaleQuantity || wholesaleMoq);
  const wholesaleDeposit = product.b2b?.deposit || {};
  const showWholesaleDeposit = Boolean(wholesaleDeposit.required);
  const wholesaleDepositLabel = showWholesaleDeposit ? formatDepositValue(wholesaleDeposit) : "";
  const wholesalePaymentTerms =
    product.b2b?.deposit?.customPaymentTerms ||
    product.b2b?.depositTerms ||
    "Contact us for wholesale pricing";
  currentPurchaseMode = retailEnabled ? "retail" : wholesaleEnabled ? "wholesale" : "retail";

  const specsMarkup = Object.entries(product.specs || {})
    .filter(([label]) => !["Monthly Production Capacity", "Retail Stock"].includes(String(label)))
    .map(
      ([label, value]) => `
        <div class="spec-item">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `
    )
    .join("");

  const functionMarkup = (product.functions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const scenarioMarkup = (product.scenarios || [])
    .map((item) => `<span class="scenario-chip">${escapeHtml(item)}</span>`)
    .join("");
  const galleryMarkup = (product.detailImages || [])
    .map(
      (item) => `
        <article class="detail-gallery-card reveal">
          <div class="detail-gallery-media">
            <img src="${escapeHtml(item.url)}" alt="${escapeHtml(product.name)} ${escapeHtml(item.title)}">
          </div>
          <div class="detail-gallery-copy">
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.text)}</p>
          </div>
        </article>
      `
    )
    .join("");

  detailRoot.innerHTML = `
    <section class="detail-hero-block">
      <div class="detail-hero-layout">
        <div class="detail-image-wrap reveal">
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)} ${escapeHtml(product.category || "workspace product")}">
        </div>

        <div class="detail-copy reveal">
          <span class="detail-badge">${escapeHtml(product.category)}</span>
          <h1>${escapeHtml(product.name)}</h1>
          <div class="detail-price-row">
            <strong class="detail-price" id="detail-price-value"></strong>
            <span class="detail-secondary" id="detail-price-meta"></span>
          </div>
          <div class="detail-purchase-switch" role="tablist" aria-label="Purchase mode">
            <button
              class="detail-mode-button ${currentPurchaseMode === "retail" ? "is-active" : ""}"
              type="button"
              data-purchase-mode="retail"
              ${retailEnabled ? "" : "disabled"}
            >
              Retail
            </button>
            <button
              class="detail-mode-button ${currentPurchaseMode === "wholesale" ? "is-active" : ""}"
              type="button"
              data-purchase-mode="wholesale"
              ${wholesaleEnabled ? "" : "disabled"}
            >
              Wholesale
            </button>
          </div>
          <div class="detail-hero-meta" id="detail-purchase-meta"></div>
          <div class="detail-purchase-panel" id="detail-purchase-panel"></div>
          <div class="detail-actions" id="detail-purchase-actions"></div>
          <div class="detail-purchase-note">
            <a class="detail-purchase-link" href="#inquiry">Contact Team</a>
          </div>
        </div>
      </div>
    </section>

    <section class="detail-info-block">
      <div class="detail-info-header reveal">
        <p class="eyebrow">Product Overview</p>
        <h2>Product introduction and workspace details</h2>
      </div>

      <div class="detail-layout detail-layout-secondary">
        <div class="detail-overview reveal">
          <p class="detail-description">${escapeHtml(product.detailDescription)}</p>
          <div class="detail-scenarios">
            ${scenarioMarkup}
          </div>
        </div>

        <div class="detail-highlights reveal">
          <div class="detail-card">
            <strong>Minimum Order</strong>
            <span>${escapeHtml(product.moq)}</span>
          </div>
          <div class="detail-card">
            <strong>Delivery Window</strong>
            <span>${escapeHtml(product.shippingTime)}</span>
          </div>
          <div class="detail-card">
            <strong>Category</strong>
            <span>${escapeHtml(product.category)}</span>
          </div>
        </div>
      </div>

      <div class="detail-specs reveal">
        <h2>Product Functions</h2>
        <ul class="detail-function-list">
          ${functionMarkup}
        </ul>

        <h2>Specifications</h2>
        <div class="spec-grid">
          ${specsMarkup}
        </div>
        <p class="spec-note">Product information shown here is loaded from the admin-managed data store.</p>
      </div>
    </section>

    <section class="detail-gallery-block">
      <div class="detail-info-header reveal">
        <p class="eyebrow">Visual Gallery</p>
        <h2>Product, scene, and detail visuals</h2>
      </div>
      <div class="detail-gallery-grid">
        ${galleryMarkup}
      </div>
    </section>
  `;

  const priceValueNode = detailRoot.querySelector("#detail-price-value");
  const priceMetaNode = detailRoot.querySelector("#detail-price-meta");
  const purchaseMetaNode = detailRoot.querySelector("#detail-purchase-meta");
  const purchasePanelNode = detailRoot.querySelector("#detail-purchase-panel");
  const purchaseActionsNode = detailRoot.querySelector("#detail-purchase-actions");
  const modeButtons = detailRoot.querySelectorAll("[data-purchase-mode]");

  const renderInfoItem = (label, value) => `
    <div class="detail-info-item">
      ${label ? `<span>${label}</span>` : ""}
      <strong>${value}</strong>
    </div>
  `;

  const renderInfoCard = (title, content, modifier = "") => `
    <section class="detail-info-card${modifier ? ` ${modifier}` : ""}">
      <span class="detail-info-eyebrow">${title}</span>
      <div class="detail-info-stack">
        ${content}
      </div>
    </section>
  `;

  const renderPurchaseMode = (mode) => {
    currentPurchaseMode = mode === "wholesale" && wholesaleEnabled ? "wholesale" : "retail";

    modeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.purchaseMode === currentPurchaseMode);
      button.setAttribute("aria-selected", String(button.dataset.purchaseMode === currentPurchaseMode));
    });

    if (currentPurchaseMode === "wholesale") {
      const pricingState = getWholesalePricingState(product, currentWholesaleQuantity, currentWholesaleCurrency);
      const wholesalePriceTiers = getWholesalePriceTiers(product, currentWholesaleCurrency);
      const currentTierRange = pricingState.matchedTier
        ? (() => {
            const min = Math.max(1, Number(pricingState.matchedTier.minQuantity || 1));
            const max = Math.max(0, Number(pricingState.matchedTier.maxQuantity || 0));
            return max > 0 ? `${min}-${max}` : `${min}+`;
          })()
        : "Request a Quote";
      if (priceValueNode) {
        priceValueNode.textContent = pricingState.pricingAvailable
          ? formatCurrency(pricingState.matchedTier.unitPrice, currentWholesaleCurrency)
          : "Request a Quote";
      }
      if (priceMetaNode) {
        priceMetaNode.textContent = pricingState.pricingAvailable
          ? `Volume tier pricing in ${currentWholesaleCurrency}.`
          : "Selected quantity is outside the configured wholesale tiers.";
      }
      if (purchaseMetaNode) {
        purchaseMetaNode.hidden = true;
        purchaseMetaNode.innerHTML = "";
      }
      if (purchasePanelNode) {
        const wholesalePricingMarkup = wholesalePriceTiers.length
          ? `
            <div class="detail-info-tier-list" role="table" aria-label="Wholesale pricing tiers">
              <div class="detail-info-tier detail-info-tier--head" role="row">
                <span role="columnheader">Qty</span>
                <strong role="columnheader">Price</strong>
              </div>
              ${wholesalePriceTiers
                .map((tier) => {
                  const min = Math.max(1, Number(tier.minQuantity || 1));
                  const max = Math.max(0, Number(tier.maxQuantity || 0));
                  const range = max > 0 ? `${min}-${max}` : `${min}+`;
                  return `
                    <div class="detail-info-tier" role="row">
                      <span>${range}</span>
                      <strong>${formatCurrency(tier.unitPrice, currentWholesaleCurrency)}</strong>
                    </div>
                  `;
                })
                .join("")}
            </div>
          `
          : `<div class="detail-info-empty">Contact us for wholesale pricing</div>`;

        purchasePanelNode.innerHTML = `
          <div class="detail-info-grid">
            ${renderInfoCard(
              "Quote Setup",
              `
                <div class="detail-quote-controls">
                  ${
                    wholesaleCurrencies.length > 1
                      ? `
                        <label class="detail-quote-field">
                          <span>Currency</span>
                          <select id="detail-wholesale-currency">
                            ${wholesaleCurrencies
                              .map(
                                (currency) => `
                                  <option value="${escapeHtml(currency)}" ${currency === currentWholesaleCurrency ? "selected" : ""}>
                                    ${escapeHtml(currency)}
                                  </option>
                                `
                              )
                              .join("")}
                          </select>
                        </label>
                      `
                      : `
                        <div class="detail-quote-field">
                          <span>Currency</span>
                          <strong>${escapeHtml(currentWholesaleCurrency)}</strong>
                        </div>
                      `
                  }
                  <label class="detail-quote-field">
                    <span>Quantity</span>
                    <input
                      id="detail-wholesale-quantity"
                      type="number"
                      min="${wholesaleMoq}"
                      step="1"
                      value="${currentWholesaleQuantity}"
                    >
                  </label>
                </div>
              `,
              "detail-info-card--wide"
            )}
            ${renderInfoCard(
              "Pricing",
              `
                ${wholesalePricingMarkup}
                ${renderInfoItem("Current Tier", currentTierRange)}
                ${renderInfoItem("Unit Price", pricingState.pricingAvailable ? formatCurrency(pricingState.matchedTier.unitPrice, currentWholesaleCurrency) : "Request a Quote")}
                ${renderInfoItem("Subtotal", pricingState.pricingAvailable ? formatCurrency(pricingState.subtotalValue, currentWholesaleCurrency) : "Request a Quote")}
                ${renderInfoItem("Total", pricingState.pricingAvailable ? formatCurrency(pricingState.totalValue, currentWholesaleCurrency) : "Request a Quote")}
                ${renderInfoItem("MOQ", `${wholesaleMoq} units`)}
              `,
              "detail-info-card--wide"
            )}
            ${renderInfoCard(
              "Production",
              `
                ${renderInfoItem("Lead Time", escapeHtml(wholesaleLeadTime))}
                ${
                  showWholesaleDeposit
                    ? `
                      ${renderInfoItem("Deposit Percentage", escapeHtml(wholesaleDepositLabel))}
                      ${renderInfoItem(
                        "Deposit Amount",
                        pricingState.pricingAvailable
                          ? formatCurrency(pricingState.depositAmountValue, currentWholesaleCurrency)
                          : "Request a Quote"
                      )}
                      ${renderInfoItem(
                        "Balance Amount",
                        pricingState.pricingAvailable
                          ? formatCurrency(pricingState.balanceAmountValue, currentWholesaleCurrency)
                          : "Request a Quote"
                      )}
                    `
                    : ""
                }
              `
            )}
            ${renderInfoCard("Payment", renderInfoItem("", escapeHtml(wholesalePaymentTerms)))}
          </div>
        `;
      }
      if (purchaseActionsNode) {
        purchaseActionsNode.innerHTML = `
          ${
            pricingState.pricingAvailable
              ? `
                <a
                  class="btn btn-primary"
                  href="${getCheckoutUrl(product.id, "wholesale", {
                    currency: currentWholesaleCurrency,
                    quantity: currentWholesaleQuantity,
                  })}"
                >
                  Continue to Wholesale Checkout
                </a>
              `
              : `
                <button class="btn btn-primary" type="button" disabled>
                  Request Wholesale Quote
                </button>
              `
          }
        `;
      }

      detailRoot.querySelector("#detail-wholesale-currency")?.addEventListener("change", (event) => {
        currentWholesaleCurrency = String(event.target.value || DEFAULT_WHOLESALE_CURRENCY).trim().toUpperCase();
        renderPurchaseMode("wholesale");
      });

      detailRoot.querySelector("#detail-wholesale-quantity")?.addEventListener("input", (event) => {
        const nextQuantity = Math.max(wholesaleMoq, Number.parseInt(String(event.target.value || wholesaleMoq), 10) || wholesaleMoq);
        currentWholesaleQuantity = nextQuantity;
        renderPurchaseMode("wholesale");
      });
      return;
    }

    if (priceValueNode) {
      priceValueNode.textContent = retailPrice;
    }
    if (priceMetaNode) {
      priceMetaNode.textContent = "Retail pricing managed from the admin dashboard.";
    }
    if (purchaseMetaNode) {
      purchaseMetaNode.hidden = true;
      purchaseMetaNode.innerHTML = "";
    }
    if (purchasePanelNode) {
      purchasePanelNode.innerHTML = `
        <div class="detail-info-grid">
          ${renderInfoCard("Pricing", renderInfoItem("", retailPrice))}
          ${renderInfoCard("Shipping", renderInfoItem("", escapeHtml(retailShippingTime)))}
          ${renderInfoCard("Product", renderInfoItem("", escapeHtml(product.category)))}
        </div>
      `;
    }
    if (purchaseActionsNode) {
      purchaseActionsNode.innerHTML = `
        <a class="btn btn-primary" href="${getCheckoutUrl(product.id, "retail")}">Buy Retail</a>
      `;
    }
  };

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      renderPurchaseMode(button.dataset.purchaseMode || "retail");
    });
  });

  renderPurchaseMode(currentPurchaseMode);
};

const setupRevealAnimations = () => {
  const items = document.querySelectorAll(".reveal, .animate-on-scroll");

  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          } else {
            entry.target.classList.remove("is-visible");
          }
        });
      },
      {
        threshold: 0.15,
      }
    );

    items.forEach((item, index) => {
      item.style.transitionDelay = `${Math.min(index * 60, 240)}ms`;
      revealObserver.observe(item);
    });
  } else {
    items.forEach((item) => item.classList.add("is-visible"));
  }
};

const setupForm = () => {
  if (!detailForm || !window.NorthstarStore) {
    return;
  }

  detailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(detailForm);
    const wholesaleMoq = Math.max(1, Number(currentProduct?.b2b?.wholesaleMoq || currentProduct?.moqValue || 1));
    const requestedQuantity = Math.max(wholesaleMoq, Number.parseInt(String(formData.get("quantity") || ""), 10) || wholesaleMoq);

    try {
      const createPayload = await requestJson("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          order: {
            customerName: formData.get("name"),
            email: formData.get("email"),
            country: formData.get("country"),
            productId: currentProduct?.id || "",
            quantity: requestedQuantity,
            message: formData.get("message"),
            purchaseMode: "wholesale",
          },
        }),
      });
      const createdOrder = createPayload?.order || null;

      if (!createdOrder?.id) {
        throw new Error("Wholesale inquiry could not be created.");
      }

      if (formStatus) {
        formStatus.textContent = `Request saved. Order ${createdOrder.orderNumber || createdOrder.id} is now in the admin order queue.`;
      }

      detailForm.reset();
    } catch (error) {
      console.error("Wholesale inquiry submission failed:", error);
      if (formStatus) {
        formStatus.textContent = `Unable to save your request: ${error?.message || "Unknown error."}`;
      }
    }
  });
};

const wholesaleBudgetLabel = (product) => {
  const tiers = getWholesalePriceTiers(product, DEFAULT_WHOLESALE_CURRENCY);
  const firstTier = tiers.find((tier) => Number(tier?.unitPrice || 0) > 0);
  return firstTier ? formatCurrency(firstTier.unitPrice, DEFAULT_WHOLESALE_CURRENCY) : "Contact for wholesale pricing";
};

const initPage = async () => {
  const store = window.NorthstarStore;

  if (!store) {
    return;
  }

  await store.ready;
  const [website] = await Promise.all([store.getWebsiteSettings()]);
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  currentProduct = id ? await store.getProductById(id) : (await store.getProducts())[0] || null;

  renderDetail(currentProduct, website?.brand?.name || "AvelixLink", website?.seo || {});
  setupRevealAnimations();
};

setupNavigation();
setupForm();
syncNavbarState();
window.addEventListener("scroll", syncNavbarState, { passive: true });
initPage();
