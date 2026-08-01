const TAR_BLOCK_BYTES = 512;
const MAX_TAR_ENTRIES = 10_000;
const MAX_TAR_PAYLOAD_BYTES = 64 * 1024 * 1024 * 1024;

export class TarStreamValidator {
  private readonly block = new Uint8Array(TAR_BLOCK_BYTES);
  private readonly names = new Set<string>();
  private blockBytes = 0;
  private payloadBytesRemaining = 0;
  private zeroBlocks = 0;
  private ended = false;
  private entries = 0;
  private totalPayloadBytes = 0;

  push(chunk: Uint8Array): void {
    for (let offset = 0; offset < chunk.byteLength; ) {
      const copied = Math.min(
        TAR_BLOCK_BYTES - this.blockBytes,
        chunk.byteLength - offset,
      );
      this.block.set(chunk.subarray(offset, offset + copied), this.blockBytes);
      this.blockBytes += copied;
      offset += copied;
      if (this.blockBytes === TAR_BLOCK_BYTES) {
        this.consumeBlock();
        this.blockBytes = 0;
      }
    }
  }

  finish(): void {
    if (this.blockBytes !== 0) {
      throw new Error("TAR input ends in a partial 512-byte block.");
    }
    if (this.payloadBytesRemaining !== 0) {
      throw new Error("TAR input ends before an entry payload is complete.");
    }
    if (!this.ended) {
      throw new Error("TAR input is missing its two-block end marker.");
    }
  }

  private consumeBlock(): void {
    if (this.payloadBytesRemaining > 0) {
      this.payloadBytesRemaining -= TAR_BLOCK_BYTES;
      return;
    }
    const zero = this.block.every((value) => value === 0);
    if (zero) {
      this.zeroBlocks += 1;
      if (this.zeroBlocks >= 2) this.ended = true;
      return;
    }
    if (this.ended || this.zeroBlocks !== 0) {
      throw new Error("TAR contains data after its end marker.");
    }

    const expectedChecksum = parseTarOctal(
      this.block.subarray(148, 156),
      "checksum",
    );
    let actualChecksum = 0;
    for (let index = 0; index < TAR_BLOCK_BYTES; index += 1) {
      actualChecksum +=
        index >= 148 && index < 156 ? 0x20 : this.block[index];
    }
    if (expectedChecksum !== actualChecksum) {
      throw new Error("TAR header checksum is invalid.");
    }
    if (tarField(this.block.subarray(257, 263)) !== "ustar") {
      throw new Error("TAR header is not in the bounded USTAR format.");
    }

    const type = String.fromCharCode(this.block[156] || 0x30);
    if (["x", "g", "L", "K"].includes(type)) {
      throw new Error(
        "PAX and GNU extended TAR records are not accepted by this bounded USTAR profile.",
      );
    }
    if (!["0", "1", "2", "3", "4", "5", "6", "7"].includes(type)) {
      throw new Error(`Unsupported TAR entry type: ${type}.`);
    }

    const name = tarField(this.block.subarray(0, 100));
    const prefix = tarField(this.block.subarray(345, 500));
    const fullName = prefix ? `${prefix}/${name}` : name;
    assertSafeTarPath(fullName, "entry");
    if (this.names.has(fullName)) {
      throw new Error(`TAR contains a duplicate entry name: ${fullName}.`);
    }
    this.names.add(fullName);
    this.entries += 1;
    if (this.entries > MAX_TAR_ENTRIES) {
      throw new Error(
        `TAR exceeds the ${MAX_TAR_ENTRIES.toLocaleString("en-US")}-entry safety limit.`,
      );
    }

    if (type === "1" || type === "2") {
      assertSafeTarPath(
        tarField(this.block.subarray(157, 257)),
        "link target",
      );
    }
    const payloadBytes = parseTarOctal(
      this.block.subarray(124, 136),
      "entry size",
    );
    this.totalPayloadBytes += payloadBytes;
    if (this.totalPayloadBytes > MAX_TAR_PAYLOAD_BYTES) {
      throw new Error("TAR payload exceeds the 64 GiB safety limit.");
    }
    this.payloadBytesRemaining =
      Math.ceil(payloadBytes / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
  }
}

export function createTarValidationStream(
  assertActive: () => void,
): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
  const validator = new TarStreamValidator();
  return new TransformStream({
    transform(chunk, controller) {
      assertActive();
      validator.push(chunk);
      controller.enqueue(chunk);
    },
    flush() {
      validator.finish();
    },
  });
}

function tarField(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  const value = new TextDecoder("utf-8", { fatal: true }).decode(
    end < 0 ? bytes : bytes.subarray(0, end),
  );
  return value.trim();
}

function parseTarOctal(bytes: Uint8Array, field: string): number {
  if (bytes[0] & 0x80) {
    throw new Error(`Base-256 TAR ${field} is not accepted.`);
  }
  const value = tarField(bytes).trim();
  if (!/^[0-7]+$/.test(value)) {
    throw new Error(`TAR ${field} is not valid octal.`);
  }
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`TAR ${field} exceeds the safe integer range.`);
  }
  return parsed;
}

function assertSafeTarPath(value: string, field: string): void {
  if (
    !value ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:/.test(value) ||
    value.split(/[\\/]/).some((segment) => segment === "..")
  ) {
    throw new Error(`Unsafe TAR ${field}: ${value || "(empty)"}.`);
  }
}
