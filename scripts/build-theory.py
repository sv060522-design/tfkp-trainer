#!/usr/bin/env python3
"""Faithful PDF import: flowing prose, exact vector math, source links and cards.

Source glyphs are never inferred from extracted formula text. Each formula is a
clipped use of the original vector page; paragraphs reflow as ordinary HTML.
"""
import argparse
import base64
import gzip
import hashlib
import html
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[1]
NS = 'http://www.w3.org/2000/svg'
XLINK = 'http://www.w3.org/1999/xlink'
ET.register_namespace('', NS)
ET.register_namespace('xlink', XLINK)
PURPLE = 0x683b8c
BLUE = 0x17669a
HEAD = re.compile(r'\b(Определени[ея]|Теорем[аы]|Лемм[аы]|Следстви[ея])\s+(\d+(?:\.\d+)?)\b',re.I)
KIND = {'Определение':'definition','Теорема':'theorem','Лемма':'lemma','Следствие':'corollary'}
REF = re.compile(r'\b(теорем(?:а|ы|е|у|ой|ам|ами|ах)?|лемм(?:а|ы|е|у|ой|ам|ами|ах)?|определени(?:е|я|и|ю|ем|ях|ям)|следстви(?:е|я|и|ю|ем|ях|ям))\s+(\d+(?:\.\d+)?)', re.I)
PAGE_REF = re.compile(r'с\.\s*(\d+)\s+настоящего\s+PDF')
NAMED_REFS = {
 'интегральной теореме Коши':'theorem-8-2',
 'интегральной теоремы Коши':'theorem-8-2',
 'интегральной формуле Коши':'theorem-9-1',
 'интегральной формулы Коши':'theorem-9-1',
 'теореме Вейерштрасса':'theorem-10-3',
 'теоремы Вейерштрасса':'theorem-10-3',
 'теореме единственности':'theorem-10-5',
 'теоремы единственности':'theorem-10-5',
 'теореме Руше':'theorem-16-3',
 'теоремы Руше':'theorem-16-3',
 'леммы Шварца':'lemma-17-2',
 'лемме Шварца':'lemma-17-2',
 'теореме об обратной функции':'theorem-15-1',
 'теоремы об обратной функции':'theorem-15-1'
}
GLYPHS = {}
DEFS = []
REGIONS = {}


def jdump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',',':'))


def esc(s):
    return html.escape(str(s), quote=True)


def text_of(block):
    return ' '.join(''.join(s['text'] for s in line['spans']) for line in block.get('lines', []))


def spans_of(block):
    return [s for line in block.get('lines', []) for s in line['spans']]


def canonical(kind, number):
    base = next((KIND[k] for k in KIND if kind.lower().startswith(k[:4].lower())), None)
    return f'{base}-{number.replace(".", "-")}' if base else None


