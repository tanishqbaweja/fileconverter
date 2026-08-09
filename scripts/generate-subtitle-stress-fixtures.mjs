import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "subtitles");
const targetBytes = 64 * 1024 * 1024;
const srtPath = path.join(fixtureRoot, "subtitles-64m.srt");
const vttPath = path.join(fixtureRoot, "subtitles-64m.vtt");
const assPath = path.join(fixtureRoot, "subtitles-64m.ass");
const ttmlPath = path.join(fixtureRoot, "subtitles-64m.ttml");

await mkdir(fixtureRoot, { recursive: true });

const srtStream = createWriteStream(srtPath, { flags: "w" });
const vttStream = createWriteStream(vttPath, { flags: "w" });
const assStream = createWriteStream(assPath, { flags: "w" });
const ttmlStream = createWriteStream(ttmlPath, { flags: "w" });
const srtHash = createHash("sha256");
const vttHash = createHash("sha256");
const assHash = createHash("sha256");
const ttmlHash = createHash("sha256");
const srtToVttHash = createHash("sha256");
const vttToSrtHash = createHash("sha256");
const srtToAssHash = createHash("sha256");
const vttToAssHash = createHash("sha256");
const assToSrtHash = createHash("sha256");
const assToVttHash = createHash("sha256");
const srtToTtmlHash = createHash("sha256");
const vttToTtmlHash = createHash("sha256");
const ttmlToSrtHash = createHash("sha256");
const ttmlToVttHash = createHash("sha256");
let srtBytes = 0;
let vttBytes = 0;
let assBytes = 0;
let ttmlBytes = 0;
let srtToVttBytes = 0;
let vttToSrtBytes = 0;
let srtToAssBytes = 0;
let vttToAssBytes = 0;
let assToSrtBytes = 0;
let assToVttBytes = 0;
let srtToTtmlBytes = 0;
let vttToTtmlBytes = 0;
let ttmlToSrtBytes = 0;
let ttmlToVttBytes = 0;

const write = async (stream, hash, text) => {
  hash.update(text);
  if (!stream.write(text, "utf8")) {
    await once(stream, "drain");
  }
  return Buffer.byteLength(text);
};
const timing = (cue, separator) => {
  const hour = String(Math.floor(cue / 3600) % 100).padStart(2, "0");
  const minute = String(Math.floor(cue / 60) % 60).padStart(2, "0");
  const second = String(cue % 60).padStart(2, "0");
  return `${hour}:${minute}:${second}${separator}000 --> ${hour}:${minute}:${second}${separator}500`;
};
const assTiming = (cue) => {
  const hour = String(Math.floor(cue / 3600) % 100);
  const minute = String(Math.floor(cue / 60) % 60).padStart(2, "0");
  const second = String(cue % 60).padStart(2, "0");
  return `${hour}:${minute}:${second}.00 --> ${hour}:${minute}:${second}.50`;
};

const vttHeader = "WEBVTT\n\n";
const vttOutputHeader = "WEBVTT\r\n\r\n";
const assHeader =
  "[Script Info]\n" +
  "Title: Within deterministic ASS stress fixture\n" +
  "ScriptType: v4.00+\n\n" +
  "[Events]\n" +
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n";
const assOutputHeader =
  "[Script Info]\r\n" +
  "Title: Converted locally by Within\r\n" +
  "ScriptType: v4.00+\r\n" +
  "WrapStyle: 0\r\n" +
  "ScaledBorderAndShadow: yes\r\n\r\n" +
  "[V4+ Styles]\r\n" +
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\n" +
  "Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\r\n\r\n" +
  "[Events]\r\n" +
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\n";
const ttmlHeader =
  '<?xml version="1.0" encoding="UTF-8"?>\r\n' +
  '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling">\r\n' +
  "  <body><div>\r\n";
