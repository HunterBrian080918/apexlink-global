document.body.classList.add("has-js");

const navbar = document.querySelector(".navbar");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const menuItems = document.querySelectorAll(".nav-links a");
const contactForm = document.querySelector(".contact-form");
const formStatus = document.querySelector(".contact-form .form-status");
const copyEmailButton = document.querySelector("#contact-copy-email");
const emailLink = document.querySelector("#contact-email-link");
const whatsappLink = document.querySelector("#contact-whatsapp-link");
const emailStatus = document.querySelector("#contact-email-status");
const contactEmailNodes = document.querySelectorAll("[data-contact-email]");

const CONTACT_DRAFT_KEY = "apexlink-contact-draft-v1";
const DEFAULT_BUSINESS_EMAIL = "ApexLink080918@outlook.com";

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

const isValidBusinessEmail = (value) => {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/example\.com$/i.test(email);
};

const getBusinessContact = async () => {
  const config =
    (await window.NorthstarSiteConfig?.getConfig?.().catch(() => null)) ||
    (await window.NorthstarStore?.getSiteConfig?.().catch(() => null)) ||
    null;
  const contact = config?.website?.contact || {};
  const social = config?.website?.social || {};
  const email = String(contact.email || "").trim();
  const whatsapp = String(social.whatsapp || "").trim();

  if (!isValidBusinessEmail(email)) {
    throw new Error("A valid public business email is not configured for the Contact page.");
  }

  return {
    email,
    whatsapp,
  };
};

const setStatus = (node, message, state = "info") => {
  if (!node) {
    return;
  }

  node.textContent = message;
  node.dataset.state = state;
};

const normalizeWhatsappHref = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const digits = raw.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : "";
};

const updateContactActions = ({ email, whatsapp }) => {
  const mailtoHref = `mailto:${email}`;

  contactEmailNodes.forEach((node) => {
    node.textContent = email;
    if (node.tagName === "A") {
      node.setAttribute("href", mailtoHref);
    }
  });

  if (emailLink) {
    emailLink.setAttribute("href", mailtoHref);
  }

  if (copyEmailButton) {
    copyEmailButton.disabled = false;
  }

  if (!whatsappLink) {
    return;
  }

  const whatsappHref = normalizeWhatsappHref(whatsapp);
  if (whatsappHref) {
    whatsappLink.classList.remove("is-hidden");
    whatsappLink.setAttribute("href", whatsappHref);
  } else {
    whatsappLink.classList.add("is-hidden");
    whatsappLink.setAttribute("href", "#");
  }
};

const readDraft = () => {
  try {
    const raw = localStorage.getItem(CONTACT_DRAFT_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
};

const saveDraft = () => {
  if (!contactForm) {
    return;
  }

  const formData = new FormData(contactForm);
  const draft = {
    name: String(formData.get("name") || ""),
    email: String(formData.get("email") || ""),
    subject: String(formData.get("subject") || ""),
    company: String(formData.get("company") || ""),
    phone: String(formData.get("phone") || ""),
    country: String(formData.get("country") || ""),
    message: String(formData.get("message") || ""),
  };

  localStorage.setItem(CONTACT_DRAFT_KEY, JSON.stringify(draft));
};

const applyDraft = () => {
  if (!contactForm) {
    return;
  }

  const draft = readDraft();
  Object.entries(draft).forEach(([key, value]) => {
    const field = contactForm.elements.namedItem(key);
    if (field && "value" in field) {
      field.value = String(value || "");
    }
  });
};

const buildMailtoHref = (businessEmail, fields) => {
  const subject = `Website Inquiry - ${fields.subject}`;
  const body = [
    `Name: ${fields.name}`,
    `Email: ${fields.email}`,
    `Company: ${fields.company || ""}`,
    `Phone: ${fields.phone || ""}`,
    `Country: ${fields.country || ""}`,
    "",
    "Message:",
    fields.message,
  ].join("\n");

  return `mailto:${businessEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

const setupContactForm = async () => {
  if (!contactForm) {
    return;
  }

  applyDraft();
  contactForm.addEventListener("input", () => {
    saveDraft();
    setStatus(formStatus, "Draft saved locally.", "info");
  });

  let businessContact;
  try {
    businessContact = await getBusinessContact();
    updateContactActions(businessContact);
  } catch (error) {
    setStatus(formStatus, error.message, "error");
    if (contactForm.querySelector('button[type="submit"]')) {
      contactForm.querySelector('button[type="submit"]').disabled = true;
    }
    if (copyEmailButton) {
      copyEmailButton.disabled = true;
    }
    return;
  }

  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!contactForm.reportValidity()) {
      setStatus(formStatus, "Please complete all required fields.", "error");
      return;
    }

    const formData = new FormData(contactForm);
    const fields = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      subject: String(formData.get("subject") || "").trim(),
      company: String(formData.get("company") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      country: String(formData.get("country") || "").trim(),
      message: String(formData.get("message") || "").trim(),
    };

    if (!fields.name || !fields.email || !fields.subject || !fields.message) {
      setStatus(formStatus, "Please complete all required fields.", "error");
      return;
    }

    const mailtoHref = buildMailtoHref(businessContact.email, fields);

    if (emailLink) {
      emailLink.setAttribute("href", mailtoHref);
    }

    window.location.href = mailtoHref;
    saveDraft();
    setStatus(
      formStatus,
      "Your email application has been opened. Please send the prepared email to complete your inquiry.",
      "success"
    );
  });
};

const setupContactActions = async () => {
  let businessContact;
  try {
    businessContact = await getBusinessContact();
    updateContactActions(businessContact);
  } catch (error) {
    setStatus(emailStatus, error.message, "error");
    return;
  }

  copyEmailButton?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(businessContact.email);
      setStatus(emailStatus, "Business email copied.", "success");
    } catch (error) {
      setStatus(emailStatus, `Copy failed. Please use: ${businessContact.email}`, "error");
    }
  });
};

const initPage = async () => {
  if (!window.NorthstarStore) {
    return;
  }

  await window.NorthstarStore.ready;
  await window.NorthstarStore.trackVisit();
};

setupNavigation();
setupRevealAnimations();
syncNavbarState();
window.addEventListener("scroll", syncNavbarState, { passive: true });
void setupContactActions();
void setupContactForm();
void initPage();
