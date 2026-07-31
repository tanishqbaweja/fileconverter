import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createDeflateRaw, createGzip } from "node:zlib";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoot = path.join(projectRoot, "fixtures", "archives");
const stressRoot = path.join(projectRoot, "fixtures", "stress", "archives");
const includeStress = process.argv.includes("--include-stress");

await mkdir(fixtureRoot, { recursive: true });
if (includeStress) {
  await mkdir(stressRoot, { recursive: true });
}

function octal(value, length) {
  return value.toString(8).padStart(length - 1, "0") + "\0";
}

function tarHeader(name, size) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write(octal(0o644, 8), 100, 8, "ascii");
  header.write(octal(0, 8), 108, 8, "ascii");
  header.write(octal(0, 8), 116, 8, "ascii");
  header.write(octal(size, 12), 124, 12, "ascii");
  header.write(octal(0, 12), 136, 12, "ascii");
  header.fill(0x20, 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  header.write("within", 265, 6, "ascii");
  header.write("within", 297, 6, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(
    checksum.toString(8).padStart(6, "0") + "\0 ",
    148,
    8,
    "ascii",
  );
  return header;
}

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

function updateCrc32(crc, bytes) {
  let value = crc >>> 0;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return value >>> 0;
}

async function writeChunk(stream, hash, chunk) {
  hash.update(chunk);
  if (!stream.write(chunk)) {
    await once(stream, "drain");
  }
}

async function writeTar(filePath, entries) {
  const stream = createWriteStream(filePath, { flags: "w" });
  const hash = createHash("sha256");
  const entryManifest = [];
  let bytes = 0;
  for (const entry of entries) {
    const header = tarHeader(entry.name, entry.size);
    await writeChunk(stream, hash, header);
    bytes += header.byteLength;
    const entryHash = createHash("sha256");
    let entryBytes = 0;
    for await (const chunk of entry.chunks()) {
      await writeChunk(stream, hash, chunk);
      bytes += chunk.byteLength;
      entryHash.update(chunk);
      entryBytes += chunk.byteLength;
    }
    if (entryBytes !== entry.size) {
      throw new Error(`Entry size mismatch for ${entry.name}.`);
    }
    entryManifest.push({
      name: entry.name,
      size: entryBytes,
      sha256: entryHash.digest("hex"),
    });
    const padding = (512 - (entry.size % 512)) % 512;
    if (padding) {
      const zeros = Buffer.alloc(padding);
      await writeChunk(stream, hash, zeros);
      bytes += zeros.byteLength;
    }
  }
  const trailer = Buffer.alloc(1024);
  await writeChunk(stream, hash, trailer);
  bytes += trailer.byteLength;
  stream.end();
  await once(stream, "finish");
  return { bytes, sha256: hash.digest("hex"), entries: entryManifest };
}

function zipLocalHeader(nameBytes) {
  const header = Buffer.alloc(30 + nameBytes.byteLength);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0808, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0x21, 12);
  header.writeUInt16LE(nameBytes.byteLength, 26);
  nameBytes.copy(header, 30);
  return header;
}

function zipDescriptor(crc32, compressedSize, uncompressedSize) {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc32, 4);
  descriptor.writeUInt32LE(compressedSize, 8);
  descriptor.writeUInt32LE(uncompressedSize, 12);
  return descriptor;
}

function zipCentralHeader(entry) {
  const header = Buffer.alloc(46 + entry.nameBytes.byteLength);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x0314, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0808, 8);
  header.writeUInt16LE(8, 10);
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

function zipEndRecord(entryCount, directorySize, directoryOffset) {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(directoryOffset, 16);
  return end;
}

