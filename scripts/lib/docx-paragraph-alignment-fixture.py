"""Independent real Word-package generator and static HTML structure oracle."""

from html.parser import HTMLParser
from io import BytesIO
import sys
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from docx import Document, __version__ as docx_version
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


EXPECTED = (
    ("p", "Document default", "center"),
    ("h1", "Right heading", "right"),
    ("p", "Inherited right", "right"),
    ("p", "Direct justify & override", "justify"),
    ("p", "שלום 123 English", "right"),
    ("p", "Direction reset", "left"),
    ("p", "Normalized special mode", None),
    ("p", "Nested cell 🧪", "right"),
)


def set_bidi(properties, value=None):
    bidi = OxmlElement("w:bidi")
    if value is not None:
        bidi.set(qn("w:val"), value)
    # w:bidi precedes w:jc in the paragraph-properties schema.
    properties.insert_element_before(bidi, "w:jc")


def fixture():
    assert docx_version == "1.2.0", "Use python-docx 1.2.0 for the controlled fixture."
    doc = Document()
    doc.core_properties.title = "Bounded paragraph alignment control"
    ppr_default = doc.styles.element.find(qn("w:docDefaults")).find(qn("w:pPrDefault")).find(qn("w:pPr"))
    default_jc = OxmlElement("w:jc")
    default_jc.set(qn("w:val"), "center")
    ppr_default.append(default_jc)
    doc.add_paragraph(EXPECTED[0][1])
    doc.styles["Heading 1"].paragraph_format.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    doc.add_heading(EXPECTED[1][1], 1)
    base = doc.styles.add_style("Within Alignment Base", WD_STYLE_TYPE.PARAGRAPH)
    base.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    child = doc.styles.add_style("Within Alignment Child", WD_STYLE_TYPE.PARAGRAPH)
    child.base_style = base
    doc.add_paragraph(EXPECTED[2][1], child)
    doc.add_paragraph(EXPECTED[3][1], child).alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    rtl = doc.styles.add_style("Within Alignment RTL", WD_STYLE_TYPE.PARAGRAPH)
    rtl.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    set_bidi(rtl.element.get_or_add_pPr())
    doc.add_paragraph(EXPECTED[4][1], rtl)
    set_bidi(doc.add_paragraph(EXPECTED[5][1], rtl)._p.get_or_add_pPr(), "0")
    doc.add_paragraph(EXPECTED[6][1]).alignment = WD_ALIGN_PARAGRAPH.DISTRIBUTE
    cell = doc.add_table(rows=1, cols=1).cell(0, 0)
    cell.text = EXPECTED[7][1]
    cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT

    original, deterministic = BytesIO(), BytesIO()
    doc.save(original)
    with ZipFile(original) as source, ZipFile(deterministic, "w") as target:
        assert source.testzip() is None
        for name in sorted(source.namelist()):
            target.writestr(ZipInfo(name), source.read(name), compress_type=ZIP_DEFLATED, compresslevel=6)
    assert len(deterministic.getbuffer()) <= 65536
    with ZipFile(deterministic) as package:
        assert package.testzip() is None
    reopened = Document(deterministic)
    assert [p.text for p in reopened.paragraphs] == [item[1] for item in EXPECTED[:-1]]
    assert reopened.paragraphs[2].style.base_style.paragraph_format.alignment == WD_ALIGN_PARAGRAPH.RIGHT
    assert reopened.paragraphs[3].alignment == WD_ALIGN_PARAGRAPH.JUSTIFY
    assert reopened.paragraphs[4].style.element.pPr.find(qn("w:bidi")) is not None
    assert reopened.paragraphs[5]._p.pPr.find(qn("w:bidi")).get(qn("w:val")) == "0"
    assert reopened.paragraphs[6].alignment == WD_ALIGN_PARAGRAPH.DISTRIBUTE
    assert reopened.tables[0].cell(0, 0).text == EXPECTED[7][1]
    sys.stdout.buffer.write(deterministic.getvalue())


class AlignmentOracle(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        assert tag not in ("script", "link", "iframe", "img", "object")
        attrs = dict(attrs)
        assert "dir" not in attrs and all(not name.startswith("on") for name in attrs)
        if tag in ("p", "h1"):
            assert self.current is None
            declarations = dict(part.split(":", 1) for part in attrs.get("style", "").split(";") if part)
            expected_keys = {"text-align", "white-space"} if tag == "h1" else {"text-align"}
            assert set(declarations) <= expected_keys
            if tag == "h1":
                assert declarations.get("white-space") == "pre-wrap"
            self.current = tag, [], declarations.get("text-align")

    def handle_data(self, data):
        if self.current:
            self.current[1].append(data)

    def handle_endtag(self, tag):
        if tag in ("p", "h1"):
            assert self.current and self.current[0] == tag
            self.items.append((tag, "".join(self.current[1]), self.current[2]))
            self.current = None


if __name__ == "__main__":
    if sys.argv[1:] == ["generate"]:
        fixture()
    elif sys.argv[1:] == ["verify"]:
        raw = sys.stdin.buffer.read(65537)
        assert len(raw) <= 65536
        oracle = AlignmentOracle()
        oracle.feed(raw.decode("utf-8"))
        oracle.close()
        assert oracle.current is None and tuple(oracle.items) == EXPECTED
        print(len(oracle.items))
    else:
        raise SystemExit("Expected generate or verify.")
