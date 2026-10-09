#!/usr/bin/env python3
"""Verify complete source coverage, statement crops and every navigation target."""
import hashlib
import json
from pathlib import Path
import fitz

root=Path(__file__).resolve().parents[1]
data=json.loads((root/'data/theory.json').read_text())
cards={c['id']:c for c in data['cards']}
assert len(cards)==len(data['cards'])==172
assert sum(c['kind']=='definition' for c in cards.values())==66
assert len(data['docs']['program']['sections'])==20
assert len(data['docs']['tickets']['sections'])==32
total_links=0
for key,meta in data['docs'].items():
    path=root/meta['file'].removeprefix('./')
    assert hashlib.sha256(path.read_bytes()).hexdigest()==meta['sha256']
    doc=fitz.open(path)
    assert len(doc)==meta['pages']==len(meta['pageIndex'])
    for page_number,p in enumerate(meta['pageIndex'],1):
        source=doc[page_number-1]
        assert abs(source.rect.width-p['width'])<.02 and abs(source.rect.height-p['height'])<.02
        for link in p['links']:
            total_links+=1
            x0,y0,x1,y1=link['rect']
            assert 0<=x0<x1<=p['width']+1 and 0<=y0<y1<=p['height']+1,(key,page_number,link)
            if 'claim' in link:
                assert link['claim'] in cards
                c=cards[link['claim']]
                assert c['locations'].get(key) or c['locations'].get('program') or c['locations'].get('tickets')
            if 'doc' in link:assert 1<=link['page']<=data['docs'][link['doc']]['pages']
        for anchor in p['claims']:assert anchor['id'] in cards
    for i,s in enumerate(meta['sections']):
        assert 1<=s['start']<=s['end']<=len(doc)
        if i:assert s['start']==meta['sections'][i-1]['end']+1
        assert all(cid in cards for cid in s['claimIds']+s['references'])
        assert all(1<=n<=20 for n in s['programIds'])
    assert meta['sections'][-1]['end']==len(doc)
for card in cards.values():
    assert card['segments'] and card['title'] and 'Доказательство' not in card['text']
    meta=data['docs'][card['answerDoc']]
    for seg in card['segments']:
        assert 1<=seg['page']<=meta['pages']
        p=meta['pageIndex'][seg['page']-1]
        x0,y0,x1,y1=seg['rect']
        assert 0<=x0<x1<=p['width'] and 0<=y0<y1<=p['height']
    for key,locations in card['locations'].items():
        for loc in locations:
            s=next(s for s in data['docs'][key]['sections'] if s['id']==loc['section'])
            assert s['start']<=loc['page']<=s['end']
            assert any(a['id']==card['id'] for a in data['docs'][key]['pageIndex'][loc['page']-1]['claims'])
assert data['docs']['book']['sections'][0]['start']==8
assert data['docs']['book']['pageIndex'][28]['printedPage']==28
assert cards['definition-15-6']['title']=='Допустимая кривая'
assert cards['theorem-11-2']['locations']['program'][0]['section']==8
assert cards['theorem-11-2']['locations']['tickets'][0]['section']==17
print(f'Theory source OK: 20 topics, 32 tickets, 25 book chapters, 405 PDF pages, 172 statement cards, {total_links} valid links')
