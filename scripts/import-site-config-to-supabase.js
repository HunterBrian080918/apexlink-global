require("dotenv").config();

const { seedDefaultSiteConfig } = require("../services/supabase-cms");

const shouldOverwrite = process.argv.includes("--force");

(async () => {
  try {
    const result = await seedDefaultSiteConfig({
      overwrite: shouldOverwrite,
    });

    const summary = {
      skipped: Boolean(result?.skipped),
      overwrite: shouldOverwrite,
      brandName: result?.config?.website?.brand?.name || "",
      contactEmail: result?.config?.website?.contact?.email || "",
      homepageTitle: result?.config?.homepage?.title || "",
      paymentMethods: Array.isArray(result?.config?.settings?.paymentMethods)
        ? result.config.settings.paymentMethods
        : [],
    };

    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error("[cms-import] failed:", error);
    process.exitCode = 1;
  }
})();