const ttmlFooter = "  </div></body>\r\n</tt>\r\n";
vttBytes += await write(vttStream, vttHash, vttHeader);
assBytes += await write(assStream, assHash, assHeader);
ttmlBytes += await write(ttmlStream, ttmlHash, ttmlHeader);
srtToTtmlHash.update(ttmlHeader);
srtToTtmlBytes += Buffer.byteLength(ttmlHeader);
vttToTtmlHash.update(ttmlHeader);
vttToTtmlBytes += Buffer.byteLength(ttmlHeader);
srtToVttHash.update(vttOutputHeader);
srtToVttBytes += Buffer.byteLength(vttOutputHeader);
assToVttHash.update(vttOutputHeader);
assToVttBytes += Buffer.byteLength(vttOutputHeader);
ttmlToVttHash.update(vttOutputHeader);
ttmlToVttBytes += Buffer.byteLength(vttOutputHeader);
srtToAssHash.update(assOutputHeader);
srtToAssBytes += Buffer.byteLength(assOutputHeader);
vttToAssHash.update(assOutputHeader);
vttToAssBytes += Buffer.byteLength(assOutputHeader);

let cue = 1;
while (
  srtBytes < targetBytes ||
  vttBytes < targetBytes ||
  assBytes < targetBytes ||
  ttmlBytes < targetBytes
) {
  const srtBatch = [];
  const vttBatch = [];
  const assBatch = [];
  const srtToVttBatch = [];
  const vttToSrtBatch = [];
  const srtToAssBatch = [];
  const vttToAssBatch = [];
  const assToSrtBatch = [];
  const assToVttBatch = [];
  const ttmlBatch = [];
  const ttmlToSrtBatch = [];
  const ttmlToVttBatch = [];
  for (let index = 0; index < 10_000; index += 1) {
    const payload = `Cue ${cue} deterministic`;
    const srtTiming = timing(cue, ",");
    const vttTiming = timing(cue, ".");
    const assCueTiming = assTiming(cue);
    srtBatch.push(`${cue}\n${srtTiming}\n${payload}\n\n`);
    vttBatch.push(`${vttTiming} position:10%\n${payload}\n\n`);
    assBatch.push(
      `Dialogue: 0,${assCueTiming.split(" --> ")[0]},${assCueTiming.split(" --> ")[1]},Default,Narrator,0,0,0,,{\\i1}${payload}{\\i0}\n`,
    );
    srtToVttBatch.push(`${vttTiming}\r\n${payload}\r\n\r\n`);
    vttToSrtBatch.push(
      `${cue}\r\n${vttTiming.replace(/\./g, ",")}\r\n${payload}\r\n\r\n`,
    );
    const assStart = assCueTiming.split(" --> ")[0];
    const assEnd = assCueTiming.split(" --> ")[1];
    srtToAssBatch.push(
      `Dialogue: 0,${assStart},${assEnd},Default,,0,0,0,,${payload}\r\n`,
    );
    vttToAssBatch.push(
      `Dialogue: 0,${assStart},${assEnd},Default,,0,0,0,,${payload}\r\n`,
    );
    assToSrtBatch.push(
      `${cue}\r\n${vttTiming.replace(/\./g, ",")}\r\n[Narrator] ${payload}\r\n\r\n`,
    );
    assToVttBatch.push(
      `${vttTiming}\r\n<v Narrator>${payload}\r\n\r\n`,
    );
    ttmlBatch.push(
      `    <p begin="${vttTiming.split(" --> ")[0]}" end="${vttTiming.split(" --> ")[1]}">${payload}</p>\r\n`,
    );
    ttmlToSrtBatch.push(
      `${cue}\r\n${vttTiming.replace(/\./g, ",")}\r\n${payload}\r\n\r\n`,
    );
    ttmlToVttBatch.push(`${vttTiming}\r\n${payload}\r\n\r\n`);
    cue += 1;
  }
  const srt = srtBatch.join("");
  const vtt = vttBatch.join("");
  const ass = assBatch.join("");
  const srtToVtt = srtToVttBatch.join("");
  const vttToSrt = vttToSrtBatch.join("");
  const srtToAss = srtToAssBatch.join("");
  const vttToAss = vttToAssBatch.join("");
  const assToSrt = assToSrtBatch.join("");
  const assToVtt = assToVttBatch.join("");
  const ttml = ttmlBatch.join("");
  const ttmlToSrt = ttmlToSrtBatch.join("");
  const ttmlToVtt = ttmlToVttBatch.join("");
  srtBytes += await write(srtStream, srtHash, srt);
  vttBytes += await write(vttStream, vttHash, vtt);
  assBytes += await write(assStream, assHash, ass);
  ttmlBytes += await write(ttmlStream, ttmlHash, ttml);
  srtToVttHash.update(srtToVtt);
  srtToVttBytes += Buffer.byteLength(srtToVtt);
  vttToSrtHash.update(vttToSrt);
  vttToSrtBytes += Buffer.byteLength(vttToSrt);
  srtToAssHash.update(srtToAss);
  srtToAssBytes += Buffer.byteLength(srtToAss);
  vttToAssHash.update(vttToAss);
  vttToAssBytes += Buffer.byteLength(vttToAss);
  assToSrtHash.update(assToSrt);
  assToSrtBytes += Buffer.byteLength(assToSrt);
  assToVttHash.update(assToVtt);
  assToVttBytes += Buffer.byteLength(assToVtt);
  srtToTtmlHash.update(ttml);
  srtToTtmlBytes += Buffer.byteLength(ttml);
  vttToTtmlHash.update(ttml);
  vttToTtmlBytes += Buffer.byteLength(ttml);
  ttmlToSrtHash.update(ttmlToSrt);
  ttmlToSrtBytes += Buffer.byteLength(ttmlToSrt);
  ttmlToVttHash.update(ttmlToVtt);
  ttmlToVttBytes += Buffer.byteLength(ttmlToVtt);
}

