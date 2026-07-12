document.body.classList.add("has-js");

const navbar = document.querySelector(".navbar");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const menuItems = document.querySelectorAll(".nav-links a");
const routes = window.ApexLinkRoutes || {
  products: "/products",
};
const HOMEPAGE_COPY = {
  eyebrow: "PREMIUM WORKSPACE SOLUTIONS",
  title: "Reimagine\nYour Workspace.",
  subtitle:
    "Thoughtfully designed workspace products for a more organized, comfortable and productive way to work.",
  ctaLabel: "Explore Products",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const setMultilineText = (node, value) => {
  if (!node) {
    return;
  }

  node.innerHTML = escapeHtml(value).replace(/\r?\n/g, "<br>");
};

const syncNavbarState = () => {
  if (!navbar) {
    return;
  }

  navbar.classList.toggle("is-scrolled", window.scrollY > 18);
};

const renderHomepageContent = (heroBackgroundImage) => {
  const heroEyebrow = document.querySelector("#hero-eyebrow");
  const heroTitle = document.querySelector("#hero-title");
  const heroSubtitle = document.querySelector("#hero-subtitle");
  const heroPrimaryCta = document.querySelector("#hero-primary-cta");
  const heroSlideMain = document.querySelector(".hero-slide-main");

  if (heroEyebrow) {
    heroEyebrow.textContent = HOMEPAGE_COPY.eyebrow;
  }

  if (heroTitle) {
    setMultilineText(heroTitle, HOMEPAGE_COPY.title);
  }

  if (heroSubtitle) {
    heroSubtitle.textContent = HOMEPAGE_COPY.subtitle;
  }

  if (heroPrimaryCta) {
    heroPrimaryCta.textContent = HOMEPAGE_COPY.ctaLabel;
    heroPrimaryCta.setAttribute("href", routes.products);
  }

  if (heroSlideMain && heroBackgroundImage) {
    heroSlideMain.style.backgroundImage = `url("${heroBackgroundImage}")`;
  }
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

const initPage = async () => {
  const store = window.NorthstarStore;

  if (!store) {
    return;
  }

  await store.ready;
  await store.trackVisit();
  const homepagePromise = typeof store.getHomepage === "function" ? store.getHomepage() : Promise.resolve(null);
  const websitePromise =
    typeof store.getWebsiteSettings === "function" ? store.getWebsiteSettings() : Promise.resolve(null);
  const [homepage, website] = await Promise.all([homepagePromise, websitePromise]);

  renderHomepageContent(website?.hero?.backgroundImage || homepage?.heroBackgroundImage || "");
};

setupNavigation();
syncNavbarState();
window.addEventListener("scroll", syncNavbarState, { passive: true });
initPage();
