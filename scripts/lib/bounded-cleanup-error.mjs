// Preserve nested cleanup causes locally without retaining unbounded diagnostics.
export const CLEANUP_ERROR_LIMITS = Object.freeze({ nodes: 32, depth: 6,
  fieldCharacters: 1024, textBytes: 8192, serializedBytes: 32768 });

export function describeOwnedCleanupError(error) {
  const seen = new WeakSet();
  let nodes = 0, remaining = CLEANUP_ERROR_LIMITS.textBytes, truncated = false;
  const text = value => {
    if (!["string", "number", "boolean", "bigint"].includes(typeof value)) return undefined;
    const original = String(value);
    let result = original.slice(0, CLEANUP_ERROR_LIMITS.fieldCharacters);
    while (Buffer.byteLength(JSON.stringify(result)) > remaining && result.length) result = result.slice(0, Math.floor(result.length / 2));
    remaining = Math.max(0, remaining - Buffer.byteLength(JSON.stringify(result)));
    if (result.length !== original.length) truncated = true;
    return result;
  };
  const visit = (value, depth) => {
    if (nodes >= CLEANUP_ERROR_LIMITS.nodes || depth > CLEANUP_ERROR_LIMITS.depth) {
      truncated = true; return { truncated: true };
    }
    nodes++;
    if (value === null || (typeof value !== "object" && typeof value !== "function"))
      return { thrownType: value === null ? "null" : typeof value, message: text(value) };
    if (seen.has(value)) return { circularOrRepeatedReference: true };
    seen.add(value);
    const read = key => { try { return value[key]; } catch { truncated = true; return undefined; } };
    const result = {};
    for (const key of ["name", "message", "stack", "code", "signal", "errno", "syscall", "stdout", "stderr"]) {
      const field = read(key);
      if (field !== undefined) result[key] = text(field);
    }
    const cause = read("cause"), errors = read("errors");
    if (cause !== undefined) result.cause = visit(cause, depth + 1);
    let errorsAreArray = false;
    try { errorsAreArray = Array.isArray(errors); } catch { truncated = true; }
    if (errorsAreArray) {
      let length = 0;
      try { length = errors.length; } catch { truncated = true; }
      const count = Math.min(length, CLEANUP_ERROR_LIMITS.nodes - nodes);
      result.errors = [];
      for (let i = 0; i < count; i++) {
        try { result.errors.push(visit(errors[i], depth + 1)); }
        catch { result.errors.push({ unavailable: true }); truncated = true; }
      }
      if (count !== length) { result.errorsTruncated = true; truncated = true; }
    }
    return result;
  };
  const details = visit(error, 0);
  const result = { details, truncated, limits: CLEANUP_ERROR_LIMITS };
  // The total text budget counts JSON escaping; static structure is node-limited.
  if (Buffer.byteLength(JSON.stringify(result)) > CLEANUP_ERROR_LIMITS.serializedBytes)
    return { details: { name: "CleanupErrorDetailsTruncated", message: text("Diagnostic size cap reached") },
      truncated: true, limits: CLEANUP_ERROR_LIMITS };
  return result;
}
