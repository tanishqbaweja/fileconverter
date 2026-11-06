"""Deterministic fixture creation and independent output validation, never conversion.

Every large source/output is streamed with fixed buffers. This helper must only
receive repository-owned fixture paths or a read-only, already-finished browser
output backing. It never writes an HTML conversion or touches test.mkv.
"""
import codecs
import hashlib
from html.parser import HTMLParser
import json
import sys
import zipfile
from xml.sax.saxutils import escape

WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types'
RELS = 'http://schemas.openxmlformats.org/package/2006/relationships'
CONTENT = ('<Types xmlns="' + TYPES + '">'
           '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
           '<Default Extension="xml" ContentType="application/xml"/>'
           '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
           '</Types>')
RELATIONSHIPS = ('<Relationships xmlns="' + RELS + '">'
                 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
                 '</Relationships>')


def generate(file, count):
    assert 1 <= count <= 32768
    # ZIP_STORED makes both input and output genuinely large, without a sparse
    # placeholder, artificial unused padding, or an archive-expansion exception.
    with open(file, 'xb') as sink:
        with zipfile.ZipFile(sink, 'w', compression=zipfile.ZIP_STORED, allowZip64=False) as archive:
            def info(name):
                return zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            archive.writestr(info('[Content_Types].xml'), CONTENT)
            archive.writestr(info('_rels/.rels'), RELATIONSHIPS)
            with archive.open(info('word/document.xml'), 'w') as document:
                document.write(('<w:document xmlns:w="' + WORD + '"><w:body>').encode())
                for number in range(count):
                    value = str(number).zfill(8) + '|' + 'bounded-stream-' * 280 + '|\u03b2 \U0001f600 & <script>safe</script>'
                    document.write(('<w:p><w:r><w:t>' + escape(value) + '</w:t></w:r></w:p>').encode())
                document.write(b'</w:body></w:document>')
    print(json.dumps({'paragraphs': count, 'zipMethod': 'stored', 'deterministicZipMetadata': True,
                      'maximumGeneratedParagraphBytes': 8192, 'nativeConversionUsed': False}))


class Document(HTMLParser):
    def __init__(self, expected):
        super().__init__(convert_charrefs=True)
        self.expected = expected
        self.paragraphs = 0
        self.current = None
        self.csp = False
        self.body = 0
        self.closed_body = 0
        self.max_text = 0

    def handle_starttag(self, tag, attrs):
        assert tag in ['html', 'head', 'meta', 'title', 'style', 'body', 'p'], tag
        assert not any(k.lower().startswith('on') or k.lower() in ['src', 'href'] for k, _ in attrs)
        if tag == 'meta' and dict(attrs).get('http-equiv', '').lower() == 'content-security-policy':
            self.csp = "default-src 'none'" in dict(attrs).get('content', '')
        if tag == 'body':
            self.body += 1
            assert self.body == 1
        if tag == 'p':
            assert self.body == 1 and not self.closed_body and self.current is None
            self.current = ''

    def handle_endtag(self, tag):
        if tag == 'p':
            assert self.current is not None
            # Independently check every ordered paragraph, not only a sampled
            # range/hash or a source/output file-size comparison.
            expected = f'{self.paragraphs:08d}|' + ''.join(['bounded-stream-'] * 280) + '|' + chr(946) + ' ' + chr(128512) + ' & <script>safe</script>'
            assert self.current == expected, 'Paragraph mismatch at ' + str(self.paragraphs)
            self.paragraphs += 1
            assert self.paragraphs <= self.expected
            self.current = None
        if tag == 'body':
            assert self.current is None
            self.closed_body += 1

    def handle_data(self, data):
        if self.current is not None:
            self.current += data
            self.max_text = max(self.max_text, len(self.current))
            assert len(self.current) <= 8192


def validate(file, count):
    parser = Document(count)
    decoder = codecs.getincrementaldecoder('utf-8')('strict')
    digest = hashlib.sha256()
    size = 0
    with open(file, 'rb') as source:
        while True:
            chunk = source.read(65536)
            if not chunk:
                break
            size += len(chunk)
            digest.update(chunk)
            parser.feed(decoder.decode(chunk))
        parser.feed(decoder.decode(b'', True))
        parser.close()
    assert parser.paragraphs == count and parser.current is None
    assert parser.csp and parser.body == 1 and parser.closed_body == 1
    print(json.dumps({'sha256': digest.hexdigest(), 'bytes': size, 'paragraphs': parser.paragraphs,
                      'maximumParagraphChars': parser.max_text, 'readBufferBytes': 65536,
                      'allParagraphsComparedInOrder': True, 'csp': parser.csp,
                      'validator': 'independent streaming Python HTMLParser; every ordinal, Unicode paragraph and inactive escaped markup'}))


if __name__ == '__main__':
    assert len(sys.argv) == 4 and sys.argv[1] in ['generate', 'validate']
    operation, target, paragraphs = sys.argv[1], sys.argv[2], int(sys.argv[3])
    assert 1 <= paragraphs <= 32768
    (generate if operation == 'generate' else validate)(target, paragraphs)