ttmlBytes += await write(ttmlStream, ttmlHash, ttmlFooter);
srtToTtmlHash.update(ttmlFooter);
srtToTtmlBytes += Buffer.byteLength(ttmlFooter);
vttToTtmlHash.update(ttmlFooter);
vttToTtmlBytes += Buffer.byteLength(ttmlFooter);
srtStream.end();
vttStream.end();
assStream.end();
ttmlStream.end();
await Promise.all([
  once(srtStream, "finish"),
  once(vttStream, "finish"),
  once(assStream, "finish"),
  once(ttmlStream, "finish"),
]);

await writeFile(
  `${srtPath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-subtitle-stress-fixtures.mjs",
      cues: cue - 1,
      bytes: srtBytes,
      sha256: srtHash.digest("hex"),
      expectedByProfile: {
        "srt-to-vtt": {
          validationBytes: srtToVttBytes,
          validationSha256: srtToVttHash.digest("hex"),
        },
        "srt-to-ass": {
          validationBytes: srtToAssBytes,
          validationSha256: srtToAssHash.digest("hex"),
        },
        "srt-to-ttml": {
          validationBytes: srtToTtmlBytes,
          validationSha256: srtToTtmlHash.digest("hex"),
        },
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);
await writeFile(
  `${assPath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-subtitle-stress-fixtures.mjs",
      cues: cue - 1,
      bytes: assBytes,
      sha256: assHash.digest("hex"),
      expectedByProfile: {
        "ass-to-srt": {
          validationBytes: assToSrtBytes,
          validationSha256: assToSrtHash.digest("hex"),
        },
        "ass-to-vtt": {
          validationBytes: assToVttBytes,
          validationSha256: assToVttHash.digest("hex"),
        },
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);
await writeFile(
  `${vttPath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-subtitle-stress-fixtures.mjs",
      cues: cue - 1,
      bytes: vttBytes,
      sha256: vttHash.digest("hex"),
      expectedByProfile: {
        "vtt-to-srt": {
          validationBytes: vttToSrtBytes,
          validationSha256: vttToSrtHash.digest("hex"),
        },
        "vtt-to-ass": {
          validationBytes: vttToAssBytes,
          validationSha256: vttToAssHash.digest("hex"),
        },
        "vtt-to-ttml": {
          validationBytes: vttToTtmlBytes,
          validationSha256: vttToTtmlHash.digest("hex"),
        },
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);
await writeFile(
  `${ttmlPath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-subtitle-stress-fixtures.mjs",
      cues: cue - 1,
      bytes: ttmlBytes,
      sha256: ttmlHash.digest("hex"),
      expectedByProfile: {
        "ttml-to-srt": {
          validationBytes: ttmlToSrtBytes,
          validationSha256: ttmlToSrtHash.digest("hex"),
        },
        "ttml-to-vtt": {
          validationBytes: ttmlToVttBytes,
          validationSha256: ttmlToVttHash.digest("hex"),
        },
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);

process.stdout.write(`${fixtureRoot}\n`);