async function writeZip(filePath, entries) {
  const stream = createWriteStream(filePath, { flags: "w" });
  const hash = createHash("sha256");
  const centralEntries = [];
  const entryManifest = [];
  let bytes = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const localHeaderOffset = bytes;
    const localHeader = zipLocalHeader(nameBytes);
    await writeChunk(stream, hash, localHeader);
    bytes += localHeader.byteLength;

    const entryHash = createHash("sha256");
    let crc = 0xffff_ffff;
    let uncompressedSize = 0;
    async function* source() {
      for await (const chunk of entry.chunks()) {
        entryHash.update(chunk);
        crc = updateCrc32(crc, chunk);
        uncompressedSize += chunk.byteLength;
        yield chunk;
      }
    }
    let compressedSize = 0;
    const deflated = Readable.from(source()).pipe(
      createDeflateRaw({ level: 6 }),
    );
    for await (const chunk of deflated) {
      await writeChunk(stream, hash, chunk);
      bytes += chunk.byteLength;
      compressedSize += chunk.byteLength;
    }
    if (uncompressedSize !== entry.size) {
      throw new Error(`Entry size mismatch for ${entry.name}.`);
    }
    const finalCrc = (crc ^ 0xffff_ffff) >>> 0;
    const descriptor = zipDescriptor(
      finalCrc,
      compressedSize,
      uncompressedSize,
    );
    await writeChunk(stream, hash, descriptor);
    bytes += descriptor.byteLength;
    centralEntries.push({
      nameBytes,
      crc32: finalCrc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    entryManifest.push({
      name: entry.name,
      size: uncompressedSize,
      sha256: entryHash.digest("hex"),
    });
  }

  const directoryOffset = bytes;
  for (const entry of centralEntries) {
    const header = zipCentralHeader(entry);
    await writeChunk(stream, hash, header);
    bytes += header.byteLength;
  }
  const directorySize = bytes - directoryOffset;
  const end = zipEndRecord(entries.length, directorySize, directoryOffset);
  await writeChunk(stream, hash, end);
  bytes += end.byteLength;
  stream.end();
  await once(stream, "finish");
  return { bytes, sha256: hash.digest("hex"), entries: entryManifest };
}

async function gzipTar(tarPath, gzipPath) {
  await pipeline(
    createReadStream(tarPath),
    createGzip({ level: 6, mtime: 0 }),
    createWriteStream(gzipPath, { flags: "w" }),
  );
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(gzipPath)) {
    hash.update(chunk);
    bytes += chunk.byteLength;
  }
  return {
    bytes,
    sha256: hash.digest("hex"),
  };
}

const textEntries = [
  {
    name: "hello.txt",
    size: Buffer.byteLength("Within archive fixture.\n"),
    async *chunks() {
      yield Buffer.from("Within archive fixture.\n");
    },
  },
  {
    name: "nested/data.json",
    size: Buffer.byteLength('{"private":true,"uploadBytes":0}\n'),
    async *chunks() {
      yield Buffer.from('{"private":true,"uploadBytes":0}\n');
    },
  },
  {
    name: "nested/unicode-café.txt",
    size: Buffer.byteLength("Private Unicode archive entry.\n"),
    async *chunks() {
      yield Buffer.from("Private Unicode archive entry.\n");
    },
  },
];
const smallTarPath = path.join(fixtureRoot, "sample.tar");
const smallGzipPath = path.join(fixtureRoot, "sample.tar.gz");
const smallZipPath = path.join(fixtureRoot, "sample.zip");
const smallTar = await writeTar(smallTarPath, textEntries);
const smallGzip = await gzipTar(smallTarPath, smallGzipPath);
const smallZip = await writeZip(smallZipPath, textEntries);
const unsafeTarPath = path.join(fixtureRoot, "unsafe-entry.tar");
const unsafeGzipPath = path.join(fixtureRoot, "unsafe-entry.tar.gz");
const unsafeZipPath = path.join(fixtureRoot, "unsafe-entry.zip");
const unsafeText = "This entry must never escape an extraction root.\n";
const unsafeTar = await writeTar(unsafeTarPath, [
  {
    name: "../escape.txt",
    size: Buffer.byteLength(unsafeText),
    async *chunks() {
      yield Buffer.from(unsafeText);
    },
  },
]);
const unsafeGzip = await gzipTar(unsafeTarPath, unsafeGzipPath);
const unsafeZip = await writeZip(unsafeZipPath, [
  {
    name: "../escape.txt",
    size: Buffer.byteLength(unsafeText),
    async *chunks() {
      yield Buffer.from(unsafeText);
    },
  },
]);
const manyEntries = Array.from({ length: 1_024 }, (_, index) => {
  const text = `deterministic archive entry ${index}\n`;
  return {
    name: `entries/${String(index).padStart(4, "0")}.txt`,
    size: Buffer.byteLength(text),
    async *chunks() {
      yield Buffer.from(text);
    },
  };
});
const manyTarPath = path.join(fixtureRoot, "many-entries.tar");
const manyGzipPath = path.join(fixtureRoot, "many-entries.tar.gz");
const manyZipPath = path.join(fixtureRoot, "many-entries.zip");
const manyTar = await writeTar(manyTarPath, manyEntries);
const manyGzip = await gzipTar(manyTarPath, manyGzipPath);
const manyZip = await writeZip(manyZipPath, manyEntries);

