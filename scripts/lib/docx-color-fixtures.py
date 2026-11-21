"""Generate a finite Word package and independently validate its HTML; never convert it."""

import codecs
import hashlib
from html import escape
from html.parser import HTMLParser
from io import BytesIO
import json
import re
import sys
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

PAYLOAD = "Color payload 色 😀 & <safe> " * 7000
# Independent expected (text, foreground, strong) segments in document order.
EXPECTED = (
    (("Default α", "#112233", False),),
    (("Inherited paragraph", "#225544", False), ("Character style", "#884422", True),
     ("Direct override", "#aa0033", True), ("Automatic", "CanvasText", False)),
    (("Theme wins over stale RGB", "#4f81bd", False), ("Mapped text1", "#808080", False),
     ("Saved system RGB", "#101820", False), ("Theme shade", "#404040", False)),
    (("Theme tint takes precedence", "#95b3d7", False), ("Unsupported theme RGB fallback", "#2468ac", False),
     ("Unsupported theme without RGB", "CanvasText", False)),
    ((PAYLOAD, "#124578", False),),
    (("After the payload", "#112233", False),),
)
SEMANTIC_CASES = sum(map(len, EXPECTED))
TAIL = "After the payload שלום 123 English"
ALIGNED_EXPECTED = EXPECTED[:-1] + (((TAIL, "#112233", False),),)
# Expected structure and canonical CSS, checked for every paragraph including
# the long payload and its tail. These expectations are not read from the ZIP.
ALIGNMENT = (
    ("p", "text-align:center"),
    ("p", "text-align:right"),
    ("p", "text-align:left"),
    ("h1", "white-space:pre-wrap;text-align:justify"),
    ("p", "text-align:right"),
    ("p", None),
)


