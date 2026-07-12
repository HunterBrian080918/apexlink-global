document.body.classList.add("has-js");

const navbar = document.querySelector(".navbar");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const menuItems = document.querySelectorAll(".nav-links a");
const productGrid = document.querySelector("#product-grid");
const productsMatchState = document.querySelector("#products-match-state");

let revealObserver;
let allProducts = [];
let aiMatchConfig = null;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toTitleCase = (value) =>
  String(value || "")
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getProductDescription = (product) =>
  String(product.description || product.detailDescription || "").trim();

const getProductTags = (product) => {
  const source = Array.isArray(product.tags) && product.tags.length ? product.tags : product.functions || [];
  return source
    .map((item) => toTitleCase(item))
    .filter(Boolean)
    .slice(0, 2);
};

const getImageFitClass = () => "is-contain";

const getRetailPriceLabel = (product) => {
  const retailPrice = Number(product?.b2c?.retailPrice || 0);
  return retailPrice > 0 ? `$${retailPrice.toFixed(2)}` : "$0.00";
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

const setupRevealAnimations = () => {
  const items = document.querySelectorAll(".reveal, .animate-on-scroll");

  if ("IntersectionObserver" in window) {
    revealObserver = new IntersectionObserver(
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

const registerRevealItems = (elements) => {
  if (!elements?.length) {
    return;
  }

  elements.forEach((item, index) => {
    item.style.transitionDelay = `${Math.min(index * 60, 240)}ms`;

    if (revealObserver) {
      revealObserver.observe(item);
    } else {
      item.classList.add("is-visible");
    }
  });
};

const renderProducts = (products) => {
  if (!productGrid) {
    return;
  }

  if (!products.length) {
    productGrid.innerHTML = `
      <article class="product-card reveal">
        <h3>No products available</h3>
        <p>Open the admin dashboard to add the first product to the catalog.</p>
      </article>
    `;
    registerRevealItems(productGrid.querySelectorAll(".reveal"));
    return;
  }

  productGrid.innerHTML = products
    .map((product) => {
      const productHref = window.ApexLinkRoutes.detail(product.id);
      const description = getProductDescription(product);
      const tags = getProductTags(product);

      return `
        <article class="product-card reveal">
          <a class="product-card-media ${getImageFitClass(product.image)}" href="${productHref}" aria-label="View ${escapeHtml(
        product.name
      )}">
            <img
              src="${escapeHtml(product.image)}"
              alt="${escapeHtml(product.name)}"
              loading="lazy"
              decoding="async"
            >
          </a>
          <div class="product-card-copy">
            <p class="product-category">${escapeHtml(product.category)}</p>
            <h3>
              <a class="product-card-title-link" href="${productHref}">
                ${escapeHtml(product.name)}
              </a>
            </h3>
            ${
              description
                ? `<p class="product-description">${escapeHtml(description)}</p>`
                : `<p class="product-description is-empty"></p>`
            }
          </div>
          <div class="product-card-footer">
            <div class="product-meta product-card-price-row">
              <strong class="product-price">${escapeHtml(getRetailPriceLabel(product))}</strong>
            </div>
            ${
              tags.length
                ? `
              <div class="product-card-tags" aria-label="Product features">
                ${tags.map((tag) => `<span class="product-card-tag">${escapeHtml(tag)}</span>`).join("")}
              </div>
            `
                : ""
            }
            <a class="btn btn-outline product-link" href="${productHref}">View Product</a>
          </div>
        </article>
      `;
    })
    .join("");

  registerRevealItems(productGrid.querySelectorAll(".reveal"));
};

const clearSavedCriteria = () => {
  if (window.MatchEngine?.storageKey) {
    window.sessionStorage.removeItem(window.MatchEngine.storageKey);
  }
};

const resetProductsFilters = () => {
  clearSavedCriteria();
  renderProducts(allProducts);

  if (productsMatchState) {
    productsMatchState.hidden = true;
    productsMatchState.innerHTML = "";
  }

  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = "";
  window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.hash}`);
};

const renderMatchState = (matchResult) => {
  if (!productsMatchState) {
    return;
  }

  const title = matchResult.isFallback
    ? "No exact match found. Showing the closest products."
    : "Recommended for Your Workspace";
  const description = matchResult.isFallback
    ? "These products are the nearest fit based on budget, shipping timeline, minimum order, and overall relevance."
    : `${matchResult.items.length} product(s) matched your workspace preferences.`;

  productsMatchState.hidden = false;
  productsMatchState.innerHTML = `
    <div class="results-state-card reveal">
      <div>
        <p class="eyebrow">Recommended for Your Workspace</p>
        <h2>${escapeHtml(title)}</h2>
      </div>
      <p>${escapeHtml(description)}</p>
      <div class="products-match-state-actions">
        <button class="btn btn-outline" id="products-match-state-reset" type="button">Reset Filters</button>
      </div>
    </div>
  `;

  registerRevealItems(productsMatchState.querySelectorAll(".reveal"));

  productsMatchState.querySelector("#products-match-state-reset")?.addEventListener("click", () => {
    resetProductsFilters();
  });
};

const getCriteriaFromUrl = () => {
  if (!window.MatchEngine) {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const fields = ["productType", "minPrice", "maxPrice", "maxShippingTime", "maxMoq", "targetRegion", "notes"];
  const hasAnyFilter = fields.some((field) => params.get(field));

  if (!hasAnyFilter) {
    return null;
  }

  return window.MatchEngine.buildCriteria({
    productType: params.get("productType") || "",
    minPrice: params.get("minPrice") || "",
    maxPrice: params.get("maxPrice") || "",
    maxShippingTime: params.get("maxShippingTime") || "",
    maxMoq: params.get("maxMoq") || "",
    targetRegion: params.get("targetRegion") || "",
    notes: params.get("notes") || "",
  });
};

const applyProductsFilters = async (criteria) => {
  if (!window.MatchEngine || !criteria) {
    return;
  }

  const matchResult = window.MatchEngine.getRecommendations(criteria, allProducts, aiMatchConfig);
  renderMatchState(matchResult);
  renderProducts(matchResult.items);

  if (window.NorthstarStore) {
    await window.NorthstarStore.recordAIMatchUsage(matchResult.criteria, matchResult.items);
  }
};

const initPage = async () => {
  const store = window.NorthstarStore;

  if (!store) {
    return;
  }

  await store.ready;
  await store.trackVisit();
  const [products, nextAiMatchConfig] = await Promise.all([store.getProducts(), store.getAIMatchConfig()]);
  allProducts = Array.isArray(products) ? products : [];
  aiMatchConfig = nextAiMatchConfig;
  renderProducts(allProducts);

  const criteria = getCriteriaFromUrl();

  if (criteria) {
    window.sessionStorage.setItem(window.MatchEngine.storageKey, JSON.stringify(criteria));
    await applyProductsFilters(criteria);
  }
};

setupNavigation();
setupRevealAnimations();
syncNavbarState();
window.addEventListener("scroll", syncNavbarState, { passive: true });
initPage();
