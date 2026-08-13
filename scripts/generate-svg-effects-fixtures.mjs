import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const mode = process.argv[2] ?? "all";
if (!new Set(["all", "small", "stress"]).has(mode)) {
  throw new Error("Choose SVG effects fixture mode: all, small, or stress.");
}

const fixtures = [
  {
    mode: "small",
    root: path.join(projectRoot, "fixtures", "images"),
    name: "test-pattern-effects.svg",
    referenceName: "test-pattern-effects-reference.png",
    width: 960,
    height: 540,
    tile: 60,
  },
  {
    mode: "stress",
    root: path.join(projectRoot, "fixtures", "stress", "images"),
    name: "svg-effects-6m.svg",
    referenceName: "svg-effects-6m-reference.png",
    width: 3_000,
    height: 2_000,
    tile: 30,
  },
].filter((fixture) => mode === "all" || fixture.mode === mode);

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});
const browserVersion = browser.version();
try {
  const page = await browser.newPage();
  for (const fixture of fixtures) {
    await mkdir(fixture.root, { recursive: true });
    const source = buildSvg(fixture.width, fixture.height, fixture.tile);
    const sourcePath = path.join(fixture.root, fixture.name);
    const referencePath = path.join(fixture.root, fixture.referenceName);
    await writeFile(sourcePath, source, "utf8");
    const base64 = await page.evaluate(
      async ({ source, width, height }) => {
        const image = new Image();
        const objectUrl = URL.createObjectURL(
          new Blob([source], { type: "image/svg+xml;charset=utf-8" }),
        );
        try {
          image.src = objectUrl;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { alpha: true });
          if (!context) throw new Error("Chrome did not provide a 2D canvas context.");
          context.drawImage(image, 0, 0, width, height);
          return canvas.toDataURL("image/png").split(",", 2)[1];
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      },
      { source, width: fixture.width, height: fixture.height },
    );
    await writeFile(referencePath, Buffer.from(base64, "base64"));
    const sourceBytes = await readFile(sourcePath);
    const referenceBytes = await readFile(referencePath);
    const manifest = {
      generatedBy: "scripts/generate-svg-effects-fixtures.mjs",
      referenceRenderer: `${browserVersion} SVG and Canvas2D`,
      bytes: sourceBytes.byteLength,
      sha256: sha256(sourceBytes),
      width: fixture.width,
      height: fixture.height,
      elements: countElements(source),
      filters: 1,
      masks: 1,
      filterPrimitives: 7,
      validationReference: path.relative(projectRoot, referencePath).replaceAll("\\", "/"),
      validationBytes: referenceBytes.byteLength,
      validationSha256: sha256(referenceBytes),
      probe: {
        streams: [
          { width: fixture.width, height: fixture.height, nb_frames: "1" },
        ],
      },
    };
    await writeFile(
      `${sourcePath}.json`,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      `${referencePath}.json`,
      `${JSON.stringify(
        {
          generatedBy: manifest.generatedBy,
          renderer: manifest.referenceRenderer,
          bytes: referenceBytes.byteLength,
          sha256: manifest.validationSha256,
          width: fixture.width,
          height: fixture.height,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    process.stdout.write(`${sourcePath} (${sourceBytes.byteLength} bytes)\n`);
  }
  if (mode === "all" || mode === "small") {
    const fixtureRoot = path.join(projectRoot, "fixtures", "images");
    for (const fixture of [
      {
        name: "unsafe-svg-effect-pixels.svg",
        expectation: "rejected filter raster above the 6-megapixel effect budget",
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" width="3001" height="2000"><defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="3001" height="2000"><rect width="3001" height="2000" fill="#fff"/></mask></defs><rect width="3001" height="2000" fill="#369" mask="url(#m)"/></svg>\n',
      },
      {
        name: "unsafe-svg-filter-primitive.svg",
        expectation: "rejected unsupported unbounded filter primitive",
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><defs><filter id="f" filterUnits="userSpaceOnUse" x="0" y="0" width="320" height="240"><feTurbulence baseFrequency="0.5" numOctaves="8"/></filter></defs><rect width="320" height="240" filter="url(#f)"/></svg>\n',
      },
      {
        name: "unsafe-svg-effect-reuse.svg",
        expectation: "rejected repeated application of one bounded filter",
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><defs><filter id="f" filterUnits="userSpaceOnUse" x="0" y="0" width="320" height="240"><feGaussianBlur stdDeviation="4"/></filter></defs><rect width="160" height="240" filter="url(#f)"/><rect x="160" width="160" height="240" filter="url(#f)"/></svg>\n',
      },
    ]) {
      const fixturePath = path.join(fixtureRoot, fixture.name);
      const bytes = Buffer.from(fixture.source, "utf8");
      await writeFile(fixturePath, bytes);
      await writeFile(
        `${fixturePath}.json`,
        `${JSON.stringify(
          {
            generatedBy: "scripts/generate-svg-effects-fixtures.mjs",
            bytes: bytes.byteLength,
            sha256: sha256(bytes),
            expectation: fixture.expectation,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    }
  }
} finally {
  await browser.close();
}

function buildSvg(width, height, tile) {
  const elements = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    "<defs>",
    `<linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#102a43"/><stop offset="1" stop-color="#4ca1af"/></linearGradient>`,
    `<filter id="bounded-shadow" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">`,
    '<feGaussianBlur in="SourceAlpha" stdDeviation="6" result="blur"/>',
    '<feOffset in="blur" dx="8" dy="6" result="offset"/>',
    '<feFlood flood-color="#08121d" flood-opacity="0.65" result="shadow-color"/>',
    '<feComposite in="shadow-color" in2="offset" operator="in" result="shadow"/>',
    '<feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>',
    "</filter>",
    `<mask id="bounded-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" mask-type="alpha">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
    `<ellipse cx="${Math.round(width / 2)}" cy="${Math.round(height / 2)}" rx="${Math.round(width / 5)}" ry="${Math.round(height / 4)}" fill="#ffffff" fill-opacity="0.22"/>`,
    "</mask>",
    "</defs>",
    `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#background)"/>`,
    '<g mask="url(#bounded-mask)"><g filter="url(#bounded-shadow)">',
  ];
  let row = 0;
  for (let y = 0; y < height; y += tile, row += 1) {
    let column = 0;
    for (let x = 0; x < width; x += tile, column += 1) {
      const red = (column * 29 + row * 7) % 256;
      const green = (column * 11 + row * 31) % 256;
      const blue = (column * 17 + row * 13) % 256;
      const color = `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`;
      const inset = (row + column) % 3;
      elements.push(
        `<rect x="${x + inset}" y="${y + inset}" width="${Math.max(1, tile - inset - 2)}" height="${Math.max(1, tile - inset - 2)}" rx="${Math.max(1, Math.round(tile / 6))}" fill="${color}"/>`,
      );
    }
  }
  elements.push("</g></g>", "</svg>");
  return `${elements.join("\n")}\n`;
}

function countElements(source) {
  return [...source.matchAll(/<\s*([A-Za-z_][\w:.-]*)\b/g)].length;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
