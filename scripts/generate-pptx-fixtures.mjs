import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textEntry, writeZip } from "./zip-fixture-utils.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "presentations");
await mkdir(fixtureRoot, { recursive: true });

const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`;
const rootRelationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;
const presentation = `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId3"/></p:sldMasterIdLst>
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" show="0" r:id="rId2"/></p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
const presentationRelationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
</Relationships>`;
const slidePrefix = `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree>`;
const slideSuffix = `</p:spTree></p:cSld></p:sld>`;
const sampleSlide = `${slidePrefix}
  <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title" descr="attribute text is not slide text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>
    <a:p><a:r><a:t>Quarterly </a:t></a:r><a:r><a:t>Plan</a:t></a:r></a:p>
    <a:p><a:r><a:t>Revenue</a:t></a:r><a:tab/><a:r><a:t>₹42</a:t></a:r><a:br/><a:r><a:t>private 😀</a:t></a:r></a:p>
  </p:txBody></p:sp>
  <p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr>
    <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Cell A</a:t></a:r></a:p></a:txBody></a:tc>
    <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Cell B</a:t></a:r></a:p></a:txBody></a:tc>
  </a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>
${slideSuffix}`;
const hiddenSlide = `${slidePrefix}<p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Hidden appendix</a:t></a:r></a:p></p:txBody></p:sp>${slideSuffix}`;
const slideRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
const slideLayout = `<?xml version="1.0" encoding="UTF-8"?><p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" type="blank"><p:cSld><p:spTree/></p:cSld></p:sldLayout>`;
const slideLayoutRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
const slideMaster = `<?xml version="1.0" encoding="UTF-8"?><p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree/></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;
const slideMasterRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`;
const theme = `<?xml version="1.0" encoding="UTF-8"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Within"><a:themeElements><a:clrScheme name="Within"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="111111"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="7C3AED"/></a:accent1><a:accent2><a:srgbClr val="0891B2"/></a:accent2><a:accent3><a:srgbClr val="16A34A"/></a:accent3><a:accent4><a:srgbClr val="EA580C"/></a:accent4><a:accent5><a:srgbClr val="DC2626"/></a:accent5><a:accent6><a:srgbClr val="4F46E5"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Within"><a:majorFont/><a:minorFont/></a:fontScheme><a:fmtScheme name="Within"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>`;

const standardEntries = (slide1, relationships = presentationRelationships) => [
  textEntry("[Content_Types].xml", contentTypes, 8),
  textEntry("_rels/.rels", rootRelationships, 8),
  textEntry("ppt/presentation.xml", presentation, 8),
  textEntry("ppt/_rels/presentation.xml.rels", relationships, 8),
  textEntry("ppt/slides/slide1.xml", slide1, 8),
  textEntry("ppt/slides/slide2.xml", hiddenSlide, 8),
  textEntry("ppt/slides/_rels/slide1.xml.rels", slideRelationships, 8),
  textEntry("ppt/slides/_rels/slide2.xml.rels", slideRelationships, 8),
  textEntry("ppt/slideLayouts/slideLayout1.xml", slideLayout, 8),
  textEntry("ppt/slideLayouts/_rels/slideLayout1.xml.rels", slideLayoutRelationships, 8),
  textEntry("ppt/slideMasters/slideMaster1.xml", slideMaster, 8),
  textEntry("ppt/slideMasters/_rels/slideMaster1.xml.rels", slideMasterRelationships, 8),
  textEntry("ppt/theme/theme1.xml", theme, 8),
];

await writeZip(path.join(fixtureRoot, "sample.pptx"), standardEntries(sampleSlide));
await writeZip(
  path.join(fixtureRoot, "unsafe-doctype.pptx"),
  standardEntries(
    `<?xml version="1.0"?><!DOCTYPE p:sld [<!ENTITY leak SYSTEM "file:///private">]>${slidePrefix}<p:sp><p:txBody><a:p><a:r><a:t>&leak;</a:t></a:r></a:p></p:txBody></p:sp>${slideSuffix}`,
  ),
);
await writeZip(
  path.join(fixtureRoot, "unsafe-reference.pptx"),
  standardEntries(
    sampleSlide,
    presentationRelationships.replace(
      'Target="slides/slide1.xml"',
      'Target="../../../outside.xml"',
    ),
  ),
);

process.stdout.write(`${fixtureRoot}\n`);