def generate(file, aligned=False):
    import docx
    from docx.enum.style import WD_STYLE_TYPE
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.opc.constants import RELATIONSHIP_TYPE as RT
    from docx.oxml import OxmlElement, parse_xml
    from docx.oxml.ns import qn
    from docx.shared import RGBColor
    from lxml import etree
    assert docx.__version__ == "1.2.0"
    document = docx.Document()
    defaults = document.styles.element.find(qn("w:docDefaults")).find(qn("w:rPrDefault")).find(qn("w:rPr"))

    def color(rpr, **attrs):
        element = OxmlElement("w:color")
        for key, val in attrs.items():
            element.set(qn("w:" + key), val)
        rpr.append(element)

    color(defaults, val="112233")
    normal = document.styles["Normal"]
    base = document.styles.add_style("Qualification paragraph base", WD_STYLE_TYPE.PARAGRAPH)
    base.base_style = normal
    base.font.color.rgb = RGBColor.from_string("225544")
    paragraph_style = document.styles.add_style("Qualification paragraph child", WD_STYLE_TYPE.PARAGRAPH)
    paragraph_style.base_style = base
    strong = document.styles.add_style("Qualification character base", WD_STYLE_TYPE.CHARACTER)
    strong.font.color.rgb = RGBColor.from_string("884422")
    strong.font.bold = True
    character_style = document.styles.add_style("Qualification character child", WD_STYLE_TYPE.CHARACTER)
    character_style.base_style = strong

    theme = document.part.part_related_by(RT.THEME)
    theme_xml = parse_xml(theme.blob)
    ns = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    scheme = theme_xml.find(ns + "themeElements").find(ns + "clrScheme")
    scheme.find(ns + "accent1")[0].set("val", "4F81BD")
    scheme.find(ns + "accent2")[0].set("val", "808080")
    scheme.find(ns + "dk1")[0].set("lastClr", "101820")
    slot = scheme.find(ns + "accent6")
    slot.remove(slot[0])
    etree.SubElement(slot, ns + "prstClr", val="orange")
    theme._blob = etree.tostring(theme_xml, encoding="UTF-8", xml_declaration=True, standalone=True)
    settings = document.settings.element
    mapping = settings.find(qn("w:clrSchemeMapping"))
    if mapping is None:
        mapping = OxmlElement("w:clrSchemeMapping")
        settings.append(mapping)
    mapping.set(qn("w:t1"), "accent2")

    document.add_paragraph("Default α")
    p = document.add_paragraph(style=paragraph_style)
    p.add_run("Inherited paragraph")
    p.add_run("Character style", style=character_style)
    p.add_run("Direct override", style=character_style).font.color.rgb = RGBColor.from_string("AA0033")
    color(p.add_run("Automatic")._r.get_or_add_rPr(), val="auto")
    p = document.add_paragraph()
    color(p.add_run("Theme wins over stale RGB")._r.get_or_add_rPr(), val="FFFFFF", themeColor="accent1")
    color(p.add_run("Mapped text1")._r.get_or_add_rPr(), val="FFFFFF", themeColor="text1")
    color(p.add_run("Saved system RGB")._r.get_or_add_rPr(), val="FFFFFF", themeColor="dark1")
    color(p.add_run("Theme shade")._r.get_or_add_rPr(), val="FFFFFF", themeColor="accent2", themeShade="80")
    p = document.add_paragraph()
    color(p.add_run("Theme tint takes precedence")._r.get_or_add_rPr(), val="FFFFFF", themeColor="accent1", themeShade="00", themeTint="99")
    color(p.add_run("Unsupported theme RGB fallback")._r.get_or_add_rPr(), val="2468AC", themeColor="accent6")
    color(p.add_run("Unsupported theme without RGB")._r.get_or_add_rPr(), val="auto", themeColor="accent6")
    document.add_paragraph().add_run(PAYLOAD).font.color.rgb = RGBColor.from_string("124578")
    document.add_paragraph(TAIL if aligned else "After the payload")
    if aligned:
        def property_element(properties, tag, value=None):
            el = OxmlElement("w:" + tag)
            if value is not None:
                el.set(qn("w:val"), value)
            properties.append(el)
        default_paragraph = document.styles.element.find(qn("w:docDefaults")).find(qn("w:pPrDefault")).find(qn("w:pPr"))
        property_element(default_paragraph, "jc", "center")
        base.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        paragraphs = document.paragraphs
        edges = paragraphs[2]._p.get_or_add_pPr()
        property_element(edges, "bidi")
        property_element(edges, "jc", "end")
        paragraphs[3].alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        property_element(paragraphs[3]._p.pPr, "outlineLvl", "0")
        paragraphs[4].alignment = WD_ALIGN_PARAGRAPH.RIGHT
        paragraphs[5].alignment = WD_ALIGN_PARAGRAPH.DISTRIBUTE
    archive = BytesIO()
    document.save(archive)
    assert archive.tell() <= 131072
    # Make this small generated fixture byte-reproducible between runs. The
    # python-docx package writer otherwise stamps members with wall-clock time.
    with ZipFile(archive) as source, open(file, "xb") as output, ZipFile(output, "w", compression=ZIP_DEFLATED) as target:
        assert len(source.infolist()) <= 32
        assert sum(info.file_size for info in source.infolist()) <= 2 * 1048576
        for part in source.infolist():
            entry = ZipInfo(part.filename, date_time=(2000, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            target.writestr(entry, source.read(part))
    with ZipFile(file) as saved:
        assert saved.testzip() is None
    reopened = docx.Document(file)
    expected = ALIGNED_EXPECTED if aligned else EXPECTED
    assert tuple(p.text for p in reopened.paragraphs) == tuple("".join(segment[0] for segment in p) for p in expected)
    assert reopened.part.part_related_by(RT.THEME).blob == theme.blob
    assert reopened.settings.element.find(qn("w:clrSchemeMapping")).get(qn("w:t1")) == "accent2"
    result = {"generator": "python-docx", "version": docx.__version__, "semanticCases": SEMANTIC_CASES,
              "anchorContentBytes": len(PAYLOAD.encode()), "referencedThemeAndSettings": True,
              "fixedZipTimestamps": True, "zipCrcAndWordReopenVerified": True}
    if aligned:
        paragraphs = reopened.paragraphs
        assert paragraphs[1].style.base_style.paragraph_format.alignment == WD_ALIGN_PARAGRAPH.RIGHT
        assert paragraphs[2]._p.pPr.find(qn("w:bidi")) is not None
        assert paragraphs[2]._p.pPr.find(qn("w:jc")).get(qn("w:val")) == "end"
        assert paragraphs[3]._p.pPr.find(qn("w:outlineLvl")).get(qn("w:val")) == "0"
        assert paragraphs[3].alignment == WD_ALIGN_PARAGRAPH.JUSTIFY
        assert paragraphs[4].alignment == WD_ALIGN_PARAGRAPH.RIGHT
        assert paragraphs[5].alignment == WD_ALIGN_PARAGRAPH.DISTRIBUTE
        result["expectedAlignedParagraphs"] = len(ALIGNMENT)
    print(json.dumps(result))


def reference(aligned=False):
    def segment(text, color, strong):
        value = escape(text)
        if strong:
            value = "<strong>" + value + "</strong>"
        return f'<span style="color:{color}">{value}</span>'

    expected = ALIGNED_EXPECTED if aligned else EXPECTED
    layout = ALIGNMENT if aligned else [("p", None)] * len(expected)
    def paragraph(runs, tag, style):
        style_attr = f' style="{style}"' if style else ""
        return f"<{tag}{style_attr}>" + "".join(segment(*item) for item in runs) + f"</{tag}>"
    return ('<!doctype html><html><head><meta http-equiv="Content-Security-Policy" '
            'content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">'
            '</head><body>' + "".join(paragraph(runs, *style) for runs, style in zip(expected, layout, strict=True))
            + "</body></html>")


class Oracle(HTMLParser):
    def __init__(self, aligned=False):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.paragraphs = []
        self.runs = None
        self.run = None
        self.csp = []
        self.root_count = self.body_count = 0
        self.styles = []
        self.layout = ALIGNMENT if aligned else [("p", None)] * len(EXPECTED)

    def handle_starttag(self, tag, attrs):
        parent = self.stack[-1] if self.stack else None
        attributes = dict(attrs)
        assert len(attrs) == len(attributes)
        if tag == "meta":
            assert parent == "head"
            if set(attributes) == {"http-equiv", "content"}:
                assert attributes["http-equiv"].lower() == "content-security-policy"
                self.csp.append(attributes["content"])
            else:
                assert attributes in ({"charset": "utf-8"}, {"name": "viewport", "content": "width=device-width, initial-scale=1"})
            return
        if tag == "span":
            assert parent in ("p", "h1") and self.runs is not None and self.run is None
            assert set(attributes) == {"style"}
            match = re.fullmatch(r"color:(#[0-9a-f]{6}|CanvasText)", attributes["style"])
            assert match
            self.run = [match[1], False, hashlib.sha256(), 0]
        else:
            if tag in ("p", "h1"):
                assert len(self.paragraphs) < len(self.layout)
                expected_tag, style = self.layout[len(self.paragraphs)]
                assert tag == expected_tag and attributes == ({"style": style} if style else {})
            else:
                assert not attrs
            assert (tag, parent) in {("html", None), ("head", "html"), ("body", "html"), ("title", "head"),
                                     ("style", "head"), ("p", "body"), ("h1", "body"), ("strong", "span")}
            if tag == "html":
                self.root_count += 1
            if tag == "body":
                self.body_count += 1
            if tag in ("p", "h1"):
                assert self.runs is None
                self.runs = []
            if tag == "strong":
                assert self.run is not None and not self.run[1] and self.run[3] == 0
                self.run[1] = True
        self.stack.append(tag)

    def handle_endtag(self, tag):
        assert self.stack and self.stack.pop() == tag
        if tag == "span":
            self.runs.append((self.run[0], self.run[1], self.run[2].hexdigest(), self.run[3]))
            self.run = None
        if tag in ("p", "h1"):
            assert len(self.paragraphs) < len(EXPECTED)
            self.paragraphs.append(tuple(self.runs))
            self.runs = None

    def handle_data(self, data):
        tag = self.stack[-1] if self.stack else None
        if tag in ("span", "strong"):
            # Require every character in an emphasized segment to have the same nesting.
            assert (tag == "strong") == self.run[1]
            chunk = data.encode()
            self.run[2].update(chunk)
            self.run[3] += len(chunk)
        elif tag == "style":
            self.styles.append(data)
            assert sum(map(len, self.styles)) <= 512
        elif tag != "title":
            assert not data.strip()

    def handle_comment(self, data):
        raise AssertionError("Unexpected comment in generated HTML")

    def handle_pi(self, data):
        raise AssertionError("Unexpected processing instruction in generated HTML")

    def unknown_decl(self, data):
        raise AssertionError("Unexpected declaration in generated HTML")

    def handle_decl(self, decl):
        assert decl.lower() == "doctype html"


def validate(file, aligned=False):
    oracle = Oracle(aligned)
    decoder = codecs.getincrementaldecoder("utf-8")("strict")
    digest = hashlib.sha256()
    size = 0
    with open(file, "rb") as source:
        while chunk := source.read(65536):
            size += len(chunk)
            assert size <= 1048576
            digest.update(chunk)
            oracle.feed(decoder.decode(chunk))
    oracle.feed(decoder.decode(b"", final=True))
    oracle.close()
    assert not oracle.stack and oracle.run is None and oracle.runs is None
    assert oracle.root_count == oracle.body_count == 1
    assert oracle.csp == ["default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"]
    assert "".join(oracle.styles) in ("", "body{font-family:system-ui,sans-serif;line-height:1.5;max-width:80ch;margin:2rem auto;padding:0 1rem}"
                                          "p{white-space:pre-wrap}table{border-collapse:collapse}td{vertical-align:top;padding:.25rem .5rem}")
    gold = [tuple((color, strong, hashlib.sha256(text.encode()).hexdigest(), len(text.encode()))
                  for text, color, strong in p) for p in (ALIGNED_EXPECTED if aligned else EXPECTED)]
    assert oracle.paragraphs == gold, "Expected per-run text, color, structure or emphasis differs"
    result = {"bytes": size, "sha256": digest.hexdigest(), "semanticCases": SEMANTIC_CASES,
              "allRunTextColorAndEmphasisVerified": True, "independentHardcodedOracle": True}
    if aligned:
        result["alignmentCases"] = len(oracle.paragraphs)
        result["allParagraphAlignmentAndStructureVerified"] = True
    print(json.dumps(result))


if __name__ == "__main__":
    if not __debug__:
        raise RuntimeError("Fixture validation must run with assertions enabled")
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    args = sys.argv[1:]
    aligned = bool(args and args[-1] == "--paragraph-alignment")
    if aligned:
        args.pop()
    mode = args[0]
    if mode == "generate":
        assert len(args) == 2
        generate(args[1], aligned)
    elif mode == "reference":
        assert len(args) == 1
        print(reference(aligned))
    elif mode == "validate":
        assert len(args) == 2
        validate(args[1], aligned)
    else:
        raise ValueError(mode)
