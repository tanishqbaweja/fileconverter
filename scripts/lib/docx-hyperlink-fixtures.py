"""Finite genuine Word fixture and independent streaming HTML oracle, not conversion."""
import hashlib
from html import escape
from html.parser import HTMLParser
import json
import sys

URL = 'https://example.invalid/path?a=1&b=2#part'
MAIL = 'mailto:person@example.invalid?subject=Hello%20there'
BOOKMARK = 'docx-bookmark-' + 'Destination'.encode().hex()
PAYLOAD = 'Hyperlink payload 音楽 😀 ' * 7000
# href, tooltip, display text, inactive, strong text. Independent fixed oracle.
LINKS = [(URL, '"<Click &>', 'safe & styled', False, True),
         ('#' + BOOKMARK, None, 'Jump forward', False, False),
         (MAIL, None, 'Email', False, False),
         (None, None, 'Unsafe display', True, False),
         (None, None, 'Local file', True, False),
         (None, None, 'Relative display', True, False),
         ('#', None, 'Top', False, False),
         ('http://example.invalid/cell', None, 'Cell one', False, False),
         (URL, None, 'Nested link', False, False),
         ('#' + BOOKMARK, None, 'Back', False, False)]
PARAGRAPHS = [('p', 'Before safe & styled after'), ('p', 'Jump forward'),
              ('p', 'Email'), ('p', 'Unsafe display'), ('p', 'Local file'),
              ('p', 'Relative display'), ('p', 'Top'), ('h2', 'Destination'),
              ('p', PAYLOAD), ('p', 'Cell one'), ('p', 'Nested link'),
              ('p', 'Cell two'), ('p', 'Back')]


def generate(file):
    import docx
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.opc.constants import RELATIONSHIP_TYPE as RT
    assert docx.__version__ == '1.2.0'
    d = docx.Document()

    def link(p, text, target=None, anchor=None, tooltip=None, bold=False):
        h = OxmlElement('w:hyperlink')
        if target is not None:
            h.set(qn('r:id'), d.part.relate_to(target, RT.HYPERLINK, is_external=True))
        if anchor is not None:
            h.set(qn('w:anchor'), anchor)
        if tooltip is not None:
            h.set(qn('w:tooltip'), tooltip)
        h.set(qn('w:tgtFrame'), '_blank')  # Deliberately not propagated to HTML.
        r = OxmlElement('w:r')
        if bold:
            pr = OxmlElement('w:rPr'); pr.append(OxmlElement('w:b')); r.append(pr)
        t = OxmlElement('w:t'); t.text = text; r.append(t); h.append(r); p._p.append(h)

    p = d.add_paragraph('Before ')
    link(p, 'safe & styled', URL, 'IgnoredBecauseRelationshipWins', '"<Click &>', True)
    p.add_run(' after')
    link(d.add_paragraph(), 'Jump forward', anchor='Destination')
    link(d.add_paragraph(), 'Email', MAIL)
    link(d.add_paragraph(), 'Unsafe display', 'javascript:alert(1)')
    link(d.add_paragraph(), 'Local file', 'file:///C:/secret')
    link(d.add_paragraph(), 'Relative display', '../secret')
    link(d.add_paragraph(), 'Top')
    p = d.add_paragraph(style='Heading 2')
    b = OxmlElement('w:bookmarkStart'); b.set(qn('w:id'), '0'); b.set(qn('w:name'), 'Destination'); p._p.append(b)
    p.add_run('Destination')
    b = OxmlElement('w:bookmarkEnd'); b.set(qn('w:id'), '0'); p._p.append(b)
    d.add_paragraph(PAYLOAD)
    table = d.add_table(rows=1, cols=3)
    cell = table.cell(0, 0).merge(table.cell(0, 1))
    link(cell.paragraphs[0], 'Cell one', 'http://example.invalid/cell')
    nested = cell.add_table(rows=1, cols=1)
    link(nested.cell(0, 0).paragraphs[0], 'Nested link', URL)
    table.cell(0, 2).paragraphs[0].add_run('Cell two')
    link(d.add_paragraph(), 'Back', anchor='Destination')
    with open(file, 'xb') as f:
        d.save(f)
    print(json.dumps({'generator': 'python-docx', 'version': docx.__version__,
                      'semanticCases': len(LINKS), 'anchorContentBytes': len(PAYLOAD.encode()),
                      'realHyperlinkRelationships': True, 'forwardAndBackwardBookmark': True}))


