"""Generate a small native DOCX and validate its browser-produced HTML independently."""
import codecs
import hashlib
import json
import sys
from html.parser import HTMLParser
from xml.etree import ElementTree
from zipfile import ZipFile


PAYLOAD = "α😀0123456789" * 9000
TAIL = "tail Ω " * 9000
LIMIT = 512 * 1024
WORD = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
REFERENCE = (
    '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" '
    'content="default-src \'none\'"></head><body><p>Before</p>'
    '<table><tr><td colspan="2" rowspan="00002"><p>' + PAYLOAD + '</p>'
    '<table><tr><td><p>Nested</p></td></tr></table><p></p></td><td><p>Cell two</p></td></tr>'
    '<tr><td><p>Continued row sibling</p></td></tr>'
    '<tr><td><p>A</p></td><td><p>B</p></td><td><p>C</p></td></tr></table>'
    '<p>' + TAIL + '</p><p>After patch</p></body></html>'
)


class Oracle(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.events = []
        self.text = None
        self.csp = False

    def handle_starttag(self, tag, attrs):
        assert tag in {"html", "head", "meta", "title", "style", "body", "table", "tr", "td", "p"}, tag
        if tag in {"table", "tr", "td", "p"}:
            assert len(self.events) < 64
            if tag == "p":
                assert self.text is None and not attrs
                self.text = hashlib.sha256()
            else:
                assert not attrs or (tag == "td" and attrs == [("colspan", "2"), ("rowspan", "00002")]), attrs
                self.events.append((tag, tuple(attrs)))
        if tag == "meta" and dict(attrs).get("http-equiv", "").lower() == "content-security-policy":
            self.csp = "default-src 'none'" in dict(attrs).get("content", "")

    def handle_endtag(self, tag):
        if tag == "p":
            assert self.text is not None
            self.events.append((tag, self.text.hexdigest()))
            self.text = None
        elif tag in {"table", "tr", "td"}:
            self.events.append(("/" + tag, ()))

    def handle_data(self, text):
        if self.text is not None:
            self.text.update(text.encode("utf-8"))


def generate(file):
    import docx

    doc = docx.Document()
    doc.add_paragraph("Before")
    table = doc.add_table(rows=3, cols=3)
    cell = table.cell(0, 0).merge(table.cell(1, 1))
    cell.text = PAYLOAD
    cell.add_table(rows=1, cols=1).cell(0, 0).text = "Nested"
    table.cell(0, 2).text = "Cell two"
    table.cell(1, 2).text = "Continued row sibling"
    for index, letter in enumerate("ABC"):
        table.cell(2, index).text = letter
    doc.add_paragraph(TAIL)
    doc.add_paragraph("After patch")
    with open(file, "xb") as stream:
        doc.save(stream)
    with ZipFile(file) as z, z.open("word/document.xml") as stream:
        data = stream.read(LIMIT + 1)
    assert len(data) <= LIMIT
    xml = ElementTree.fromstring(data)
    pairs = [(p.find(WORD + "gridSpan").get(WORD + "val"), p.find(WORD + "vMerge").get(WORD + "val", "continue"))
             for p in xml.iter(WORD + "tcPr") if p.find(WORD + "vMerge") is not None]
    assert pairs == [("2", "restart"), ("2", "continue")], pairs
    print(json.dumps({"generator": "python-docx", "version": docx.__version__, "wordGridSpans": [2, 2],
                      "verticalMergeRoles": [p[1] for p in pairs], "anchorContentBytes": len(PAYLOAD.encode("utf-8"))}))


def validate(file):
    expected, actual = Oracle(), Oracle()
    expected.feed(REFERENCE)
    expected.close()
    decoder = codecs.getincrementaldecoder("utf-8")("strict")
    count, offset = 0, -1
    digest = hashlib.sha256()
    with open(file, "rb") as stream:
        while block := stream.read(4096):
            if count == 0:
                offset = block.find(b'rowspan="00002"')
            count += len(block)
            assert count <= LIMIT
            digest.update(block)
            actual.feed(decoder.decode(block))
    actual.feed(decoder.decode(b"", final=True))
    actual.close()
    assert actual.csp and actual.text is None and actual.events == expected.events, actual.events
    assert offset >= 0 and count > 3 * 65536
    cells = [dict(attrs) for tag, attrs in actual.events if tag == "td"]
    print(json.dumps({"sha256": digest.hexdigest(), "columnSpans": [int(a["colspan"]) for a in cells if "colspan" in a],
                      "rowSpans": [int(a["rowspan"]) for a in cells if "rowspan" in a], "outputBytes": count,
                      "rowSpanDigitsByteOffset": offset + len('rowspan="'), "tableCells": len(cells),
                      "nestedStructureVerified": True, "allTextAndPostPatchTailVerified": True, "csp": True}))


if __name__ == "__main__":
    if sys.argv[1:] == ["reference"]:
        sys.stdout.buffer.write(REFERENCE.encode("utf-8"))
    else:
        assert len(sys.argv) == 3 and sys.argv[1] in {"generate", "validate"}
        {"generate": generate, "validate": validate}[sys.argv[1]](sys.argv[2])
