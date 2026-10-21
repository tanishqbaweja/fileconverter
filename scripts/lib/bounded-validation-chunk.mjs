// Independent-validator transport only. Never encode a whole output, keep a
// chunk collection, or route file data through an HTTP server. A numeric JSON
// array creates one JS value per byte; one bounded string avoids that expansion.
export const VALIDATION_CHUNK_LIMITS = Object.freeze({ decodedBytes: 65536, encodedCharacters: 87384, stringPieceBytes: 8192 });

// Self-contained so an owned headless test may install exactly this function
// through addInitScript. No module state, server, native helper or conversion.
export function encodeBoundedValidationChunk(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > 65536)
    throw new TypeError("Validation transport requires one nonempty chunk of at most64KiB");
  const pieces = [];
  for (let at = 0; at < bytes.length; at += 8192)
    pieces.push(String.fromCharCode(...bytes.subarray(at, at + 8192)));
  return btoa(pieces.join(""));
}

export function decodeBoundedValidationChunk(value) {
  if (typeof value !== "string" || value.length < 4 || value.length > 87384 || value.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw new TypeError("Validation chunk is not bounded canonical base64");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 1 || bytes.length > 65536 || bytes.toString("base64") !== value)
    throw new TypeError("Validation chunk is not bounded canonical base64");
  return bytes;
}
