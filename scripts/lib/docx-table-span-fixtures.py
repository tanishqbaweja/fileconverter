"""Small native DOCX fixture and independent output oracle; never converts the DOCX."""
import codecs
import hashlib
import json
import sys
from html.parser import HTMLParser
from xml.etree import ElementTree
from zipfile import ZipFile


REFERENCE = (
    '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" '
    'content="default-src \'none\'"></head><body><p>Before β &amp; &lt;script&gt;</p>'
    '<table><tr><td colspan="2"><p>Cell one</p><table><tr><td colspan="2">'
    '<p>Nested</p></td><td><p>Nested plain</p></td></tr></table><p></p></td>'
    '<td><p>Cell two</p></td></tr><tr><td><p>A</p></td><td><p>B</p></td>'
    '<td><p>C</p></td></tr></table><p>After</p></body></html>'
)


class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.paragraph = None
        self.csp = False

    def handle_starttag(self, tag, attrs):
        assert tag in {"html", "head", "meta", "title", "style", "body", "table", "tr", "td", "p"}, tag
        if tag in {"table", "tr", "td", "p"}:
            assert len(self.tags) < 64
            if tag == "p":
                assert self.paragraph is None
                self.paragraph = []
            else:
                assert not attrs or (tag == "td" and attrs == [("colspan", "2")]), attrs
                self.tags.append((tag, tuple(attrs)))
        if tag == "meta" and dict(attrs).get("http-equiv", "").lower() == "content-security-policy":
            self.csp = "default-src 'none'" in dict(attrs).get("content", "")

    def handle_endtag(self, tag):
        if tag == "p":
            assert self.paragraph is not None
            self.tags.append(("paragraph", "".join(self.paragraph)))
            self.paragraph = None
        elif tag in {"table", "tr", "td"}:
            self.tags.append(("/" + tag, ()))

    def handle_data(self, text):
        if self.paragraph is not None:
            assert len(self.paragraph) < 64 and len(text) < 512
            self.paragraph.append(text)


def generate(path):
    import docx

    doc = docx.Document()
    doc.add_paragraph("Before β & <script>")
    table = doc.add_table(rows=2, cols=3)
    cell = table.cell(0, 0).merge(table.cell(0, 1))
    cell.text = "Cell one"
    nested = cell.add_table(rows=1, cols=3)
    nested.cell(0, 0).merge(nested.cell(0, 1)).text = "Nested"
    nested.cell(0, 2).text = "Nested plain"
    table.cell(0, 2).text = "Cell two"
    for col, text in enumerate("ABC"):
        table.cell(1, col).text = text
    doc.add_paragraph("After")
    with open(path, "xb") as f:
        doc.save(f)
    with ZipFile(path) as z, z.open("word/document.xml") as f:
        xml = f.read(65537)
    assert len(xml) <= 65536
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    root = ElementTree.fromstring(xml)
    spans = [node.attrib["{" + namespace["w"] + "}val"] for node in root.findall(".//w:tcPr/w:gridSpan", namespace)]
    assert spans == ["2", "2"]
    print(json.dumps({"generator": "python-docx", "version": docx.__version__, "wordGridSpans": [2, 2]}))


def validate(path):
    reference, actual = Document(), Document()
    reference.feed(REFERENCE)
    reference.close()
    digest = hashlib.sha256()
    decoder = codecs.getincrementaldecoder("utf-8")("strict")
    with open(path, "rb") as f:
        raw = f.read(65537)
    assert len(raw) <= 65536, "Small fixture validator only"
    digest.update(raw)
    actual.feed(decoder.decode(raw, final=True))
    actual.close()
    assert actual.paragraph is None and actual.csp
    assert actual.tags == reference.tags, actual.tags
    print(json.dumps({"sha256": digest.hexdigest(), "columnSpans": [int(attrs[0][1]) for tag, attrs in actual.tags if tag == "td" and attrs],
                      "tableCells": sum(tag == "td" for tag, _ in actual.tags), "nestedStructureVerified": True,
                      "exactParagraphContentVerified": True, "csp": actual.csp}))


if __name__ == "__main__":
    if sys.argv[1:] == ["reference"]:
        sys.stdout.buffer.write(REFERENCE.encode("utf-8"))
    else:
        assert len(sys.argv) == 3 and sys.argv[1] in {"generate", "validate"}
        {"generate": generate, "validate": validate}[sys.argv[1]](sys.argv[2])