def page_vector(page, doc_key, number):
    svg = ET.fromstring(page.get_svg_image(text_as_path=True))
    defs = svg.find(f'{{{NS}}}defs')
    page_id = f'tpage-{doc_key}-{number}'
    regions=REGIONS.get(page_id,[])
    # Keep only glyphs used by formula/figure fragments. Flowing prose is already
    # represented as accessible HTML, so its thousands of vector glyphs would
    # unnecessarily slow down loading.
    for parent in list(svg.iter()):
        for item in list(parent):
            if item.tag!=f'{{{NS}}}use':
                continue
            m=re.fullmatch(r'matrix\(([^)]+)\)',item.get('transform',''))
            if m:
                values=[float(x) for x in re.split(r'[, ]+',m[1])]
                if len(values)==6:
                    a,b,c,d,e,f=values;x=float(item.get('x',0));y=float(item.get('y',0))
                    px,py=a*x+c*y+e,b*x+d*y+f
                    if not any(r[0]-1<=px<=r[2]+1 and r[1]-1<=py<=r[3]+1 for r in regions):
                        parent.remove(item)
    used={u.get(f'{{{XLINK}}}href','')[1:] for u in svg.iter(f'{{{NS}}}use')}
    ids = {}
    for item in list(defs) if defs is not None else []:
        original = item.attrib.pop('id')
        if original not in used:
            continue
        signature = hashlib.sha256(ET.tostring(item)).hexdigest()
        if signature not in GLYPHS:
            gid = 'tg'+str(len(GLYPHS))
            GLYPHS[signature] = gid
            item.set('id', gid)
            DEFS.append(ET.tostring(item, encoding='unicode'))
        ids[original] = GLYPHS[signature]
    if defs is not None:
        svg.remove(defs)
    for item in svg.iter():
        href = item.get(f'{{{XLINK}}}href')
        if href and href.startswith('#') and href[1:] in ids:
            item.set(f'{{{XLINK}}}href', '#'+ids[href[1:]])
        item.attrib.pop('data-text', None)
    body = ''.join(ET.tostring(x, encoding='unicode') for x in svg)
    # Namespace declarations are supplied once by the surrounding SVG.
    body = body.replace(f' xmlns="{NS}"', '').replace(f' xmlns:xlink="{XLINK}"', '')
    return page_id, f'<g id="{page_id}">{body}</g>'


def fragment(page_id, bbox, size=10.909, baseline=None, label='', display=False):
    REGIONS.setdefault(page_id,[]).append(list(bbox))
    x0,y0,x1,y1 = bbox
    # Bounding boxes include all super/subscripts. Padding protects the edge of
    # italic glyphs and fraction rules from clipping.
    x0-=.45; y0-=.45; x1+=.45; y1+=.45
    w,h = x1-x0,y1-y0
    vb = ' '.join(f'{x:.4f}' for x in [x0,y0,w,h])
    if display:
        # Display math may scroll locally; prose always fits the viewport.
        style=f'width:{w/size:.4f}em;height:{h/size:.4f}em;'
        cls='source-formula-display'
    else:
        below=(y1-(baseline if baseline is not None else y1-2))/size
        style=f'width:{w/size:.4f}em;height:{h/size:.4f}em;vertical-align:{-below:.4f}em;'
        cls='source-formula-inline'
    content=f'<svg class="{cls}" viewBox="{vb}" style="{style}" role="img" aria-label="{esc(label or "Формула из источника")}"><use href="#{page_id}" xlink:href="#{page_id}"/></svg>'
    return f'<div class="formula-scroll">{content}</div>' if display else content


def reference_html(s, doc, references, stats):
    matches=[]
    for m in REF.finditer(s):
        key=canonical(m[1],m[2])
        target=references.get(key)
        if target:
            matches.append((m.start(),m.end(),f'<a class="theory-ref" href="#doc={doc}&amp;chapter={target["chapter"]}&amp;anchor={target["anchor"]}" title="Открыть {esc(target["title"])}">{esc(m[0])}</a>'))
            stats['resultLinks']+=1
        else:
            stats['unresolved'].add(key)
    for name,key in NAMED_REFS.items():
        target=references.get(key)
        if not target:
            continue
        for m in re.finditer(re.escape(name),s,re.I):
            matches.append((m.start(),m.end(),f'<a class="theory-ref" href="#doc={doc}&amp;chapter={target["chapter"]}&amp;anchor={target["anchor"]}" title="Открыть {esc(target["title"])}">{esc(m[0])}</a>'))
            stats['namedLinks']+=1
    for m in PAGE_REF.finditer(s):
        p=int(m[1])
        chapter=stats['pageChapter'].get(p)
        if chapter is not None:
            matches.append((m.start(),m.end(),f'<a class="theory-ref" href="#doc={doc}&amp;chapter={chapter}&amp;anchor=page-{doc}-{p}">{esc(m[0])}</a>'))
            stats['pageLinks']+=1
    out='';pos=0
    for start,end,replacement in sorted(matches):
        if start<pos:
            continue
        out+=esc(s[pos:start])+replacement;pos=end
    return out+esc(s[pos:])