def reference():
    def link(i):
        href, title, text, inactive, bold = LINKS[i]
        inside = '<strong>' + escape(text) + '</strong>' if bold else escape(text)
        return ('<span data-docx-link-disabled="unsafe-target">' + inside + '</span>' if inactive else
                '<a href="' + escape(href, quote=True) + '" rel="noreferrer noopener" referrerpolicy="no-referrer"' +
                (' title="' + escape(title, quote=True) + '"' if title is not None else '') + '>' + inside + '</a>')
    return '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body>' + \
        '<p>Before ' + link(0) + ' after</p>' + ''.join('<p>' + link(i) + '</p>' for i in range(1, 7)) + \
        '<h2><span id="' + BOOKMARK + '"></span>Destination</h2><p>' + PAYLOAD + '</p>' + \
        '<table><tr><td colspan="2"><p>' + link(7) + '</p><table><tr><td><p>' + link(8) + \
        '</p></td></tr></table></td><td><p>Cell two</p></td></tr></table><p>' + link(9) + '</p></body></html>'


class Oracle(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []; self.paragraphs = []; self.links = []; self.bookmarks = []
        self.current = None; self.link = None; self.columns = []; self.tables = 0; self.csp = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        assert len(a) == len(attrs)
        assert tag in {'html', 'head', 'meta', 'title', 'style', 'body', 'p', 'h2', 'a', 'strong', 'span', 'table', 'tr', 'td'}, tag
        assert not any(k.startswith('on') or k in {'src', 'target', 'ping'} for k in a)
        if tag == 'meta':
            if a.get('http-equiv', '').lower() == 'content-security-policy':
                self.csp = "default-src 'none'" in a.get('content', '')
            return
        assert len(self.stack) < 64
        parent = self.stack[-1] if self.stack else None
        if tag in {'p', 'h2'}:
            assert self.current is None and parent in {'body', 'td'}
            self.current = [tag, hashlib.sha256(), 0]
        if tag == 'table':
            assert parent in {'body', 'td'}; self.tables += 1
        if tag == 'tr':
            assert parent == 'table'
        if tag == 'td':
            assert parent == 'tr'
            if 'colspan' in a:
                self.columns.append(int(a['colspan']))
        if tag == 'a' or tag == 'span' and 'data-docx-link-disabled' in a:
            assert self.current is not None and self.link is None
            if tag == 'a':
                assert set(a) <= {'href', 'rel', 'referrerpolicy', 'title'}
                assert a.get('rel') == 'noreferrer noopener' and a.get('referrerpolicy') == 'no-referrer'
            else:
                assert a == {'data-docx-link-disabled': 'unsafe-target'}
            self.link = [a.get('href'), a.get('title'), '', tag == 'span', False]
        if tag == 'strong' and self.link is not None:
            self.link[4] = True
        if tag == 'span' and 'id' in a:
            assert set(a) == {'id'} and self.current is not None
            self.bookmarks.append(a['id'])
        self.stack.append(tag)

    def handle_endtag(self, tag):
        assert self.stack and self.stack[-1] == tag, (tag, self.stack[-1:])
        self.stack.pop()
        if tag == 'a' or tag == 'span' and self.link is not None:
            self.links.append(tuple(self.link)); self.link = None
        if tag in {'p', 'h2'}:
            if self.current[2]:
                self.paragraphs.append(tuple(self.current))
            self.current = None

    def handle_data(self, value):
        if self.current is not None:
            b = value.encode(); self.current[1].update(b); self.current[2] += len(b)
        if self.link is not None:
            self.link[2] += value; assert len(self.link[2]) < 2048


def validate(file):
    import codecs
    oracle = Oracle(); digest = hashlib.sha256(); size = 0
    decoder = codecs.getincrementaldecoder('utf-8')('strict')
    with open(file, 'rb') as f:
        while b := f.read(65536):
            size += len(b); assert size <= 1048576
            digest.update(b); oracle.feed(decoder.decode(b))
    oracle.feed(decoder.decode(b'', final=True)); oracle.close()
    assert not oracle.stack and oracle.csp and oracle.link is None and oracle.current is None
    assert oracle.links == LINKS, oracle.links
    assert oracle.bookmarks == [BOOKMARK] and oracle.columns == [2] and oracle.tables == 2
    assert len(oracle.paragraphs) == len(PARAGRAPHS)
    for actual, (tag, text) in zip(oracle.paragraphs, PARAGRAPHS):
        assert actual[0] == tag and actual[1].hexdigest() == hashlib.sha256(text.encode()).hexdigest() and actual[2] == len(text.encode())
    print(json.dumps({'bytes': size, 'sha256': digest.hexdigest(), 'semanticCases': len(LINKS),
                      'allHyperlinksBookmarksTextAndEmphasisVerified': True, 'unsafeTargetsInactive': True,
                      'independentHardcodedOracle': True, 'nestedHtmlTablesVerified': True}))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    mode = sys.argv[1]
    if mode == 'generate': generate(sys.argv[2])
    elif mode == 'reference': print(reference())
    elif mode == 'validate': validate(sys.argv[2])
    else: raise AssertionError(mode)
