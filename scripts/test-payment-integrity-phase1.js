const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { assertCaptureIntegrity, toMinorUnits } = require("../services/paypal");

const migrationPath = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260817000100_payment_integrity_phase1.sql"
);
const migration = fs.readFileSync(migrationPath, "utf8");
const adminSource = fs.readFileSync(path.join(__dirname, "..", "public", "admin", "admin.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const paymentServiceSource = fs.readFileSync(
  path.join(__dirname, "..", "services", "supabase-payments.js"),
  "utf8"
);

assert.equal(toMinorUnits("19.90"), 1990n);
assert.equal(toMinorUnits(19.9), 1990n);
assert.equal(
  assertCaptureIntegrity({
    capturedAmount: "19.90",
    capturedCurrency: "usd",
    expectedAmount: 19.9,
    expectedCurrency: "USD",
  }),
  true
);

assert.throws(
  () =>
    assertCaptureIntegrity({
      capturedAmount: "19.89",
      capturedCurrency: "USD",
      expectedAmount: "19.90",
      expectedCurrency: "USD",
    }),
  (error) => error.code === "PAYPAL_AMOUNT_MISMATCH" && error.status === 422
);

assert.throws(
  () =>
    assertCaptureIntegrity({
      capturedAmount: "19.90",
      capturedCurrency: "EUR",
      expectedAmount: "19.90",
      expectedCurrency: "USD",
    }),
  (error) => error.code === "PAYPAL_CURRENCY_MISMATCH" && error.status === 422
);

assert.match(migration, /create unique index if not exists payments_order_stage_unique/i);
assert.match(migration, /where payment_type in \('full-payment', 'deposit', 'balance'\)/i);
assert.doesNotMatch(migration, /where payment_type in \([^;]*'refund'/i);
assert.match(migration, /v_payment\.payment_type = 'deposit'[\s\S]*v_order_status := 'deposit_paid'/i);
assert.match(migration, /v_payment\.payment_type in \('balance', 'full-payment'\)[\s\S]*v_order_status := 'balance_paid'/i);
assert.doesNotMatch(adminSource, /orderStatus:\s*["']processing["']/i);
assert.match(serverSource, /capturedAmount:\s*capture\.capturedAmount/i);
assert.match(serverSource, /capturedAmount:\s*resource\?\.amount\?\.value/i);
assert.match(serverSource, /assertPayPalCaptureIntegrity\(\{/i);
assert.match(paymentServiceSource, /isPaymentStageUniqueViolation/i);
assert.match(paymentServiceSource, /idempotent:\s*true/i);
assert.match(migration, /for update/i);
assert.match(migration, /security definer/i);

console.log("Payment integrity Phase 1 offline tests passed.");
