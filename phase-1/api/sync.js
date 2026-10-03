// GET  /api/sync  → the stored doc
// POST /api/sync  → merge the posted doc into the stored one, save, return the result
// Both need the `x-sync-key` header to match the SYNC_PASSPHRASE env var.

import { timingSafeEqual, createHash } from "node:crypto";
import { blankDoc, mergeDocs, normaliseDoc } from "../merge.js";

const KEY = "phase1:doc";
const MAX_BYTES = 1_000_000;

// The Vercel Marketplace Upstash integration injects <PREFIX>_REST_API_* (prefix "KV" or "STORAGE" by default);
// a direct Upstash setup uses UPSTASH_REDIS_REST_*.
const env = process.env;
const REDIS_URL = env.KV_REST_API_URL || env.STORAGE_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = env.KV_REST_API_TOKEN || env.STORAGE_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Redis ${command[0]} failed: ${body.error || res.status}`);
  return body.result;
}

// Hash both sides so lengths match, then compare in constant time.
function keyMatches(given) {
  const want = process.env.SYNC_PASSPHRASE;
  if (!want || typeof given !== "string") return false;
  const h = s => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(given), h(want));
}

async function readDoc() {
  const raw = await redis(["GET", KEY]);
  return raw ? normaliseDoc(JSON.parse(raw)) : blankDoc();
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!REDIS_URL || !REDIS_TOKEN || !process.env.SYNC_PASSPHRASE) {
    return res.status(503).json({ error: "Sync isn't configured on the server yet." });
  }
  if (!keyMatches(req.headers["x-sync-key"])) {
    return res.status(401).json({ error: "Wrong passphrase." });
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json(await readDoc());
    }
    if (req.method === "POST") {
      const incoming = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const merged = mergeDocs(await readDoc(), incoming);
      const json = JSON.stringify(merged);
      if (json.length > MAX_BYTES) return res.status(413).json({ error: "Log is too large to sync." });
      await redis(["SET", KEY, json]);
      return res.status(200).json(merged);
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Sync failed on the server." });
  }
}
