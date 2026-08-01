import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textEntry, writeZip } from "./zip-fixture-utils.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "ebooks");
await mkdir(fixtureRoot, { recursive: true });

const mimetype = textEntry("mimetype", "application/epub+zip");
const container = `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
const packageDocument = (firstHref = "text/chapter-1.xhtml") => `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">within-sample</dc:identifier><dc:title>Within sample</dc:title></metadata>
  <manifest>
    <item id="chapter-1" href="${firstHref}" media-type="application/xhtml+xml"/>
    <item id="chapter-2" href="text/chapter-2.xhtml" media-type="application/xhtml+xml"/>
    <item id="appendix" href="text/appendix.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="chapter-1"/><itemref idref="chapter-2"/><itemref idref="appendix" linear="no"/></spine>
</package>`;
const chapter1 = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="../styles/book.css" type="text/css"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Hidden title</title><style>.private{display:none}</style></head><body>
<h1>Chapter One</h1><p>Within EPUB keeps files on this device.</p>
<p><strong>Formatting</strong><span> stays readable. Linked&#160;text.</span></p>
<p><em>Inline</em>, punctuation stays attached.</p>
<ul><li>First item</li><li>Second item</li></ul>
<table><tr><td>Cell A</td><td>Cell B</td></tr></table>
<p>Unicode: हिन्दी, 日本語, café, 😀.</p>
<svg xmlns="http://www.w3.org/2000/svg"><text>hidden drawing text</text></svg>
<script><![CDATA[upload("never")]]></script>
</body></html>`;
const chapter2 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Second hidden title</title></head><body><h1>Chapter Two</h1><p>Line one<br/>after break</p><p>Copyright &copy; registered &reg;.</p></body></html>`;
const appendix = `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Appendix</title></head><body><p>Non-linear appendix must be omitted.</p></body></html>`;

const entries = (opf, firstChapter = chapter1) => [
  mimetype,
  textEntry("META-INF/container.xml", container, 8),
  textEntry("OPS/package.opf", opf, 8),
  textEntry("OPS/text/chapter-1.xhtml", firstChapter, 8),
  textEntry("OPS/text/chapter-2.xhtml", chapter2, 8),
  textEntry("OPS/text/appendix.xhtml", appendix, 8),
];

await writeZip(
  path.join(fixtureRoot, "sample.epub"),
  entries(packageDocument()),
);
await writeZip(
  path.join(fixtureRoot, "unsafe-doctype.epub"),
  entries(
    packageDocument(),
    `<?xml version="1.0"?><!DOCTYPE html [<!ENTITY leak SYSTEM "file:///private">]>${chapter1.replace(/^<\?xml[^>]*>\s*/, "")}`,
  ),
);
await writeZip(
  path.join(fixtureRoot, "unsafe-reference.epub"),
  entries(packageDocument("../../../outside.xhtml")),
);

process.stdout.write(`${fixtureRoot}\n`);
