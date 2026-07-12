require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { upsertAdminAuthByEmail } = require("../services/supabase-admin-auth");

const root = path.resolve(__dirname, "..");
const legacyAuthFile = path.join(root, "data", "admin-auth.json");

const readLegacyAdminAuth = () => {
  if (!fs.existsSync(legacyAuthFile)) {
    throw new Error(`Legacy admin auth file was not found at ${legacyAuthFile}.`);
  }

  const parsed = JSON.parse(fs.readFileSync(legacyAuthFile, "utf8"));
  const email = String(parsed?.email || "").trim().toLowerCase();
  const passwordHash = String(parsed?.passwordHash || "").trim();
  const passwordSalt = String(parsed?.passwordSalt || "").trim();
  const sessionVersion = Math.max(1, Number.parseInt(parsed?.sessionVersion || 1, 10) || 1);

  if (!email || !passwordHash || !passwordSalt) {
    throw new Error("Legacy admin auth file is missing required fields.");
  }

  return {
    email,
    passwordHash,
    passwordSalt,
    sessionVersion,
    isActive: true,
  };
};

const main = async () => {
  const legacyRecord = readLegacyAdminAuth();
  const result = await upsertAdminAuthByEmail(legacyRecord);

  if (!result?.id) {
    throw new Error("Supabase did not return the migrated admin auth account.");
  }

  console.log(`Migrated admin auth account for ${result.email}.`);
  console.log("Legacy file was left unchanged as a backup.");
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
