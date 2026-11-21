"""Genuine Word package generation and independent HTML semantic validation."""

import hashlib
from html.parser import HTMLParser
import json
from io import BytesIO
from pathlib import Path
import sys
from zipfile import ZipFile, ZipInfo

import docx
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

PAD = "Drift 😀 & ".join(["λ"] * 9001)
EXPECTED = [
    [("Inherited document default", "sub", False), (" reset ", None, False), ("default again", "sub", False)],
    [("Parent superscript", "sup", False), (" child & < Ω", "sub", True), (" character reset", None, True),
     (" direct wins", "sup", True)],
    [("x", None, False), ("2", "sup", False), (" + H", None, False), ("2", "sub", False), ("O", None, False)],
    [(PAD, "sup", True), (" Plain tail", None, False)],
]


def property_element(owner, name, value):
    if name == "vertAlign":
        owner.get_or_add_vertAlign().set(qn("w:val"), value)
        return
    assert name == "position"
    element = OxmlElement(f"w:{name}")
    element.set(qn("w:val"), value)
    owner.insert_element_before(element, "w:vertAlign")


def generate(target):
    assert docx.__version__ == "1.2.0"
    document = docx.Document()
    defaults = document.styles.element.find(qn("w:docDefaults")).find(qn("w:rPrDefault")).find(qn("w:rPr"))
    property_element(defaults, "vertAlign", "subscript")
    parent = document.styles.add_style("Fixture Raised Paragraph", WD_STYLE_TYPE.PARAGRAPH)
    parent.font.superscript = True
    derived = document.styles.add_style("Fixture Inherited Paragraph", WD_STYLE_TYPE.PARAGRAPH)
    derived.base_style = parent
    lowered = document.styles.add_style("Fixture Lowered", WD_STYLE_TYPE.CHARACTER)
    lowered.font.subscript = True
    lowered.font.bold = True
    derived_child = document.styles.add_style("Fixture Inherited Character", WD_STYLE_TYPE.CHARACTER)
    derived_child.base_style = lowered
    reset_child = document.styles.add_style("Fixture Baseline", WD_STYLE_TYPE.CHARACTER)
    reset_child.base_style = lowered
    property_element(reset_child.element.get_or_add_rPr(), "vertAlign", "baseline")

    def baseline(paragraph, text):
        item = paragraph.add_run(text)
        property_element(item._element.get_or_add_rPr(), "vertAlign", "baseline")
        return item

    p = document.add_paragraph()
    p.add_run("Inherited document default")
    baseline(p, " reset ")
    p.add_run("default again")
    p = document.add_paragraph(style=derived)
    p.add_run("Parent superscript")
    p.add_run(" child & < Ω", style=derived_child)
    p.add_run(" character reset", style=reset_child)
    p.add_run(" direct wins", style=derived_child).font.superscript = True
    p = document.add_paragraph()
    baseline(p, "x")
    p.add_run("2").font.superscript = True
    baseline(p, " + H")
    p.add_run("2").font.subscript = True
    baseline(p, "O")
    p = document.add_paragraph()
    pad = p.add_run(PAD)
    pad.font.bold = True
    pad.font.superscript = True
    tail = baseline(p, " Plain tail")
    property_element(tail._element.get_or_add_rPr(), "position", "18")

    # Stabilize ZIP metadata rather than retaining generated office files.
    raw = BytesIO()
    document.save(raw)
    with ZipFile(raw) as source, ZipFile(target, "x") as output:
        for item in source.infolist():
            fixed = ZipInfo(item.filename, (2000, 1, 1, 0, 0, 0))
            output.writestr(fixed, source.read(item), compress_type=item.compress_type)
    with ZipFile(target) as source:
        assert source.testzip() is None
    reopened = docx.Document(target)
    assert [paragraph.text for paragraph in reopened.paragraphs] == ["".join(t[0] for t in row) for row in EXPECTED]
    assert reopened.styles[derived.name].base_style.font.superscript is True
    assert reopened.styles[derived_child.name].base_style.font.subscript is True
    assert reopened.paragraphs[1].runs[-1].font.superscript is True
    return {"generator": "python-docx", "version": docx.__version__, "bytes": target.stat().st_size, "zipCrcAndReopenVerified": True}


class SemanticParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.paragraphs = []
        self.current = None
        self.tags = []
        self.finished = False

    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        if tag == "p":
            assert self.current is None and not self.tags
            self.current = []
        elif tag in {"sup", "sub", "strong"}:
            assert self.current is not None and not attrs and tag not in self.tags
            assert tag == "strong" or not any(t in {"sup", "sub"} for t in self.tags)
            self.tags.append(tag)
        elif self.current is not None:
            raise AssertionError(f"Unexpected paragraph markup: {tag}")
        elif tag == "meta" and attr.get("http-equiv") == "Content-Security-Policy":
            assert "default-src 'none'" in attr["content"]

    def handle_endtag(self, tag):
        if tag == "p":
            assert self.current is not None and not self.tags
            self.paragraphs.append(self.current)
            self.current = None
        elif tag in {"sup", "sub", "strong"}:
            assert self.tags and self.tags.pop() == tag
        elif tag == "html":
            self.finished = True

    def handle_data(self, text):
        if self.current is None:
            return
        flags = (next((t for t in self.tags if t in {"sup", "sub"}), None), "strong" in self.tags)
        if self.current and self.current[-1][1:] == flags:
            self.current[-1] = (self.current[-1][0] + text, *flags)
        else:
            self.current.append((text, *flags))


def validate(target):
    assert 0 < target.stat().st_size <= 512 * 1024
    parser = SemanticParser()
    with target.open(encoding="utf-8", newline="") as source:
        while text := source.read(8192):
            parser.feed(text)
    parser.close()
    assert parser.finished and parser.current is None and parser.paragraphs == EXPECTED, "Wrong vertical layout, text or emphasis"
    with target.open("rb") as source:
        sha = hashlib.file_digest(source, "sha256").hexdigest()
    return {"bytes": target.stat().st_size, "sha256": sha, "paragraphs": len(EXPECTED),
            "segments": sum(map(len, EXPECTED)), "validator": "independent Python HTMLParser"}


if __name__ == "__main__":
    assert len(sys.argv) == 3 and sys.argv[1] in {"generate", "validate"}
    action = generate if sys.argv[1] == "generate" else validate
    print(json.dumps(action(Path(sys.argv[2]))))
