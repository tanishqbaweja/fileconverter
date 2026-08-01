import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { Readable } from "node:stream";
import { createDeflateRaw } from "node:zlib";

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function textEntry(name, text, method = 0) {
  const bytes = Buffer.from(text, "utf8");
  return {
    name,
    method,
    size: bytes.byteLength,
    async *chunks() {
      yield bytes;
    },
  };
}

export async function writeZip(filePath, entries) {
  const stream = createWriteStream(filePath, { flags: "w" });
  const zipHash = createHash("sha256");
  const centralEntries = [];
  let offset = 0;

  const write = async (chunk) => {
    zipHash.update(chunk);
    if (!stream.write(chunk)) await once(stream, "drain");
    offset += chunk.byteLength;
  };

  try {
    for (const entry of entries) {
      const nameBytes = Buffer.from(entry.name, "utf8");
      const localHeaderOffset = offset;
      const method = entry.method ?? 0;
      if (method !== 0 && method !== 8) {
        throw new Error(`Unsupported fixture ZIP method ${method}.`);
      }
      await write(localHeader(nameBytes, method));
      let crc = 0xffff_ffff;
      let size = 0;
      async function* source() {
        for await (const chunk of entry.chunks()) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          crc = updateCrc32(crc, bytes);
          size += bytes.byteLength;
          yield bytes;
        }
      }
      let compressedSize = 0;
      const payload =
        method === 8
          ? Readable.from(source()).pipe(createDeflateRaw({ level: 6 }))
          : source();
      for await (const chunk of payload) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        compressedSize += bytes.byteLength;
        await write(bytes);
      }
      if (size !== entry.size) {
        throw new Error(
          `DOCX fixture entry ${entry.name} expected ${entry.size} bytes but wrote ${size}.`,
        );
      }
      const crc32 = (crc ^ 0xffff_ffff) >>> 0;
      await write(dataDescriptor(crc32, compressedSize, size));
      centralEntries.push({
        nameBytes,
        crc32,
        compressedSize,
        uncompressedSize: size,
        method,
        localHeaderOffset,
      });
    }

    const directoryOffset = offset;
    for (const entry of centralEntries) await write(centralHeader(entry));
    const directorySize = offset - directoryOffset;
    await write(endRecord(centralEntries.length, directorySize, directoryOffset));
    stream.end();
    await once(stream, "finish");
    return { bytes: offset, sha256: zipHash.digest("hex") };
  } catch (error) {
    stream.destroy(error);
    throw error;
  }
}

function updateCrc32(crc, bytes) {
  let value = crc >>> 0;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return value >>> 0;
}

function localHeader(nameBytes, method) {
  const header = Buffer.alloc(30 + nameBytes.byteLength);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0808, 6);
  header.writeUInt16LE(method, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0x21, 12);
  header.writeUInt16LE(nameBytes.byteLength, 26);
  nameBytes.copy(header, 30);
  return header;
}

function dataDescriptor(crc32, compressedSize, uncompressedSize) {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc32, 4);
  descriptor.writeUInt32LE(compressedSize, 8);
  descriptor.writeUInt32LE(uncompressedSize, 12);
  return descriptor;
}

function centralHeader(entry) {
  const header = Buffer.alloc(46 + entry.nameBytes.byteLength);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x0314, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0808, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(0x21, 14);
  header.writeUInt32LE(entry.crc32, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.uncompressedSize, 24);
  header.writeUInt16LE(entry.nameBytes.byteLength, 28);
  header.writeUInt32LE(entry.localHeaderOffset, 42);
  entry.nameBytes.copy(header, 46);
  return header;
}

function endRecord(entryCount, directorySize, directoryOffset) {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(entryCount, 8);
  record.writeUInt16LE(entryCount, 10);
  record.writeUInt32LE(directorySize, 12);
  record.writeUInt32LE(directoryOffset, 16);
  return record;
}
