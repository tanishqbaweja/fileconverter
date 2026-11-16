"""Finite native Word fixture and independent streaming oracle, never conversion."""
import codecs
import hashlib
from html import escape
from html.parser import HTMLParser
import json
import sys

PAYLOAD = 'Bounded list anchor 音楽 😀 ' * 7000
# Hardcoded labels, independent of the production numbering algorithm.
# label, text, source level, HTML value, source instance (or style / no list).
CASES = [
    ('A\t','Top A',0,1,42), ('A.i)\t','Child i',1,1,42),
    ('1.1.1\t','Legal one',2,1,42), ('1.1.2\t','Legal two',2,2,42),
    ('B\t','Top B',0,2,42), ('B.i)\t','Child restarted',1,1,42),
    ('2.1.3\t','Legal never restarted',2,3,42), ('B.ii)\t','Inherited numbering',1,2,'style'),
    ('','Direct numbering removed',None,None,0), ('C\t','Continuation',0,3,42),
    ('G\t','Instance start override',0,7,43), ('•\t','Unicode bullet',0,None,44),
    ('',PAYLOAD,None,None,None), ('D\t','After anchor',0,4,42),
    ('D.i)\t','Cell one',1,1,42), ('•\t','Nested bullet',0,None,44),
    ('D.ii)\t','Cell two',1,2,42), ('E\t','After table',0,5,42)]

def generate(file):
    import docx
    from docx.enum.style import WD_STYLE_TYPE
    from docx.oxml import OxmlElement
    assert docx.__version__ == '1.2.0'
    def node(tag, val=None):
        e = OxmlElement('w:' + tag)
        if val is not None:
            e.set('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val', str(val))
        return e
    d = docx.Document()
    for aid, formats in [(42,['upperLetter','lowerRoman','decimal']), (44,['bullet'])]:
        a = node('abstractNum'); a.set('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}abstractNumId',str(aid))
        for i, fmt in enumerate(formats):
            lvl = node('lvl'); lvl.set('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}ilvl',str(i))
            for e in [node('start',1),node('numFmt',fmt),node('lvlText',('•' if aid == 44 else ['%1','%1.%2)','%1.%2.%3'][i]))]: lvl.append(e)
            if i == 1: lvl.append(node('pStyle','BoundedList'))
            if i == 2: lvl.append(node('lvlRestart',0)); lvl.append(node('isLgl'))
            a.append(lvl)
        d.part.numbering_part.element.append(a)
    for nid, aid in [(42,42),(43,42),(44,44)]:
        n = node('num'); n.set('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}numId',str(nid)); n.append(node('abstractNumId',aid))
        if nid == 43:
            o = node('lvlOverride'); o.set('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}ilvl','0'); o.append(node('startOverride',7)); n.append(o)
        d.part.numbering_part.element.append(n)
    style = d.styles.add_style('BoundedList',WD_STYLE_TYPE.PARAGRAPH)
    pr = node('numPr'); pr.append(node('numId',42)); pr.append(node('ilvl',8)); style.element.get_or_add_pPr().append(pr)
    derived = d.styles.add_style('DerivedList',WD_STYLE_TYPE.PARAGRAPH); derived.base_style = style
    def populate(p,c):
        _, text, level, _, nid = c
        if nid == 'style': p.style = derived
        elif nid is not None:
            pr = node('numPr'); pr.append(node('numId',nid))
            if level is not None: pr.append(node('ilvl',level))
            p._p.get_or_add_pPr().append(pr)
        p.add_run(text)
    for c in CASES[:14]: populate(d.add_paragraph(),c)
    t=d.add_table(rows=1,cols=3); cell=t.cell(0,0).merge(t.cell(0,1)); populate(cell.paragraphs[0],CASES[14])
    nested=cell.add_table(rows=1,cols=1); populate(nested.cell(0,0).paragraphs[0],CASES[15]); populate(t.cell(0,2).paragraphs[0],CASES[16])
    populate(d.add_paragraph(),CASES[17])
    with open(file,'xb') as f: d.save(f)
    print(json.dumps({'generator':'python-docx','version':docx.__version__,'semanticCases':len(CASES),'anchorContentBytes':len(PAYLOAD.encode()),'actualNumberingPart':True,'inheritedParagraphStyle':True}))

