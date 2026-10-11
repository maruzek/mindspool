#!/usr/bin/env node
// Fails when a built directory contains development values.
// Usage: node scripts/check-bundle.mjs <dir> [extra-forbidden-string ...]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const [dir, ...extra] = process.argv.slice(2);
if (!dir) {
  console.error("usage: check-bundle.mjs <dir> [forbidden ...]");
  process.exit(2);
}
// Libraries ship the bare strings "pk_test_" and "http://localhost", so match
// real key values and localhost URLs with a port instead.
const patterns = [
  { label: "pk_test_ key", test: (c) => /pk_test_[A-Za-z0-9+/=]{16,}/.test(c) },
  {
    label: "localhost/127.0.0.1 URL with port",
    test: (c) => /(localhost|127\.0\.0\.1):\d{2,5}/.test(c),
  },
  ...extra.map((needle) => ({
    label: needle,
    test: (c) => c.includes(needle),
  })),
];
const textFile = /\.(js|mjs|cjs|html|json|css|map|txt)$/;

function* walk(path) {
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (textFile.test(name)) yield full;
  }
}

let failed = false;
for (const file of walk(dir)) {
  const content = readFileSync(file, "utf8");
  for (const { label, test } of patterns) {
    if (test(content)) {
      console.error(`FAIL ${file} contains ${label}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log(
  `OK ${dir} contains none of: ${patterns.map((p) => p.label).join(", ")}`,
);