def components(page):
    blocks=[]
    for b in page.get_text('dict')['blocks']:
        # Only the running page number is omitted, never source content.
        if b['bbox'][1]>page.rect.height-35 and re.fullmatch(r'\s*\d+\s*',text_of(b)):
            continue
        blocks.append(b)
    groups=[]
    natives=[b for b in blocks if any('Times' in s['font'] or 'Arial' in s['font'] for s in spans_of(b))]
    maths=[b for b in blocks if b not in natives]
    for b in natives:
        ss=spans_of(b)
        color=next((s['color'] for s in ss if s['text'].strip()),None)
        groups.append({'blocks':[b],'y0':b['bbox'][1],'y1':b['bbox'][3],'color':color,'native':True})
    # Do not join a prose block to the preceding heading just because a large
    # inline sum extends above its baseline. Only attach a separate numerator or
    # denominator when it overlaps the x range of an existing inline math span.
    remaining=[]
    for b in maths:
        ss=spans_of(b)
        color=next((s['color'] for s in ss if s['text'].strip()),None)
        candidates=[]
        for g in groups:
            if g['color']!=color:
                continue
            for s in spans_of(g['blocks'][0]):
                if 'Times' in s['font'] or 'Arial' in s['font']:
                    continue
                box=s['bbox']; bb=b['bbox']
                xover=min(box[2],bb[2])-max(box[0],bb[0])
                distance=max(box[1]-bb[3],bb[1]-box[3],0)
                if xover>0 and distance<6:
                    candidates.append((distance,g))
        if candidates:
            g=min(candidates,key=lambda x:x[0])[1]
            g['blocks'].append(b);g['y0']=min(g['y0'],b['bbox'][1]);g['y1']=max(g['y1'],b['bbox'][3])
        else:
            remaining.append(b)
    # Pure display equations are grouped independently from nearby prose.
    formulas=[]
    for b in sorted(remaining,key=lambda b:(b['bbox'][1],b['bbox'][0])):
        y0,y1=b['bbox'][1],b['bbox'][3]
        ss=spans_of(b)
        color=next((s['color'] for s in ss if s['text'].strip()),None)
        group=next((g for g in reversed(formulas) if g['color']==color and y0<g['y1']-.3),None)
        if group:
            group['blocks'].append(b);group['y1']=max(group['y1'],y1)
        else:
            formulas.append({'blocks':[b],'y0':y0,'y1':y1,'color':color,'native':False})
    return sorted(groups+formulas,key=lambda c:c['y0'])