def reference():
    out=[]
    for marker,text,level,value,_ in CASES:
        p='<p>'+('<span class="docx-list-marker">'+escape(marker)+'</span>' if marker else '')+escape(text)+'</p>'
        if level is not None:
            tag='ol' if value is not None else 'ul'; p=f'<{tag} data-docx-list-level="{level}"><li'+(f' value="{value}"' if value is not None else '')+'>'+p+f'</li></{tag}>'
        out.append(p)
    out[14:17]=['<table><tr><td colspan="2">'+out[14]+'<table><tr><td>'+out[15]+'</td></tr></table></td><td>'+out[16]+'</td></tr></table>']
    return '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"></head><body>'+''.join(out)+'</body></html>'

class Oracle(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.stack=[]; self.cases=[]; self.columns=[]; self.text=None; self.marker=None; self.current=None; self.csp=False; self.in_marker=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs); assert tag in {'html','head','meta','title','style','body','ol','ul','li','p','span','table','tr','td'},tag
        assert not any(k.startswith('on') or k in {'src','href'} for k in a)
        if tag=='meta':
            if a.get('http-equiv','').lower()=='content-security-policy': self.csp="default-src 'none'" in a.get('content','')
            return
        assert len(self.stack)<64; parent=self.stack[-1][0] if self.stack else None
        if tag in {'ol','ul'}: assert parent in {'body','td','li'} and 0<=int(a['data-docx-list-level'])<=8
        if tag=='li': assert parent in {'ol','ul'}
        if tag=='p':
            assert parent in {'body','td','li'} and self.text is None
            self.text=[]; self.marker=[]; self.current=(int(self.stack[-2][1]['data-docx-list-level']),int(self.stack[-1][1]['value']) if 'value' in self.stack[-1][1] else None) if parent=='li' else (None,None)
        if tag=='span': assert parent=='p' and a.get('class')=='docx-list-marker' and self.current[0] is not None; self.in_marker=True
        if tag=='td' and 'colspan' in a: self.columns.append(int(a['colspan']))
        self.stack.append((tag,a))
    def handle_endtag(self,tag):
        assert self.stack and self.stack[-1][0]==tag,(tag,self.stack[-1:]); self.stack.pop()
        if tag=='span': self.in_marker=False
        if tag=='p':
            text,marker=''.join(self.text),''.join(self.marker)
            if text or marker: self.cases.append((marker,text,*self.current))
            self.text=self.marker=self.current=None
    def handle_data(self,value):
        if self.text is not None: (self.marker if self.in_marker else self.text).append(value)

def validate(file):
    o=Oracle(); decoder=codecs.getincrementaldecoder('utf-8')('strict'); count=0; digest=hashlib.sha256()
    with open(file,'rb') as f:
        while b:=f.read(4096):
            count+=len(b); assert count<=1048576; digest.update(b); o.feed(decoder.decode(b))
    o.feed(decoder.decode(b'',final=True)); o.close()
    assert not o.stack and o.csp and o.text is None
    expected=[(m,t,l,v) for m,t,l,v,_ in CASES]
    assert o.cases==expected,[(i,a[:1],b[:1]) for i,(a,b) in enumerate(zip(o.cases,expected)) if a!=b]
    assert o.columns==[2]
    print(json.dumps({'sha256':digest.hexdigest(),'outputBytes':count,'semanticCases':len(expected),'allLabelsTextLevelsAndValuesVerified':True,'nestedHtmlListsAndTablesVerified':True,'independentHardcodedLabelOracle':True,'csp':True,'columnSpans':o.columns}))

if __name__=='__main__':
    if sys.argv[1:]==['reference']: sys.stdout.buffer.write(reference().encode('utf-8'))
    else:
        assert len(sys.argv)==3 and sys.argv[1] in {'generate','validate'}; {'generate':generate,'validate':validate}[sys.argv[1]](sys.argv[2])
