"""Stream real ZIP_STORED Word fixtures and validate finished browser HTML only."""
import codecs
import hashlib
from html import escape
from html.parser import HTMLParser
import json
import sys
import zipfile

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
P = 'http://schemas.openxmlformats.org/package/2006/relationships'
T = 'http://schemas.openxmlformats.org/package/2006/content-types'


def generate(file, count):
    with open(file, 'xb') as sink, zipfile.ZipFile(sink, 'w', compression=zipfile.ZIP_STORED) as z:
        def info(name): return zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        z.writestr(info('[Content_Types].xml'), '<Types xmlns="'+T+'"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        z.writestr(info('_rels/.rels'), '<Relationships xmlns="'+P+'"><Relationship Id="main" Type="'+R+'/officeDocument" Target="word/document.xml"/></Relationships>')
        with z.open(info('word/_rels/document.xml.rels'), 'w') as part:
            part.write(('<Relationships xmlns="'+P+'">').encode())
            for i in range(1024):
                part.write(('<Relationship Id="h'+str(i)+'" Type="'+R+'/hyperlink" TargetMode="External" Target="https://example.invalid/item/'+str(i)+'?a=1&amp;b=2#part"/>').encode())
            part.write(b'</Relationships>')
        with z.open(info('word/document.xml'), 'w') as part:
            part.write(('<w:document xmlns:w="'+W+'" xmlns:r="'+R+'"><w:body>').encode())
            for i in range(count):
                value = str(i).zfill(8)+'|'+'bounded-stream-'*280+'|β 😀 & <script>safe</script>|'
                b = min(count, 64)
                bookmark = '<w:bookmarkStart w:id="'+str(i)+'" w:name="B'+str(i).zfill(4)+'"/><w:bookmarkEnd w:id="'+str(i)+'"/>' if i < b else ''
                external = '<w:hyperlink r:id="h'+str(i % 1024)+'" w:anchor="Ignored" w:tooltip="item '+str(i % 1024)+'"><w:r>'+('<w:rPr><w:b/></w:rPr>' if i % 2 else '')+'<w:t>External '+str(i).zfill(8)+'</w:t></w:r></w:hyperlink>'
                local = '<w:hyperlink w:anchor="B'+str((i+1) % b).zfill(4)+'"><w:r><w:t>Local '+str(i).zfill(8)+'</w:t></w:r></w:hyperlink>'
                part.write(('<w:p>'+bookmark+'<w:r><w:t>'+escape(value)+'</w:t></w:r>'+external+'<w:r><w:t>|</w:t></w:r>'+local+'</w:p>').encode())
            part.write(b'</w:body></w:document>')
    print(json.dumps({'paragraphs': count, 'zipMethod': 'stored', 'deterministicZipMetadata': True,
                      'maximumGeneratedParagraphBytes': 8192, 'nativeConversionUsed': False,
                      'hyperlinkRelationships': 1024, 'bookmarkNames': min(count, 64), 'linksPerParagraph': 2}))


class Oracle(HTMLParser):
    def __init__(self, count):
        super().__init__(convert_charrefs=True)
        self.expected = count; self.count = 0; self.stack = []; self.text = None
        self.links = []; self.link = None; self.bookmarks = []; self.seen = set()
        self.csp = False; self.body = 0; self.closed = 0; self.maximum = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs); assert len(a) == len(attrs) and len(self.stack) < 32
        assert tag in {'html', 'head', 'meta', 'title', 'style', 'body', 'p', 'a', 'span', 'strong'}
        assert not any(k.startswith('on') or k in {'src','ping','target'} for k in a)
        if tag == 'meta':
            if a.get('http-equiv','').lower() == 'content-security-policy': self.csp = "default-src 'none'" in a.get('content','')
            return
        parent = self.stack[-1] if self.stack else None
        if tag == 'body': self.body += 1; assert self.body == 1
        if tag == 'p':
            assert parent == 'body' and self.text is None and not self.closed
            self.text = ''; self.links = []; self.bookmarks = []
        if tag == 'a':
            assert parent == 'p' and self.link is None and set(a) <= {'href','rel','referrerpolicy','title'}
            assert a.get('rel') == 'noreferrer noopener' and a.get('referrerpolicy') == 'no-referrer'
            self.link = [a.get('href'), a.get('title'), '', False]
        if tag == 'strong': assert parent == 'a' and self.link is not None; self.link[3] = True
        if tag == 'span':
            assert parent == 'p' and set(a) == {'id'} and a['id'] not in self.seen and len(self.seen) < 64
            self.bookmarks.append(a['id']); self.seen.add(a['id'])
        self.stack.append(tag)

    def handle_endtag(self, tag):
        assert self.stack and self.stack.pop() == tag
        if tag == 'a': self.links.append(tuple(self.link)); self.link = None; assert len(self.links) <= 2
        if tag == 'p':
            n = self.count; b = min(self.expected,64)
            expected_text = f'{n:08d}|' + ''.join(['bounded-stream-']*280) + '|'+chr(946)+' '+chr(128512)+' & <script>safe</script>|' + f'External {n:08d}|Local {n:08d}'
            assert self.text == expected_text, ('text', n)
            expected_links = [('https://example.invalid/item/%d?a=1&b=2#part' % (n % 1024), 'item %d' % (n % 1024), f'External {n:08d}', bool(n % 2)),
                              ('#docx-bookmark-'+('B%04d' % ((n+1) % b)).encode().hex(), None, f'Local {n:08d}', False)]
            assert self.links == expected_links, ('links', n)
            assert self.bookmarks == ['docx-bookmark-'+('B%04d' % n).encode().hex()] if n < b else self.bookmarks == []
            self.count += 1; assert self.count <= self.expected; self.text = None
        if tag == 'body': self.closed += 1

    def handle_data(self, text):
        if self.text is not None:
            self.text += text; self.maximum = max(self.maximum,len(self.text)); assert len(self.text) <= 8192
        if self.link is not None: self.link[2] += text; assert len(self.link[2]) <= 64