def render_component(comp, page_id, doc, references, stats):
    bs=comp['blocks'];spans=[s for b in bs for s in spans_of(b)]
    boxes=[b['bbox'] for b in bs]
    bbox=[min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes)]
    plain=' '.join(text_of(b) for b in bs)
    natives=[s for s in spans if 'Times' in s['font'] or 'Arial' in s['font']]
    # Figure blocks and pure equations retain their exact original vectors.
    if any(b['type']==1 for b in bs) or not natives:
        return fragment(page_id,bbox,label=plain,display=True),plain,None
    rows=[]
    for s in sorted(natives,key=lambda s:(s['origin'][1],s['bbox'][0])):
        baseline=s['origin'][1]
        row=next((r for r in rows if abs(r['baseline']-baseline)<1.8),None)
        if row is None:
            row={'baseline':baseline,'spans':[]};rows.append(row)
        row['spans'].append(s)
    for s in spans:
        if s in natives:
            continue
        row=min(rows,key=lambda r:abs(r['baseline']-s['origin'][1]))
        row['spans'].append(s)
    pieces=[]
    for row in rows:
        native=[s for s in row['spans'] if s in natives]
        maths=[s for s in row['spans'] if s not in natives]
        mathgroups=[]
        for s in sorted(maths,key=lambda s:s['bbox'][0]):
            has_native=mathgroups and any(mathgroups[-1]['box'][2]-.1 < n['bbox'][0] < s['bbox'][0]+.1 for n in native)
            if mathgroups and not has_native and s['bbox'][0]-mathgroups[-1]['box'][2]<5:
                g=mathgroups[-1];g['ss'].append(s)
                g['box']=[min(g['box'][0],s['bbox'][0]),min(g['box'][1],s['bbox'][1]),max(g['box'][2],s['bbox'][2]),max(g['box'][3],s['bbox'][3])]
            else:
                mathgroups.append({'ss':[s],'box':list(s['bbox'])})
        items=[(s['bbox'][0],'text',s) for s in native]+[(g['box'][0],'math',g) for g in mathgroups]
        rowparts=[]
        for _,kind,item in sorted(items,key=lambda x:x[0]):
            if kind=='text':
                value=reference_html(item['text'],doc,references,stats)
                fontstyle='font-weight:700;' if 'Bold' in item['font'] else ''
                if 'Italic' in item['font']:
                    fontstyle+='font-style:italic;'
                color=f'#{item["color"]:06x}'
                rowparts.append(f'<span style="color:{color};{fontstyle}">{value}</span>')
            else:
                text=''.join(s['text'] for s in item['ss'])
                rowparts.append(fragment(page_id,item['box'],size=next((s['size'] for s in native),10.909),baseline=row['baseline'],label=text))
        pieces.append(''.join(rowparts))
    # Undo ordinary line hyphenation in prose, retaining mathematical minus signs.
    body=' '.join(pieces)
    body=re.sub(r'([а-яёА-ЯЁ])-(</span>)\s*(<span[^>]*>)([а-яё])',r'\1\2\3\4',body)
    first=next((s for s in natives if s['text'].strip()),natives[0])
    heading=None
    if first['color']==PURPLE and 'Bold' in first['font'] and HEAD.search(plain):
        heading=HEAD.search(plain)
    tag='h3' if heading else 'h2' if 'Bold' in first['font'] and first['size']>13 else 'p'
    return f'<{tag} class="source-prose">{body}</{tag}>',plain,heading