const generatedFixtures = [
  {
    tarPath: smallTarPath,
    gzipPath: smallGzipPath,
    zipPath: smallZipPath,
    tarInfo: smallTar,
    gzipInfo: smallGzip,
    zipInfo: smallZip,
  },
  {
    tarPath: unsafeTarPath,
    gzipPath: unsafeGzipPath,
    zipPath: unsafeZipPath,
    tarInfo: unsafeTar,
    gzipInfo: unsafeGzip,
    zipInfo: unsafeZip,
  },
  {
    tarPath: manyTarPath,
    gzipPath: manyGzipPath,
    zipPath: manyZipPath,
    tarInfo: manyTar,
    gzipInfo: manyGzip,
    zipInfo: manyZip,
  },
];

if (includeStress) {
  const stressTarPath = path.join(stressRoot, "archive-256m.tar");
  const stressGzipPath = path.join(stressRoot, "archive-256m.tar.gz");
  const stressZipPath = path.join(stressRoot, "archive-256m.zip");
  const stressPayloadBytes = 256 * 1024 * 1024;
  const deterministicChunk = Buffer.allocUnsafe(1024 * 1024);
  let state = 0x9e3779b9;
  for (let offset = 0; offset < deterministicChunk.length; offset += 4) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    deterministicChunk.writeUInt32LE(state >>> 0, offset);
  }
  const stressTar = await writeTar(stressTarPath, [
    {
      name: "payload.bin",
      size: stressPayloadBytes,
      async *chunks() {
        for (
          let written = 0;
          written < stressPayloadBytes;
          written += deterministicChunk.byteLength
        ) {
          yield deterministicChunk;
        }
      },
    },
  ]);
  const stressGzip = await gzipTar(stressTarPath, stressGzipPath);
  const stressZip = await writeZip(stressZipPath, [
    {
      name: "payload.bin",
      size: stressPayloadBytes,
      async *chunks() {
        for (
          let written = 0;
          written < stressPayloadBytes;
          written += deterministicChunk.byteLength
        ) {
          yield deterministicChunk;
        }
      },
    },
  ]);
  generatedFixtures.push({
    tarPath: stressTarPath,
    gzipPath: stressGzipPath,
    zipPath: stressZipPath,
    tarInfo: stressTar,
    gzipInfo: stressGzip,
    zipInfo: stressZip,
  });
}

for (const {
  tarPath,
  gzipPath,
  zipPath,
  tarInfo,
  gzipInfo,
  zipInfo,
} of generatedFixtures) {
  await writeFile(
    `${tarPath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-archive-fixtures.mjs",
        bytes: tarInfo.bytes,
        sha256: tarInfo.sha256,
        entries: tarInfo.entries,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    `${gzipPath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-archive-fixtures.mjs",
        bytes: gzipInfo.bytes,
        sha256: gzipInfo.sha256,
        validationBytes: tarInfo.bytes,
        validationSha256: tarInfo.sha256,
        entries: tarInfo.entries,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    `${zipPath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-archive-fixtures.mjs",
        bytes: zipInfo.bytes,
        sha256: zipInfo.sha256,
        entries: zipInfo.entries,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

process.stdout.write(`${fixtureRoot}\n`);
if (includeStress) {
  const stressTarPath = path.join(stressRoot, "archive-256m.tar");
  process.stdout.write(`${stressRoot}\n${(await stat(stressTarPath)).size}\n`);
}
