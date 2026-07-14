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

const getCheckoutUrl = (productId, mode) => {
  const base = routes.checkout(productId);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}mode=${encodeURIComponent(mode)}`;
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

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "$0.00";
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

const getWholesalePriceTiers = (product) =>
  Array.isArray(product?.b2b?.priceTiers)
    ? product.b2b.priceTiers.filter((tier) => Number(tier?.unitPrice || 0) > 0)
    : [];

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

const renderDetail = (product, brandName) => {
  if (!detailRoot) {
    return;
  }

  if (!product) {
    detailRoot.innerHTML =
      '<div class="detail-empty"><h1>Product not found</h1><p>Please return to the catalog and choose another item.</p></div>';
    return;
  }

  document.title = `${product.name} | ${brandName}`;
  const retailEnabled = product.b2c?.enabled !== false;
  const wholesaleEnabled = product.b2b?.enabled !== false;
  const retailPrice = getRetailPriceLabel(product);
  const retailShippingTime = formatLeadTime(product.shippingDays, product.shippingTime);
  const wholesaleMoq = Math.max(1, Number(product.b2b?.wholesaleMoq || product.moqValue || 1));
  const wholesaleLeadTime = formatLeadTime(product.b2b?.wholesaleLeadTime, product.shippingTime);
  const wholesalePriceTiers = getWholesalePriceTiers(product);
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
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
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
      if (priceValueNode) {
        priceValueNode.textContent = wholesalePriceTiers.length
          ? `${formatCurrency(wholesalePriceTiers[0].unitPrice)}+`
          : "Contact us for wholesale pricing";
      }
      if (priceMetaNode) {
        priceMetaNode.textContent = wholesalePriceTiers.length
          ? "Tiered wholesale pricing based on quantity."
          : "Pricing is available on request for wholesale orders.";
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
                      <strong>${formatCurrency(tier.unitPrice)}</strong>
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
              "Pricing",
              `
                ${wholesalePricingMarkup}
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
                    ? renderInfoItem("Deposit Percentage", escapeHtml(wholesaleDepositLabel))
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
          <a class="btn btn-primary" href="${getCheckoutUrl(product.id, "wholesale")}">Request Wholesale Quote</a>
        `;
      }
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
  const tiers = getWholesalePriceTiers(product);
  const firstTier = tiers.find((tier) => Number(tier?.unitPrice || 0) > 0);
  return firstTier ? formatCurrency(firstTier.unitPrice) : "Contact for wholesale pricing";
};

const initPage = async () => {
  const store = window.NorthstarStore;

  if (!store) {
    return;
  }

  await store.ready;
  await store.trackVisit();
  const [website] = await Promise.all([store.getWebsiteSettings()]);
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  currentProduct = id ? await store.getProductById(id) : (await store.getProducts())[0] || null;

  renderDetail(currentProduct, website?.brand?.name || "AvelixLink");
  setupRevealAnimations();
};

setupNavigation();
setupForm();
syncNavbarState();
window.addEventListener("scroll", syncNavbarState, { passive: true });
initPage();
