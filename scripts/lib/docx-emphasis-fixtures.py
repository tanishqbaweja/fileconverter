"""Small native fixture and independent semantic validator; never conversion."""
import hashlib
from html.parser import HTMLParser
import json
import sys

EXPECTED = [
    ('p', [('Defaults', 'strong em')]),
    ('p', [('Paragraph inheritance', 'strong')]),
    ('p', [('Paragraph toggle', '')]),
    ('p', [('Character inherited', 'strong em u s')]),
    ('p', [('Character toggle', 'u s')]),
    ('p', [('Direct override', 'strong')]),
    ('p', [('Paragraph mark ignored', 'strong em')]),
    ('p', [('Wrong character type', 'strong em')]),
    ('p', [('Mixed first', 'strong em'), ('Mixed second', 'u s'), ('Mixed third', '')]),
    ('h1', [('Heading emphasis', 'strong em')]),
    ('p', [('Cell one', 'strong em')]),
    ('p', [('Cell two', 'strong em')]),
    ('p', [('False style keeps inherited', 'strong em u s')]),
]


def reference():
    from html import escape
    body = []
    for tag, segments in EXPECTED:
        value = ''
        for text, emphasis in segments:
            tags = emphasis.split()
            value += ''.join('<' + t + '>' for t in tags) + escape(text) + ''.join('</' + t + '>' for t in reversed(tags))
        body.append('<' + tag + '>' + value + '</' + tag + '>')
    # The two table-cell paragraphs have the same expected positions as source.
    body[10:12] = ['<table><tr><td>' + body[10] + '</td><td>' + body[11] + '</td></tr></table>']
    print('<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body>' + ''.join(body) + '</body></html>')


