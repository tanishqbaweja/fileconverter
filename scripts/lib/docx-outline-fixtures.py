"""Bounded Word fixture generation and independent HTML validation, never conversion."""
import hashlib
from html.parser import HTMLParser
import json
import sys


def generate(target):
    import datetime
    import io
    import zipfile
    import docx
    from docx.enum.style import WD_STYLE_TYPE
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    document = docx.Document()
    document.core_properties.created = datetime.datetime(2026, 1, 1)
    document.core_properties.modified = datetime.datetime(2026, 1, 1)

    def outline(properties, value):
        node = OxmlElement('w:outlineLvl')
        node.set(qn('w:val'), str(value))
        properties.append(node)

    base = document.styles.add_style('OutlineBase', WD_STYLE_TYPE.PARAGRAPH)
    base.base_style = document.styles['Normal']
    outline(base.element.get_or_add_pPr(), 1)
    derived = document.styles.add_style('OutlineDerived', WD_STYLE_TYPE.PARAGRAPH)
    derived.base_style = base
    document.add_heading('Outline \u03b1 \U0001f600', 1)
    document.add_paragraph('Inherited heading', style=derived)
    body = document.add_paragraph('Body override', style=derived)
    outline(body._p.get_or_add_pPr(), 9)
    document.add_heading('Third level', 3)
    deep = document.add_paragraph('Deep outline')
    outline(deep._p.get_or_add_pPr(), 8)
    run = document.add_paragraph().add_run('Direct emphasis')
    run.bold = True
    run.italic = True
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text = 'Cell one'
    table.cell(0, 1).text = 'Cell two'
    # This is a deliberately SMALL native-generated fixture, not a user input or
    # large-file conversion. The complete package and every part have fixed caps.
    buffer = io.BytesIO()
    document.save(buffer)
    assert buffer.tell() <= 131072
    buffer.seek(0)
    with zipfile.ZipFile(buffer) as original:
        assert len(original.infolist()) <= 32
        assert sum(part.file_size for part in original.infolist()) <= 2 * 1048576
        with open(target, 'xb') as sink:
            with zipfile.ZipFile(sink, 'w', compression=zipfile.ZIP_DEFLATED, allowZip64=False) as canonical:
                for part in sorted(original.infolist(), key=lambda item: item.filename):
                    assert part.file_size <= 1048576
                    info = zipfile.ZipInfo(part.filename, date_time=(2026, 1, 1, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_DEFLATED
                    canonical.writestr(info, original.read(part))
    print(json.dumps({'fixtureGenerator': 'python-docx', 'version': docx.__version__, 'styleDefinitions': len(document.styles),
                      'canonicalZipMetadata': True, 'smallFixturePackageCapBytes': 131072,
                      'nativeConversionUsed': False, 'semanticBlocks': 8}))


def validate(file):
    import codecs
    expected = [('h1', 'Outline ' + chr(945) + ' ' + chr(128512)),
                ('h2', 'Inherited heading'), ('p', 'Body override'), ('h3', 'Third level'),
                ('p', 'Deep outline'), ('p', 'Direct emphasis'), ('p', 'Cell one'), ('p', 'Cell two')]

    class Document(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.blocks = []
            self.current = None
            self.heading_levels = []
            self.csp = False
            self.tags = {}
            self.stack = []

        def handle_starttag(self, tag, attrs):
            assert tag in ['html', 'head', 'meta', 'title', 'style', 'body', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'table', 'tr', 'td']
            assert not any(key.startswith('on') or key in ['href', 'src'] for key, _ in attrs)
            self.tags[tag] = self.tags.get(tag, 0) + 1
            if tag != 'meta':
                self.stack.append(tag)
            values = dict(attrs)
            if tag == 'meta' and values.get('http-equiv', '').lower() == 'content-security-policy':
                self.csp = "default-src 'none'" in values.get('content', '')
            if tag in ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                assert self.current is None
                self.current = [tag, '']
                if tag.startswith('h'):
                    self.heading_levels.append(int(tag[1:]))
                elif values.get('role') == 'heading':
                    self.heading_levels.append(int(values['aria-level']))

        def handle_endtag(self, tag):
            assert self.stack and self.stack.pop() == tag
            if tag in ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                assert self.current is not None and self.current[0] == tag
                self.blocks.append(tuple(self.current))
                assert len(self.blocks) <= 8
                self.current = None

        def handle_data(self, data):
            if self.current is not None:
                self.current[1] += data
                assert len(self.current[1]) <= 1024

    parser = Document()
    digest = hashlib.sha256()
    decoder = codecs.getincrementaldecoder('utf-8')('strict')
    with open(file, 'rb') as source:
        while True:
            chunk = source.read(65536)
            if not chunk:
                break
            digest.update(chunk)
            parser.feed(decoder.decode(chunk))
        parser.feed(decoder.decode(b'', True))
        parser.close()
    assert parser.blocks == expected and not parser.stack, parser.blocks
    assert parser.heading_levels == [1, 2, 3, 9], parser.heading_levels
    assert parser.tags['strong'] == 1 and parser.tags['em'] == 1
    assert parser.tags['table'] == 1 and parser.tags['td'] == 2 and parser.csp
    print(json.dumps({'sha256': digest.hexdigest(), 'blocks': len(parser.blocks), 'headingLevels': parser.heading_levels,
                      'tableCells': parser.tags['td'], 'csp': parser.csp,
                      'independentValidator': 'Python streaming HTMLParser, exact eight blocks/direct emphasis/table and four outline levels; not Word rendering/XSD validation'}))


if __name__ == '__main__':
    assert len(sys.argv) == 3 and sys.argv[1] in ['generate', 'validate']
    (generate if sys.argv[1] == 'generate' else validate)(sys.argv[2])
