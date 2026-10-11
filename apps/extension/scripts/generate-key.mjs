#!/usr/bin/env node
// Generates the Chrome extension signing key once.
// Writes the PRIVATE key to the path given (keep it outside git, e.g. in a
// password manager) and prints CLERK_EXTENSION_PUBLIC_KEY plus the derived
// extension ID to add to Clerk's allowed origins as chrome-extension://<id>.
// Usage: node scripts/generate-key.mjs <private-key-output.pem>
import { createHash, generateKeyPairSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) {
  console.error("usage: generate-key.mjs <private-key-output.pem>");
  process.exit(2);
}
if (existsSync(out)) {
  console.error(`${out} already exists; refusing to overwrite`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "der" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
writeFileSync(out, privateKey, { mode: 0o600 });

// Chrome derives the ID from the first 128 bits of SHA-256(DER), mapping hex
// digits 0-f to letters a-p.
const id = [
  ...createHash("sha256").update(publicKey).digest("hex").slice(0, 32),
]
  .map((c) => String.fromCharCode("a".charCodeAt(0) + parseInt(c, 16)))
  .join("");

console.log(`CLERK_EXTENSION_PUBLIC_KEY=${publicKey.toString("base64")}`);
console.log(`Extension ID: ${id}`);
console.log(`Clerk allowed origin: chrome-extension://${id}`);
