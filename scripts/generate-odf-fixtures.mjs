import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textEntry, writeZip } from "./zip-fixture-utils.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "open-documents");
await mkdir(fixtureRoot, { recursive: true });

const mimeTypes = {
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
};
const namespaces = `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"`;
const documentPrefix = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${namespaces} office:version="1.3"><office:automatic-styles/>`;
const documentSuffix = `</office:document-content>`;
const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${namespaces} office:version="1.3"><office:styles/></office:document-styles>`;
const meta = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${namespaces} office:version="1.3"><office:meta/></office:document-meta>`;
const settings = `<?xml version="1.0" encoding="UTF-8"?><office:document-settings ${namespaces} office:version="1.3"><office:settings/></office:document-settings>`;

const odtContent = `${documentPrefix}<office:body><office:text>
  <text:tracked-changes><text:changed-region><text:deletion><text:p>deleted history</text:p></text:deletion></text:changed-region></text:tracked-changes>
  <text:h text:outline-level="1">Private ODT</text:h>
  <text:p>Within <text:span>keeps files</text:span> on this device.</text:p>
  <text:p>Spaces:<text:s text:c="3"/>tab:<text:tab/>line<text:line-break/>break 😀<office:annotation><text:p>comment omitted</text:p></office:annotation></text:p>
  <table:table table:name="Table1"><table:table-row><table:table-cell><text:p>Cell A</text:p></table:table-cell><table:table-cell><text:p>Cell B</text:p></table:table-cell></table:table-row></table:table>
</office:text></office:body>${documentSuffix}`;

const odsContent = `${documentPrefix}<office:body><office:spreadsheet>
  <table:table table:name="Main">
    <table:table-row><table:table-cell office:value-type="string"><text:p>Name</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"/><table:table-cell office:value-type="string"><text:p>Value</text:p></table:table-cell></table:table-row>
    <table:table-row><table:table-cell office:value-type="string"><text:p>Comma, quote &quot;<text:line-break/>line 😀</text:p><office:annotation><text:p>comment omitted</text:p></office:annotation></table:table-cell><table:table-cell office:value-type="boolean" office:boolean-value="true"/><table:table-cell office:value-type="date" office:date-value="2026-08-01"/><table:table-cell table:formula="of:=SUM([.A1:.A2])" office:value-type="float" office:value="7"/></table:table-row>
    <table:table-row table:number-rows-repeated="2"><table:table-cell office:value-type="float" office:value="3.5"/><table:table-cell table:number-columns-repeated="2"/><table:table-cell table:formula="of:=1+1"/></table:table-row>
  </table:table>
  <table:table table:name="Extra"><table:table-row><table:table-cell><text:p>omitted extra</text:p></table:table-cell></table:table-row></table:table>
  <table:table table:name="Hidden" table:display="false"><table:table-row><table:table-cell><text:p>omitted hidden</text:p></table:table-cell></table:table-row></table:table>
</office:spreadsheet></office:body>${documentSuffix}`;

const odpContent = `${documentPrefix}<office:body><office:presentation>
  <draw:page draw:name="page1" presentation:visibility="visible"><draw:frame><draw:text-box><text:p>OpenDocument deck</text:p><text:p>Page one<text:tab/>private<text:line-break/>😀</text:p></draw:text-box></draw:frame><presentation:notes><text:p>speaker note omitted</text:p></presentation:notes></draw:page>
  <draw:page draw:name="page2" presentation:visibility="hidden"><draw:frame><draw:text-box><text:p>Hidden page</text:p></draw:text-box></draw:frame><office:annotation><text:p>comment omitted</text:p></office:annotation></draw:page>
</office:presentation></office:body>${documentSuffix}`;

function manifest(mimetype, encrypted = false) {
  return `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mimetype}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml">${encrypted ? "<manifest:encryption-data/>" : ""}</manifest:file-entry><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="settings.xml" manifest:media-type="text/xml"/></manifest:manifest>`;
}

function standardEntries(extension, content, options = {}) {
  const mimetype = mimeTypes[extension];
  return [
    textEntry("mimetype", mimetype),
    textEntry("META-INF/manifest.xml", manifest(mimetype, options.encrypted), 8),
    textEntry("content.xml", content, 8),
    textEntry("styles.xml", styles, 8),
    textEntry("meta.xml", meta, 8),
    textEntry("settings.xml", settings, 8),
    ...(options.macro ? [textEntry("Basic/Standard/module.xml", "macro", 8)] : []),
    ...(options.unsafePath ? [textEntry("../outside.txt", "unsafe", 8)] : []),
  ];
}

for (const [extension, content] of Object.entries({
  odt: odtContent,
  ods: odsContent,
  odp: odpContent,
})) {
  await writeZip(
    path.join(fixtureRoot, `sample.${extension}`),
    standardEntries(extension, content),
  );
  await writeZip(
    path.join(fixtureRoot, `unsafe-doctype.${extension}`),
    standardEntries(
      extension,
      `<?xml version="1.0"?><!DOCTYPE office:document-content [<!ENTITY leak SYSTEM "file:///private">]>${content.slice(content.indexOf("<office:document-content"))}`,
    ),
  );
}
await writeZip(
  path.join(fixtureRoot, "encrypted.odt"),
  standardEntries("odt", odtContent, { encrypted: true }),
);
await writeZip(
  path.join(fixtureRoot, "macro.ods"),
  standardEntries("ods", odsContent, { macro: true }),
);
await writeZip(
  path.join(fixtureRoot, "unsafe-path.odp"),
  standardEntries("odp", odpContent, { unsafePath: true }),
);

process.stdout.write(`${fixtureRoot}\n`);
