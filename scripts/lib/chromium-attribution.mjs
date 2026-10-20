// Diagnostic metadata only. Never filter processes or replace native private bytes.
import assert from "node:assert/strict";
import { createRealmSampler } from "./cdp-realm-memory.mjs";

function creationMicroseconds(value) {
  const match = typeof value === "string" && /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?Z$/.exec(value);
  if (!match) return null;
  const seconds = Date.parse(match[1] + "Z");
  return Number.isFinite(seconds) ? BigInt(seconds) * 1000n + BigInt((match[2] ?? "").padEnd(6, "0").slice(0, 6)) : null;
}

export function annotateNativeProcessTypes(samples, references, rootPid) {
  assert.ok(samples.length <= 3000 && references.length <= 8);
  const metadata = new Map();
  for (const reference of references) for (const entry of reference.tree?.processes ?? []) {
    const birth = creationMicroseconds(entry.createdAt);
    if (birth === null) continue;
    // CIM CreationDate has microsecond precision; native FILETIME has100ns.
    // Match the same PID, parent and birth truncated to that shared precision.
    const key = `${entry.pid}:${entry.parentPid}:${birth}`;
    if (!metadata.has(key)) assert.ok(metadata.size < 128);
    metadata.set(key, entry);
  }
  for (const sample of samples) for (const entry of sample.processes ?? []) {
    if (entry.pid === rootPid) continue;
    const birth = creationMicroseconds(entry.createdAt);
    const detail = birth === null ? null : metadata.get(`${entry.pid}:${entry.parentPid}:${birth}`);
    // The older CIM sampler uses browser as fallback for missing command line.
    // Never propagate that fallback to a non-root process or guess from size.
    if (!detail || !["renderer", "gpu-process", "utility", "zygote"].includes(detail.type)) continue;
    entry.type = detail.type; entry.utilitySubtype = detail.utilitySubtype ?? null;
    entry.sandboxType = detail.sandboxType ?? null;
  }
  return samples;
}

/** Playwright's browser websocket is not a CDP websocket. Route non-flattened
 * target messages through its genuine browser CDP session to reuse the existing
 * bounded all-realm sampler. No Runtime.evaluate, GC or content inspection.
 */
export async function connectPlaywrightRealmSampler(browser, origin, timeoutMs = 1000) {
  const session = await browser.newBrowserCDPSession(), pending = new Map();
  let sequence = 0, closed = false;
  const fail = error => { for (const entry of pending.values()) entry.reject(error); pending.clear(); };
  const receive = ({ sessionId, message }) => {
    if (typeof message !== "string" || message.length > 1024 * 1024) { fail(new Error("Realm CDP response cap")); return; }
    let response;
    try { response = JSON.parse(message); } catch { fail(new Error("Invalid realm CDP response")); return; }
    const key = `${sessionId}:${response.id}`, entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);
    if (response.error) entry.reject(new Error(String(response.error.message).slice(0, 512)));
    else entry.resolve(response.result);
  };
  session.on("Target.receivedMessageFromTarget", receive);
  const detached = ({ sessionId }) => {
    for (const [key, entry] of pending) if (key.startsWith(sessionId + ":")) {
      pending.delete(key); entry.reject(new Error("Realm target detached"));
    }
  };
  session.on("Target.detachedFromTarget", detached);
  return createRealmSampler({
    send(method, params = {}, sessionId) {
      if (closed || pending.size >= 64) return Promise.reject(new Error("Realm CDP request unavailable/cap reached"));
      if (!sessionId) return session.send(method, method === "Target.attachToTarget" ? { ...params, flatten: false } : params);
      const id = ++sequence, key = `${sessionId}:${id}`;
      return new Promise((resolve, reject) => {
        pending.set(key, { resolve, reject });
        session.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method, params }) })
          .catch(error => { pending.delete(key); reject(error); });
      });
    },
    close() {
      if (closed) return;
      closed = true; fail(new Error("Realm CDP session closed"));
      session.off("Target.receivedMessageFromTarget", receive); session.off("Target.detachedFromTarget", detached);
      void session.detach().catch(() => {});
    },
  }, origin, timeoutMs);
}
