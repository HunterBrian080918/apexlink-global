const nodemailer = require("nodemailer");

const targetEmail = String(process.env.ADMIN_NOTIFICATION_EMAIL || "avelixlink@outlook.com").trim();
const smtpHost = String(process.env.SMTP_HOST || "").trim();
const smtpPort = Number(process.env.SMTP_PORT || 0);
const smtpSecure = String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true";
const smtpUser = String(process.env.SMTP_USER || "").trim();
const smtpPassword = String(process.env.SMTP_PASSWORD || "").trim();
const smtpFrom = String(process.env.SMTP_FROM || "").trim();
const adminUrl = String(process.env.ADMIN_URL || "http://localhost:8000/admin").trim();
let hasWarnedAboutMissingSmtp = false;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const subjects = {
  contact: "New Contact Inquiry",
  wholesale: "New Wholesale Inquiry",
  retail: "New Retail Order",
  support: "New Customer Message",
  reply: "Customer Reply",
  quote: "New Quote Request",
};

const getMissingSmtpVariables = () =>
  [
    !smtpHost ? "SMTP_HOST" : "",
    !smtpPort ? "SMTP_PORT" : "",
    !smtpUser ? "SMTP_USER" : "",
    !smtpPassword ? "SMTP_PASSWORD" : "",
    !smtpFrom ? "SMTP_FROM" : "",
  ].filter(Boolean);

const getTransport = () => {
  if (getMissingSmtpVariables().length) return null;
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPassword },
  });
};

const getEmailConfigurationStatus = () => {
  const missingVariables = getMissingSmtpVariables();
  return {
    configured: missingVariables.length === 0,
    missingVariables,
  };
};

const logEmailConfigurationWarning = () => {
  const status = getEmailConfigurationStatus();
  if (status.configured || hasWarnedAboutMissingSmtp) {
    return status;
  }

  console.warn(
    `[email] SMTP delivery is disabled. Missing environment variables: ${status.missingVariables.join(", ")}`
  );
  hasWarnedAboutMissingSmtp = true;
  return status;
};

const sendAdminSubmissionEmail = async (kind, input = {}) => {
  const transport = getTransport();
  if (!transport) {
    const status = logEmailConfigurationWarning();
    return { sent: false, reason: "not_configured", missingVariables: status.missingVariables };
  }
  const fields = [
    ["Customer Name", input.customerName], ["Email", input.email], ["Country", input.country],
    ["Product", input.product], ["Message", input.message], ["Time", input.time || new Date().toISOString()],
    ["Admin URL", input.adminUrl || adminUrl],
  ];
  const text = fields.map(([label, value]) => `${label}: ${String(value || "-")}`).join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#182230"><h2>${escapeHtml(subjects[kind] || subjects.support)}</h2><table>${fields.map(([label, value]) => `<tr><td style="padding:6px 18px 6px 0;font-weight:700;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0">${escapeHtml(value || "-")}</td></tr>`).join("")}</table></div>`;
  const info = await transport.sendMail({ from: smtpFrom, to: targetEmail, subject: subjects[kind] || subjects.support, text, html });
  console.info(`[email] ${subjects[kind] || subjects.support} sent: ${info.messageId}`);
  return { sent: true, messageId: info.messageId };
};

const verifyEmailTransport = async () => {
  const transport = getTransport();
  if (!transport) {
    const status = getEmailConfigurationStatus();
    return { configured: false, verified: false, missingVariables: status.missingVariables };
  }
  await transport.verify();
  return { configured: true, verified: true };
};

module.exports = {
  sendAdminSubmissionEmail,
  verifyEmailTransport,
  getEmailConfigurationStatus,
  logEmailConfigurationWarning,
};
