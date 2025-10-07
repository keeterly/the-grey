/**
 * Write a minimal stamp.json with branch, short sha, and timestamp.
 * Usage (from repo root): node scripts/write-stamp.mjs
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function sh(cmd) {
  try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
}

const branch = sh("git rev-parse --abbrev-ref HEAD") || process.env.GITHUB_REF_NAME || "";
const fullSha = sh("git rev-parse HEAD") || process.env.GITHUB_SHA || "";
const shortSha = fullSha ? fullSha.slice(0,7) : "";
const when = new Date().toISOString();

const stamp = { branch, commit: shortSha, when };
writeFileSync("stamp.json", JSON.stringify(stamp, null, 2));
console.log("Wrote stamp.json:", stamp);
