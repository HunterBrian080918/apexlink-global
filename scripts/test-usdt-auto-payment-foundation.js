const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
const migration = read("supabase", "migrations", "20260817000300_usdt_auto_payment_foundation.sql");
const cryptoService = read("services", "crypto-payments.js");
const payments = read("services", "supabase-payments.js");
const server = read("server.js");
const paymentPage = read("public", "payment.js");
const admin = read("public", "admin", "admin.js");

[
  "crypto_asset",
  "crypto_network",
  "crypto_wallet_address",
  "crypto_expected_amount",
  "crypto_received_amount",
  "crypto_tx_hash",
  "crypto_confirmations",
  "crypto_detected_at",
  "crypto_status",
].forEach((field) => assert.match(migration, new RegExp(`add column if not exists ${field}`, "i")));

assert.match(migration, /crypto_status is null[\s\S]*'waiting'[\s\S]*'detected'[\s\S]*'confirming'[\s\S]*'confirmed'[\s\S]*'failed'/i);
assert.match(migration, /pending_crypto_detection/i);
assert.match(migration, /create unique index if not exists payments_crypto_tx_hash_key[\s\S]*crypto_tx_hash/i);
assert.match(migration, /create index if not exists payments_crypto_wallet_status_idx[\s\S]*crypto_wallet_address, crypto_status/i);
assert.match(migration, /create or replace function public\.record_crypto_transaction/i);
assert.match(migration, /security definer/i);
assert.match(migration, /grant execute on function public\.record_crypto_transaction[\s\S]*service_role/i);
assert.match(migration, /revoke all on function public\.record_crypto_transaction[\s\S]*from anon/i);
assert.match(migration, /revoke all on function public\.record_crypto_transaction[\s\S]*from authenticated/i);

const recordFunction = migration.match(
  /create or replace function public\.record_crypto_transaction[\s\S]*?\$\$;\s*\n\s*create or replace function public\.review_crypto_payment/i
)?.[0] || "";
assert.ok(recordFunction);
assert.doesNotMatch(recordFunction, /update public\.orders/i);
assert.doesNotMatch(recordFunction, /insert into public\.order_events/i);

assert.match(cryptoService, /const createCryptoPaymentRecord = async/i);
assert.match(cryptoService, /const updateCryptoDetection = async/i);
assert.match(cryptoService, /const confirmCryptoPayment = async/i);
assert.match(cryptoService, /record_crypto_transaction/i);
assert.match(cryptoService, /CRYPTO_MONITOR_ENABLED/i);
assert.match(cryptoService, /monitoringEnabled,/i);
assert.doesNotMatch(cryptoService, /api\.trongrid|tronscan|setInterval|setTimeout/i);

assert.match(payments, /cryptoExpectedAmount:/i);
assert.match(payments, /cryptoReceivedAmount:/i);
assert.match(payments, /cryptoTxHash:/i);
assert.match(payments, /cryptoConfirmations:/i);
assert.match(payments, /cryptoDetectedAt:/i);
assert.match(payments, /cryptoStatus:/i);
assert.doesNotMatch(payments, /crypto_amount/i);
assert.match(server, /cryptoTxHash:\s*txHash/i);
assert.doesNotMatch(server, /transactionId:\s*txHash/i);
assert.match(paymentPage, /activePayment\?\.cryptoTxHash/i);
assert.match(admin, /payment\.cryptoTxHash/i);

assert.match(server, /ensureRetailPayPalPayment/i);
assert.match(server, /ensureRetailBankTransferPayment/i);
assert.match(paymentPage, /\/api\/paypal\/create-order/i);
assert.match(paymentPage, /\/bank-transfer-proof/i);

console.log("USDT automatic payment foundation offline tests passed.");
