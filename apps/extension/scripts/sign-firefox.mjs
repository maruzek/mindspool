#!/usr/bin/env node
// Builds the Firefox target and has Mozilla sign it as an unlisted add-on.
// Credentials come from apps/extension/.env.signing (gitignored) or the
// environment: AMO_JWT_ISSUER and AMO_JWT_SECRET, from
// https://addons.mozilla.org/developers/addon/api/key/
// Usage: pnpm --filter @mindspool/extension sign:firefox
// Output: .output/signed/*.xpi
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

for (const file of [".env.signing"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
const { AMO_JWT_ISSUER: issuer, AMO_JWT_SECRET: secret } = process.env;
if (!issuer || !secret) {
  console.error(
    "Set AMO_JWT_ISSUER and AMO_JWT_SECRET in apps/extension/.env.signing (see .env.signing.example).",
  );
  process.exit(1);
}

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// Production values are read from .env.production, as for the Chrome build.
run("pnpm", ["exec", "wxt", "zip", "-b", "firefox", "--mv3"]);
const { version } = (
  await import("../package.json", { with: { type: "json" } })
).default;
run("pnpm", [
  "exec",
  "web-ext",
  "sign",
  "--source-dir",
  ".output/firefox-mv3",
  "--channel",
  "unlisted",
  "--upload-source-code",
  `.output/mindspoolextension-${version}-sources.zip`,
  "--artifacts-dir",
  ".output/signed",
  "--api-key",
  issuer,
  "--api-secret",
  secret,
]);