def import_doc(key, file):
    d=fitz.open(file)
    toc=d.get_toc()
    chapters=[{'number':0,'title':'О документе и порядке подготовки','startPage':1,'endPage':toc[0][2]-1}]
    for i,(_,title,start) in enumerate(toc):
        chapters.append({'number':i+1,'title':re.sub(r'^\d+\.\s*','',title),'startPage':start,'endPage':toc[i+1][2]-1 if i+1<len(toc) else len(d)})
    page_chapter={p:c['number'] for c in chapters for p in range(c['startPage'],c['endPage']+1)}
    references={};headings=[];page_components={}
    for i,page in enumerate(d):
        cs=components(page);page_components[i+1]=cs
        for ci,c in enumerate(cs):
            spans=[s for b in c['blocks'] for s in spans_of(b)]
            plain=' '.join(text_of(b) for b in c['blocks'])
            first=next((s for s in spans if s['text'].strip()),None)
            m=HEAD.search(plain)
            if m and first and first['color']==PURPLE and 'Bold' in first['font']:
                cid=canonical(m[1],m[2]);anchor=f'{key}-{cid}-p{i+1}'
                base=next(KIND[k] for k in KIND if m[1].lower().startswith(k[:4].lower()))
                h={'id':cid,'anchor':anchor,'title':plain,'kind':base,'number':m[2],'page':i+1,'chapter':page_chapter[i+1],'component':ci,'y':c['y0']}
                headings.append(h);references.setdefault(cid,h)
    # The supplied compilation labels the disk automorphism theorem 19.2;
    # Hasanov's textbook labels the same theorem 19.4 (printed pp. 168–169).
    # Both references lead to the full statement, without altering the PDFs.
    if 'theorem-19-2' in references:
        references.setdefault('theorem-19-4',references['theorem-19-2'])
    # The boundary proof cites theorem 2 from §8 of Shabunin–Sidorov. The
    # complete attributed proof is included directly under Hasanov's 8.4.
    if 'theorem-8-4' in references:
        references.setdefault('theorem-2',references['theorem-8-4'])
    if 'definition-6-2' in references:
        references.setdefault('definition-6-3',references['definition-6-2'])
    stats={'resultLinks':0,'pageLinks':0,'namedLinks':0,'unresolved':set(),'pageChapter':page_chapter}
    cards=[];cards_seen=set();allpages=[]
    for chapter in chapters:
        chapter_headings=[h for h in headings if h['chapter']==chapter['number']]
        chapter['headings']=[{k:v for k,v in h.items() if k not in ['component','y']} for h in chapter_headings]
        blocks=[];vectors=[];search=[]
        card=None
        for n in range(chapter['startPage'],chapter['endPage']+1):
            page=d[n-1];pid=f'tpage-{key}-{n}'
            rendered=[]
            allpages.append(n)
            for ci,comp in enumerate(page_components[n]):
                content,plain,_=render_component(comp,pid,key,references,stats)
                search.append(plain)
                h=next((h for h in chapter_headings if h['page']==n and h['component']==ci),None)
                if h:
                    content=f'<div class="result-anchor" id="{h["anchor"]}">{content}</div>'
                    if key=='themes' and h['id'] not in cards_seen:
                        card={**h,'answerHtml':content,'statementText':plain}
                        cards_seen.add(h['id']);cards.append(card)
                    else:
                        card=None
                elif card:
                    ss=[s for b in comp['blocks'] for s in spans_of(b)]
                    colored=[s for s in ss if s['text'].strip()]
                    other_heading=colored and colored[0]['color']==PURPLE and 'Bold' in colored[0]['font']
                    if other_heading:
                        card=None
                    elif colored and all(s['color']==PURPLE for s in colored):
                        card['answerHtml']+=content;card['statementText']+=' '+plain
                    # Proofs are interleaved with separate numbered clauses in
                    # several theorems (notably 10.3 and 12.1). Keep collecting
                    # purple clauses until the next result, skipping the proofs.
                rendered.append(content)
            _,vector=page_vector(page,key,n);vectors.append(vector)
            # Existing source annotations complement links resolved by theorem
            # number. They are shown as accessible buttons, never hidden overlays.
            links=[]
            for link in page.get_links():
                if link.get('kind')==fitz.LINK_GOTO and link.get('page',-1)>=0:
                    target=link['page']+1
                    if target==n:
                        continue
                    dest=page_chapter.get(target)
                    if dest is not None:
                        links.append(f'<a class="source-page-link" href="#doc={key}&amp;chapter={dest}&amp;anchor=page-{key}-{target}">Ссылка из источника → с. {target}</a>')
            link_html=f'<nav class="source-links" aria-label="Ссылки со страницы {n}">{"".join(dict.fromkeys(links))}</nav>' if links else ''
            blocks.append(f'<section class="theory-source-page" id="page-{key}-{n}" data-page="{n}"><div class="source-page-label">{("Программа" if key=="themes" else "Билеты")} · страница {n}</div>{"".join(rendered)}{link_html}</section>')
        vector_html=f'<svg class="vector-definitions" xmlns="{NS}" xmlns:xlink="{XLINK}" aria-hidden="true"><defs>{"".join(vectors)}</defs></svg>'
        content=''.join(blocks)
        name=f'{key}-{chapter["number"]:02}.json'
        raw=jdump({'html':content,'vectors':vector_html,'pages':list(range(chapter['startPage'],chapter['endPage']+1))}).encode('utf8')
        envelope={'format':'tfkp-source-gzip-v1','sha256':hashlib.sha256(raw).hexdigest(),'data':base64.b64encode(gzip.compress(raw,mtime=0)).decode('ascii')}
        (ROOT/'theory-content'/name).write_text(jdump(envelope),encoding='utf8')
        chapter['contentFile']='theory-content/'+name
        chapter['searchText']=' '.join(search)
    assert allpages==list(range(1,len(d)+1))
    for c in cards:
        for field in ['component','y']:
            c.pop(field,None)
        assert len(c['statementText'])>len(c['title'])+8, c
    return {'key':key,'pageCount':len(d),'chapters':chapters,'headings':[{k:v for k,v in h.items() if k not in ['component','y']} for h in headings],'sha256':hashlib.sha256(Path(file).read_bytes()).hexdigest(),'sourceFile':'theory-sources/'+('tfkp_20_full.pdf' if key=='themes' else 'tfkp_32_tickets_full.pdf')},cards,stats


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--sources',type=Path,default=ROOT.parent/'upload');args=parser.parse_args()
    sources=[('themes',args.sources/'03-tfkp_20_full.pdf'),('tickets',args.sources/'02-tfkp_32_tickets_full.pdf')]
    docs=[];cards=[];audit={}
    for key,path in sources:
        doc,newcards,stats=import_doc(key,path);docs.append(doc);cards+=newcards
        audit[key]={'pages':doc['pageCount'],'chapters':len(doc['chapters'])-1,'headings':len(doc['headings']),'sha256':doc['sha256'],'resultLinks':stats['resultLinks'],'pageLinks':stats['pageLinks'],'namedLinks':stats['namedLinks'],'unresolved':sorted(stats['unresolved'])}
        (ROOT/doc['sourceFile']).write_bytes(path.read_bytes())
    aliases_path=ROOT/'data/theory/aliases.json'
    aliases=json.loads(aliases_path.read_text()) if aliases_path.exists() else {}
    for card in cards:
        card['name']=aliases.get(card['id'],re.sub(r'\s*\(Хасанов.*','',card['title']).rstrip('.'))
    data={'build':'2026-10-08-v37','docs':docs,'cards':cards,'sourceNotes':'20 пунктов соответствуют программе Б. О. Волкова от 9 апреля 2026 г. 32 билета — предполагаемое разбиение, не утверждённая нумерация. Пикар, существование отображения Римана и соответствие границ приводятся без доказательства, как в программе. Дополнительные доказательства Миттаг–Леффлера и граничной теоремы Коши атрибутированы в исходных документах. Теорема об автоморфизмах круга в подборках подписана 19.2, а в учебнике Хасанова — 19.4; обе ссылки ведут к её полному тексту.','textbook':{'title':'А. А. Хасанов. Лекции по теории функций комплексного переменного. МФТИ, 2022','sha256':hashlib.sha256((ROOT.parent/'project_sources/11-lektsii_po_teorii_funktsij_kompleksnogo_peremennogo_uchebnoe_posobie-1-.pdf').read_bytes()).hexdigest()}}
    (ROOT/'data/theory/catalog.js').write_text('window.TFKP_THEORY='+jdump(data)+';\n')
    (ROOT/'data/theory/glyphs.js').write_text('window.TFKP_THEORY_GLYPHS='+jdump(''.join(DEFS))+';\n')
    audit['cards']=len(cards);audit['glyphs']=len(GLYPHS)
    audit['contentFiles']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'theory-content').glob('*.json'))}
    (ROOT/'audit/theory-import-2026-10-08.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({**{k:v for k,v in audit.items() if k!='contentFiles'},'contentBytes':sum(p.stat().st_size for p in (ROOT/'theory-content').glob('*.json')),'glyphBytes':(ROOT/'data/theory/glyphs.js').stat().st_size},ensure_ascii=False))


if __name__=='__main__':
    main()
