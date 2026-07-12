document.body.classList.add("has-js");

const navbar = document.querySelector(".navbar");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const menuItems = document.querySelectorAll(".nav-links a");
const summaryRoot = document.querySelector("#results-summary");
const resultsRoot = document.querySelector("#results-grid");
const stateRoot = document.querySelector("#results-state");
const insightsRoot = document.querySelector("#results-insights");
const routes = window.ApexLinkRoutes || {
  aiMatch: "/products?aiMatch=open",
  detail: (id) => `/detail?id=${encodeURIComponent(id)}`,
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

const renderSummary = (summary) => {
  if (!summaryRoot) {
    return;
  }

  const items = [
    { label: "Product", value: summary.product },
    { label: "Budget", value: summary.budget },
    { label: "Delivery Window", value: summary.shippingTime },
    { label: "Workspace Setup", value: summary.destination },
  ];

  summaryRoot.innerHTML = items
    .map(
      (item) => `
        <article class="results-summary-card">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </article>
      `
    )
    .join("");
};

const renderState = (matchResult) => {
  if (!stateRoot) {
    return;
  }

  stateRoot.innerHTML = `
    <div class="results-state-card reveal">
      <div>
        <p class="eyebrow">${matchResult.isFallback ? "Closest Matches" : "Ranked Results"}</p>
        <h2>${
          matchResult.isFallback
            ? "No exact match found. Here are the closest products."
            : `${matchResult.items.length} product(s) matched your selection`
        }</h2>
      </div>
      <p>
        ${
          matchResult.isFallback
            ? "These products are the nearest fit based on budget, minimum order, delivery timing and overall relevance."
            : "Products are sorted from highest to lowest match score so you can compare the strongest options first."
        }
      </p>
    </div>
  `;
};

const renderResults = (items) => {
  if (!resultsRoot) {
    return;
  }

  if (!items.length) {
    resultsRoot.innerHTML = `
      <article class="results-card results-empty-card reveal">
        <h3>No products found</h3>
        <p>Please return to the Products page AI Match panel and try a different combination of filters.</p>
        <a class="btn btn-primary" href="${routes.aiMatch}">Back to Products AI Match</a>
      </article>
    `;
    return;
  }

  resultsRoot.innerHTML = items
    .map(
      (item) => `
        <article class="results-card reveal">
          <div class="results-card-media">
            <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
          </div>

          <div class="results-card-head">
            <div>
              <h3>${escapeHtml(item.name)}</h3>
              <strong class="product-price">${escapeHtml(item.price)}</strong>
            </div>
            <span class="match-score">${item.score}%</span>
          </div>

          <ul class="results-reasons">
            ${item.reasons.map((reason) => `<li><span>&#10003;</span>${escapeHtml(reason)}</li>`).join("")}
          </ul>

          <a class="btn btn-outline product-link" href="${routes.detail(item.id)}">View Details</a>
        </article>
      `
    )
    .join("");
};

const renderInsights = (insights) => {
  if (!insightsRoot) {
    return;
  }

  insightsRoot.innerHTML = insights
    .map(
      (line) => `
        <article class="results-insight-card reveal">
          <p>${escapeHtml(line)}</p>
        </article>
      `
    )
    .join("");
};

const renderEmptyState = () => {
  if (summaryRoot) {
    summaryRoot.innerHTML = `
      <article class="results-summary-card">
        <span>Status</span>
        <strong>No saved AI Match session</strong>
      </article>
    `;
  }

  if (stateRoot) {
    stateRoot.innerHTML = `
      <div class="results-state-card reveal">
        <div>
          <p class="eyebrow">Start Exploring</p>
          <h2>Your AI Match session is empty</h2>
        </div>
        <p>Open the Products page AI Match panel, fill in your product preferences, and run the recommendations again.</p>
      </div>
    `;
  }

  if (resultsRoot) {
    resultsRoot.innerHTML = `
      <article class="results-card results-empty-card reveal">
        <h3>No recommendation data available</h3>
        <p>The results page needs a saved search from the Products page AI Match panel.</p>
        <a class="btn btn-primary" href="${routes.aiMatch}">Open Products AI Match</a>
      </article>
    `;
  }

  if (insightsRoot) {
    insightsRoot.innerHTML = `
      <article class="results-insight-card reveal">
        <p>After you submit the Products page AI Match form, this area will explain how the recommendation engine ranked your products.</p>
      </article>
    `;
  }
};

const initResultsPage = async () => {
  const store = window.NorthstarStore;

  if (!window.MatchEngine || !store) {
    renderEmptyState();
    return;
  }

  await store.ready;
  await store.trackVisit();
  let parsedCriteria;
  const savedCriteria = window.sessionStorage.getItem(window.MatchEngine.storageKey);

  if (savedCriteria) {
    try {
      parsedCriteria = JSON.parse(savedCriteria);
    } catch (error) {
      parsedCriteria = null;
    }
  }

  if (!parsedCriteria) {
    const params = new URLSearchParams(window.location.search);
    parsedCriteria = window.MatchEngine.buildCriteria({
      productType: params.get("productType") || "",
      minPrice: params.get("minPrice") || "",
      maxPrice: params.get("maxPrice") || "",
      maxShippingTime: params.get("maxShippingTime") || "",
      maxMoq: params.get("maxMoq") || "",
      targetRegion: params.get("targetRegion") || "",
      notes: params.get("notes") || "",
    });
  }

  if (!parsedCriteria) {
    renderEmptyState();
    return;
  }

  const [products, aiMatchConfig] = await Promise.all([store.getProducts(), store.getAIMatchConfig()]);
  const matchResult = window.MatchEngine.getRecommendations(parsedCriteria, products, aiMatchConfig);

  await store.recordAIMatchUsage(matchResult.criteria, matchResult.items);

  renderSummary(matchResult.summary);
  renderState(matchResult);
  renderResults(matchResult.items);
  renderInsights(matchResult.insights);
};

setupNavigation();
setupRevealAnimations();
syncNavbarState();
window.addEventListener("scroll", syncNavbarState, { passive: true });
initResultsPage();