def validate(file, count):
    p = Oracle(count); decoder = codecs.getincrementaldecoder('utf-8')('strict'); digest = hashlib.sha256(); size = 0
    with open(file,'rb') as f:
        while chunk := f.read(65536):
            size += len(chunk); digest.update(chunk); p.feed(decoder.decode(chunk))
    p.feed(decoder.decode(b'',True)); p.close()
    assert not p.stack and p.text is None and p.link is None and p.count == count
    assert p.csp and p.body == p.closed == 1 and len(p.seen) == min(count,64)
    print(json.dumps({'sha256':digest.hexdigest(),'bytes':size,'paragraphs':p.count,'links':p.count*2,
                      'bookmarkNames':len(p.seen),'allParagraphsAndLinksComparedInOrder':True,
                      'maximumParagraphChars':p.maximum,'readBufferBytes':65536,'csp':True}))


def reference():
    # Finite, independently specified two-paragraph positive HTML control only.
    text = lambda n: f'{n:08d}|'+'bounded-stream-'*280+'|β 😀 &amp; &lt;script&gt;safe&lt;/script&gt;|'
    return '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body>' + \
        '<p><span id="docx-bookmark-4230303030"></span>'+text(0)+'<a href="https://example.invalid/item/0?a=1&amp;b=2#part" title="item 0" rel="noreferrer noopener" referrerpolicy="no-referrer">External 00000000</a>|<a href="#docx-bookmark-4230303031" rel="noreferrer noopener" referrerpolicy="no-referrer">Local 00000000</a></p>' + \
        '<p><span id="docx-bookmark-4230303031"></span>'+text(1)+'<a href="https://example.invalid/item/1?a=1&amp;b=2#part" title="item 1" rel="noreferrer noopener" referrerpolicy="no-referrer"><strong>External 00000001</strong></a>|<a href="#docx-bookmark-4230303030" rel="noreferrer noopener" referrerpolicy="no-referrer">Local 00000001</a></p></body></html>'


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    if sys.argv[1] == 'reference': print(reference())
    else:
        mode, file, count = sys.argv[1],sys.argv[2],int(sys.argv[3]); assert 1 <= count <= 32768
        if mode == 'generate': generate(file,count)
        elif mode == 'validate': validate(file,count)
        else: raise AssertionError(mode)
