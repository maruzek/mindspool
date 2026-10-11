import { defineConfig } from "cf/config";

/**
 * Secret-like files were detected but not read or migrated: .env.example, .env.local, .env.production, .env.production.example. Only `secrets.required` entries are migrated.
 * @see https://developers.cloudflare.com/workers/configuration/secrets/
 */

export default defineConfig({
  worker: {
    name: "mindspool-web",
    compatibilityDate: "2026-10-01",
    assets: {
      notFoundHandling: "single-page-application",
    },
    domains: ["mindspool.martinruzek.eu"],
  },
});