def generate(target):
    import datetime
    import io
    import zipfile
    import docx
    from docx.enum.style import WD_STYLE_TYPE
    from docx.enum.text import WD_UNDERLINE
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    assert docx.__version__ == '1.2.0'
    d = docx.Document()
    d.core_properties.created = d.core_properties.modified = datetime.datetime(2026, 1, 1)
    normal = d.styles['Normal']
    normal.font.bold = True
    defaults = d.styles.element.find(qn('w:docDefaults')).find(qn('w:rPrDefault')).find(qn('w:rPr'))
    for node in list(defaults):
        if node.tag == qn('w:i'):
            defaults.remove(node)
    defaults.append(OxmlElement('w:i'))
    p = d.styles.add_style('EmphasisParagraph', WD_STYLE_TYPE.PARAGRAPH)
    p.base_style = normal
    p.font.italic = True
    p2 = d.styles.add_style('EmphasisParagraphToggle', WD_STYLE_TYPE.PARAGRAPH)
    p2.base_style = p
    p2.font.bold = True
    c = d.styles.add_style('EmphasisCharacter', WD_STYLE_TYPE.CHARACTER)
    c.base_style = d.styles['Default Paragraph Font']
    c.font.underline = WD_UNDERLINE.DOUBLE
    c.font.strike = True
    c2 = d.styles.add_style('EmphasisCharacterToggle', WD_STYLE_TYPE.CHARACTER)
    c2.base_style = c
    c2.font.bold = c2.font.italic = True
    cf = d.styles.add_style('EmphasisCharacterFalse', WD_STYLE_TYPE.CHARACTER)
    cf.base_style = c
    cf.font.bold = cf.font.italic = cf.font.strike = False
    d.add_paragraph('Defaults')
    d.add_paragraph('Paragraph inheritance', style=p)
    d.add_paragraph('Paragraph toggle', style=p2)
    d.add_paragraph().add_run('Character inherited', style=c)
    d.add_paragraph().add_run('Character toggle', style=c2)
    direct = d.add_paragraph().add_run('Direct override', style=c2)
    direct.bold = True
    direct.italic = direct.underline = direct.font.strike = False
    mark = d.add_paragraph('Paragraph mark ignored')
    mark_rpr = OxmlElement('w:rPr')
    mark_rpr.append(OxmlElement('w:b'))
    mark._p.get_or_add_pPr().append(mark_rpr)
    wrong = d.add_paragraph().add_run('Wrong character type')
    wrong_style = OxmlElement('w:rStyle')
    wrong_style.set(qn('w:val'), 'Normal')
    wrong._r.get_or_add_rPr().append(wrong_style)
    mixed = d.add_paragraph()
    mixed.add_run('Mixed first')
    mixed.add_run('Mixed second', style=c2)
    plain = mixed.add_run('Mixed third')
    plain.bold = plain.italic = plain.underline = plain.font.strike = False
    heading = d.add_paragraph('Heading emphasis')
    outline = OxmlElement('w:outlineLvl')
    outline.set(qn('w:val'), '0')
    heading._p.get_or_add_pPr().append(outline)
    table = d.add_table(rows=1, cols=2)
    table.cell(0, 0).text = 'Cell one'
    table.cell(0, 1).text = 'Cell two'
    d.add_paragraph().add_run('False style keeps inherited', style=cf)
    buffer = io.BytesIO()
    d.save(buffer)
    assert buffer.tell() <= 131072
    buffer.seek(0)
    with zipfile.ZipFile(buffer) as original:
        assert len(original.infolist()) <= 32 and sum(p.file_size for p in original.infolist()) <= 2097152
        with open(target, 'xb') as sink, zipfile.ZipFile(sink, 'w', compression=zipfile.ZIP_DEFLATED) as canonical:
            for part in sorted(original.infolist(), key=lambda p: p.filename):
                assert part.file_size <= 1048576
                info = zipfile.ZipInfo(part.filename, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                canonical.writestr(info, original.read(part))
    print(json.dumps({'fixtureGenerator': 'python-docx', 'version': docx.__version__, 'styleDefinitions': len(d.styles),
                      'semanticBlocks': len(EXPECTED), 'expectedTextSegments': 15, 'packageCapBytes': 131072,
                      'canonicalZipMetadata': True, 'nativeConversionUsed': False}))


def validate(file):
    import codecs

    class Document(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.stack, self.blocks = [], []
            self.current = None
            self.csp, self.cells = False, 0

        def handle_starttag(self, tag, attrs):
            assert tag in ['html', 'head', 'meta', 'title', 'style', 'body', 'p', 'h1', 'strong', 'em', 'u', 's', 'table', 'tr', 'td']
            assert not any(k.startswith('on') or k in ['src', 'href'] for k, _ in attrs)
            if tag == 'meta':
                values = dict(attrs)
                if values.get('http-equiv', '').lower() == 'content-security-policy':
                    self.csp = "default-src 'none'" in values.get('content', '')
                return
            self.stack.append(tag)
            assert len(self.stack) <= 32
            if tag in ['p', 'h1']:
                assert self.current is None
                self.current = [tag, []]
            if tag == 'td':
                self.cells += 1

        def handle_endtag(self, tag):
            assert self.stack and self.stack.pop() == tag
            if tag in ['p', 'h1']:
                assert self.current is not None
                self.blocks.append((self.current[0], self.current[1]))
                assert len(self.blocks) <= 13
                self.current = None

        def handle_data(self, text):
            if self.current is None:
                return
            active = ' '.join(t for t in ['strong', 'em', 'u', 's'] if t in self.stack)
            segments = self.current[1]
            if segments and segments[-1][1] == active:
                segments[-1] = (segments[-1][0] + text, active)
            else:
                segments.append((text, active))
            assert len(segments) <= 3 and sum(len(t) for t, _ in segments) <= 1024

    parser, digest = Document(), hashlib.sha256()
    decoder = codecs.getincrementaldecoder('utf-8')('strict')
    with open(file, 'rb') as source:
        while chunk := source.read(65536):
            digest.update(chunk)
            parser.feed(decoder.decode(chunk))
    parser.feed(decoder.decode(b'', True))
    parser.close()
    assert parser.blocks == EXPECTED, parser.blocks
    assert not parser.stack and parser.current is None and parser.csp and parser.cells == 2
    print(json.dumps({'sha256': digest.hexdigest(), 'blocks': len(parser.blocks), 'textSegments': 15, 'tableCells': 2,
                      'supportedStyleEmphasisComparedPerTextSegment': True, 'csp': True,
                      'independentValidator': 'Python streaming HTMLParser; hardcoded exact text/block/emphasis oracle, not Word rendering or complete OOXML validation'}))


if __name__ == '__main__':
    assert len(sys.argv) in [2, 3]
    if sys.argv[1] == 'reference':
        assert len(sys.argv) == 2
        reference()
    else:
        assert len(sys.argv) == 3 and sys.argv[1] in ['generate', 'validate']
        (generate if sys.argv[1] == 'generate' else validate)(sys.argv[2])
