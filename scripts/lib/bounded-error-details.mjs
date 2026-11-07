// Preserve actionable owned-helper failures, including AggregateError causes,
// without unbounded exception graphs, stacks, command arguments or binary data.
export function boundedErrorDetails(error) {
  const rows = [], queue = [error], seen = new Set();
  while (queue.length && rows.length < 8) {
    const value = queue.shift();
    if (value && (typeof value === "object" || typeof value === "function")) {
      if (seen.has(value)) continue;
      seen.add(value);
    }
    let isError = false; try { isError = value instanceof Error; } catch { /* refuse opaque proxy */ }
    const property = key => { try { return isError ? value[key] : undefined; } catch { return undefined; } };
    const errorName = property("name"), errorMessage = property("message"), errorCode = property("code");
    const name = typeof errorName === "string" ? errorName.slice(0, 128) : "Error";
    const message = typeof errorMessage === "string" ? errorMessage.slice(0, 2048) :
      typeof value === "string" ? value.slice(0, 2048) : "Non-Error thrown value; payload not serialized";
    const code = typeof errorCode === "number" && Number.isFinite(errorCode) ? errorCode : typeof errorCode === "string" ? errorCode.slice(0, 128) : null;
    rows.push({ name, message, code });
    // Inspect only standard Error links. Never enumerate arbitrary properties,
    // stdout/stderr, request bodies, buffers or a thrown user's file object.
    const children = property("errors");
    if (Array.isArray(children)) for (let n = 0; n < children.length && queue.length + rows.length < 8; n++) {
      try { queue.push(children[n]); } catch { /* do not invoke another inspector */ }
    }
    const cause = property("cause");
    if (cause !== undefined && queue.length + rows.length < 8) queue.push(cause);
  }
  return rows;
}
