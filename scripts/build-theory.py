#!/usr/bin/env python3
"""Index the supplied full theory PDFs without retyping their mathematics.

Displayed content comes from the embedded PDFs. Coordinates are in PDF points;
the search text is never used to reconstruct a formula. Source files are immutable.
"""
import hashlib
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT.parent
PURPLE = 6830988
BLUE = 1533594
KINDS = {'Определение': 'definition', 'Теорема': 'theorem', 'Лемма': 'lemma',
         'Следствие': 'corollary', 'Утверждение': 'proposition', 'Предложение': 'proposition'}
HEAD = re.compile(r'^(Определение|Теорема|Лемма|Следствие|Утверждение|Предложение)\s+(\d+(?:\.\d+)*)')
REF = re.compile(r'(?P<kind>теорем(?:а|ы|е|у|ой)|лемм(?:а|ы|е|у|ой)|определени(?:е|я|ю|ем|и)|следстви(?:е|я|ю|ем|и)|утверждени(?:е|я|ю|ем|и))\s+(?P<num>\d+(?:\.\d+)+)', re.I)
ALIASES = [
 (r'теорем\w*\s+Вейерштрасса','theorem:10.3'),
 (r'теорем\w*\s+Абеля','theorem:10.1'),
 (r'теорем\w*\s+Мореры','theorem:9.4'),
 (r'теорем\w*\s+Сохоцкого','theorem:12.2'),
 (r'теорем\w*\s+Пикара','theorem:12.3'),
 (r'теорем\w*\s+Руше','theorem:16.3'),
 (r'теорем\w*\s+Лиувилля','corollary:12.5'),
 (r'теорем\w*\s+Римана(?![–-])','theorem:18.3'),
 (r'теорем\w*\s+Миттаг[–-]Леффлера','theorem:14.2'),
 (r'теорем\w*\s+единственности','theorem:10.5'),
 (r'теорем\w*\s+об\s+обратной\s+функции','theorem:15.1'),
 (r'лемм\w*\s+Гурса','lemma:8.1'),
 (r'лемм\w*\s+Жордана','lemma:13.2'),
 (r'лемм\w*\s+Шварца','lemma:17.2'),
 (r'интегральн\w*\s+формул\w*\s+Коши','theorem:9.1'),
 (r'интегральн\w*\s+теорем\w*\s+Коши','theorem:8.2'),
 (r'теорем\w*\s+Коши\s+о\s+вычетах','theorem:13.1'),
 (r'услови\w*\s+Коши[–-]Римана','theorem:5.1'),
 (r'принцип\w*\s+аргумента','theorem:16.2'),
 (r'принцип\w*\s+максимума\s+модуля','theorem:17.2'),
 (r'принцип\w*\s+сохранения\s+области','theorem:17.1'),
 (r'принцип\w*\s+симметрии','theorem:23.1'),
 (r'основн\w*\s+теорем\w*\s+алгебры','theorem:16.4'),
]

NAMES = {
 'definition:1.1':'Комплексное число',
 'definition:2.1':'Предел последовательности комплексных чисел',
 'definition:2.2':'Последовательность, стремящаяся к бесконечности',
 'definition:2.3':'Сходимость числового ряда',
 'definition:2.4':'Расширенная комплексная плоскость',
 'definition:3.1':'Связное множество', 'definition:3.3':'Область',
 'definition:3.4':'Односвязная область', 'definition:4.1':'Функция комплексного переменного',
 'definition:4.2':'Предел функции в смысле Коши', 'definition:4.3':'Предел функции в смысле Гейне',
 'definition:4.4':'Непрерывность в точке', 'definition:4.5':'Непрерывность на множестве',
 'definition:5.1':'Дифференцируемость в вещественном смысле',
 'definition:5.2':'Дифференцируемость в комплексном смысле',
 'definition:5.3':'Голоморфность на открытом множестве',
 'definition:5.4':'Голоморфность на произвольном множестве',
 'definition:5.5':'Гармоническая функция', 'definition:5.6':'Сопряжённые гармонические функции',
 'definition:6.1':'Комплексная экспонента', 'definition:7.1':'Кривая на комплексной плоскости',
 'definition:7.2':'Эквивалентные параметризации', 'definition:7.3':'Простая жорданова кривая',
 'definition:7.4':'Гладкая кривая', 'definition:7.5':'Произведение кривых',
 'definition:7.6':'Складка', 'definition:7.7':'Склейка кривой',
 'definition:7.10':'Комплексный интеграл по кривой', 'definition:7.11':'Первообразная',
 'definition:8.1':'Область с разрезом',
 'definition:8.2':'Область с простой кусочно-гладкой границей', 'definition:8.3':'Положительная ориентация границы',
 'definition:8.4':'Непрерывное продолжение в точку границы', 'definition:8.5':'Непрерывное продолжение вплоть до границы',
 'definition:9.1':'Интеграл Коши', 'definition:10.1':'Степенной ряд',
 'definition:10.3':'Ряд Тейлора', 'definition:10.4':'Локально равномерная сходимость',
 'definition:10.5':'Порядок нуля голоморфной функции',
 'definition:11.1':'Ряд Лорана', 'definition:11.2':'Кольцо на комплексной плоскости',
 'definition:12.1':'Изолированная особая точка и её типы', 'definition:12.2':'Целая функция',
 'definition:13.1':'Вычет в конечной точке', 'definition:13.2':'Вычет на бесконечности',
 'definition:14.1':'Мероморфная функция',
 'definition:14.2':'Локально равномерная сходимость ряда мероморфных функций',
 'definition:14.3':'Правильная система контуров', 'definition:15.1':'Однолистная функция',
 'definition:15.2':'Многозначная функция', 'definition:15.3':'Ветвь многозначной функции',
 'definition:15.4':'Многозначный логарифм', 'definition:15.6':'Допустимая кривая',
 'definition:15.7':'Приращение аргумента на отрезке', 'definition:15.8':'Приращение аргумента вдоль кривой',
 'definition:15.9':'Индекс кривой относительно точки',
 'definition:16.1':'Число нулей и полюсов с учётом кратности',
 'definition:18.1':'Конформность в конечной точке', 'definition:18.2':'Конформность в области',
 'definition:18.3':'Конформность в бесконечно удалённой точке',
 'definition:18.4':'Конформность в полюсе', 'definition:18.5':'Конформность на сфере Римана',
 'definition:19.1':'Дробно-линейное отображение', 'definition:19.2':'Симметрия относительно окружности',
 'definition:20.1':'Функция Жуковского', 'definition:21.1':'Ветвь степенной функции',
 'theorem:2.1':'Покоординатный критерий сходимости последовательности',
 'corollary:2':'Критерий Коши сходимости последовательности',
 'theorem:3.1':'Связность отрезка', 'theorem:3.2':'Линейная связность открытого связного множества',
 'theorem:4.1':'Покоординатный критерий предела функции',
 'theorem:4.2':'Покоординатный критерий непрерывности',
 'corollary:5.1':'Вещественная дифференцируемость через комплексное приращение',
 'corollary:5.2':'Независимость производной от направления',
 'theorem:5.1':'Критерий Коши–Римана', 'theorem:5.2':'Нулевая производная и постоянство функции',
 'theorem:5.3':'Производная сложной функции', 'theorem:5.4':'Существование сопряжённой гармонической функции',
 'corollary:5.3':'Гармоничность вещественной и мнимой частей',
 'theorem:7.1':'Свойства комплексного интеграла', 'theorem:7.2':'Первообразные отличаются константой',
 'theorem:7.3':'Первообразная и независимость интеграла от пути',
 'corollary:7.4':'Критерий существования первообразной',
 'corollary:7.5':'Первообразная из интеграла с переменным верхним пределом',
 'corollary:8.2':'Формула Ньютона–Лейбница', 'lemma:8.1':'Лемма Гурса',
 'lemma:8.2':'Разбиение области на выпуклые многоугольники', 'lemma:8.3':'Теорема Коши для замкнутой ломаной',
 'theorem:8.2':'Интегральная теорема Коши', 'theorem:8.4':'Граничная теорема Коши',
 'theorem:8.5':'Обобщённая теорема Коши', 'theorem:9.1':'Интегральная формула Коши',
 'theorem:9.2':'Голоморфность интеграла Коши', 'theorem:9.3':'Бесконечная дифференцируемость голоморфной функции',
 'theorem:9.4':'Теорема Мореры', 'theorem:9.5':'Теорема о стирании разреза',
 'theorem:10.1':'Первая теорема Абеля', 'theorem:10.2':'Разложение голоморфной функции в ряд Тейлора',
 'lemma:10.1':'Локально равномерная сходимость и компакты',
 'theorem:10.3':'Теорема Вейерштрасса', 'theorem:10.5':'Теорема единственности',
 'theorem:11.1':'Кольцо сходимости ряда Лорана', 'theorem:11.2':'Теорема Лорана–Вейерштрасса',
 'theorem:11.3':'Единственность разложения в ряд Лорана',
 'corollary:11.2':'Неравенство Коши для коэффициентов ряда Лорана',
 'theorem:12.1':'Классификация изолированных особых точек',
 'theorem:12.2':'Теорема Сохоцкого', 'theorem:12.3':'Теорема Пикара',
 'theorem:12.4':'Целые функции полиномиального роста', 'corollary:12.5':'Теорема Лиувилля',
 'corollary:12.6':'Целая функция с полюсом на бесконечности',
 'theorem:13.1':'Теорема Коши о вычетах', 'theorem:13.2':'Вычисление интеграла по вещественной прямой',
 'lemma:13.2':'Лемма Жордана', 'theorem:14.1':'Обобщённая теорема Лиувилля',
 'theorem:14.2':'Теорема Миттаг–Леффлера', 'theorem:14.3':'Разложение мероморфной функции',
 'theorem:15.1':'Теорема об обратной функции', 'theorem:15.2':'Непрерывная ветвь аргумента на кривой',
 'theorem:15.4':'Критерий существования голоморфного логарифма',
 'theorem:15.5':'Ветви логарифма и первообразные', 'theorem:15.6':'Критерий существования голоморфного корня',
 'theorem:15.7':'Различие регулярных ветвей корня',
 'lemma:16.1':'Конечность числа нулей на компакте', 'lemma:16.2':'Конечность числа нулей и полюсов на компакте',
 'theorem:16.1':'Логарифмическая производная и число нулей',
 'theorem:16.2':'Принцип аргумента', 'theorem:16.3':'Теорема Руше',
 'theorem:16.4':'Основная теорема алгебры', 'lemma:17.1':'Локальная структура голоморфного отображения',
 'theorem:17.1':'Принцип сохранения области', 'theorem:17.2':'Принцип максимума модуля',
 'theorem:17.3':'Максимум и минимум гармонической функции', 'lemma:17.2':'Лемма Шварца',
 'theorem:18.1':'Критерий конформности в точке', 'theorem:18.2':'Конформная инвариантность гармоничности',
 'theorem:18.3':'Теорема Римана о конформной эквивалентности',
 'theorem:18.4':'Принцип соответствия границ', 'theorem:18.5':'Обратный принцип соответствия границ',
 'theorem:19.1':'Конформность дробно-линейного отображения',
 'theorem:19.2':'Автоморфизмы единичного круга', 'theorem:19.5':'Единственность нормированного отображения Римана',
 'theorem:23.1':'Принцип симметрии Римана–Шварца', 'corollary:23.3':'Принцип симметрии для отображений',
 'corollary:15.1':'Голоморфность обратной однолистной функции',
 'proposition:7.1':'Разбиение замкнутой кривой на простые кривые и складки',
 'corollary:10.1':'Критерий локально равномерной сходимости через замкнутые круги',
 'corollary:10.2':'Голоморфность суммы и дифференцирование степенного ряда',
 'corollary:10.3':'Изолированность нулей голоморфной функции',
 'corollary:10.4':'Совпадение голоморфных функций по множеству с предельной точкой',
 'corollary:12.1':'Голоморфное продолжение в устранимую особую точку',
 'corollary:12.2':'Представление функции в окрестности полюса заданного порядка',
 'corollary:12.3':'Тип особой точки частного через порядки нулей',
 'corollary:12.4':'Существенная особая точка и бесконечная главная часть ряда Лорана',
 'corollary:13.1':'Вычет в конечной точке и коэффициент ряда Лорана',
 'corollary:13.2':'Вычет в устранимой особой точке и простом полюсе',
 'corollary:13.3':'Вычет на бесконечности и коэффициент ряда Лорана',
 'corollary:13.4':'Сумма вычетов, включая бесконечность',
 'lemma:13.1':'Оценка интеграла по большой полуокружности',
 'corollary:15.2':'Изменение знака приращения аргумента при обращении кривой',
 'corollary:15.3':'Кратность приращения аргумента замкнутой кривой числу 2π',
 'corollary:15.4':'Голоморфный логарифм ненулевой функции в односвязной области',
 'corollary:15.5':'Формула ветви логарифма через интеграл логарифмической производной',
 'corollary:15.6':'Ветви логарифма в односвязной области без нуля',
 'lemma:15.1':'Постоянство непрерывной функции с отделёнными значениями',
 'corollary:15.7':'Формула голоморфной ветви корня через приращение аргумента',
 'corollary:15.8':'Ветви корня в односвязной области без нуля',
 'corollary:17.1':'Критерий локальной однолистности голоморфной функции',
 'corollary:18.1':'Ненулевой вычет при конформности на бесконечности',
 'corollary:18.2':'Конформность в неустранимой особой точке и простой полюс',
 'corollary:19.1':'Тождественность нормированного автоморфизма круга',
}

BOOK_SECTIONS = [
 (1,'Комплексные числа',7),(2,'Последовательности, ряды и сфера Римана',14),
 (3,'Множества и области',20),(4,'Предел и непрерывность',24),
 (5,'Комплексная производная и гармонические функции',28),(6,'Элементарные функции',36),
 (7,'Комплексное интегрирование',41),(8,'Интегральная теорема Коши',57),
 (9,'Формула Коши, Морера, стирание разреза',67),(10,'Степенные ряды',74),
 (11,'Ряд Лорана',86),(12,'Изолированные особые точки и целые функции',91),
 (13,'Вычеты',101),(14,'Мероморфные функции',110),(15,'Ветви многозначных функций',117),
 (16,'Принцип аргумента',146),(17,'Геометрические принципы',150),(18,'Конформные отображения',154),
 (19,'Дробно-линейное отображение',160),(20,'Функция Жуковского',170),
 (21,'Степенная функция',175),(22,'Экспоненциальная функция',177),(23,'Принцип симметрии',179),
 (24,'Задача Дирихле — дополнительная глава',180),(25,'Аналитическое продолжение — дополнительная глава',187),
]

def clean(text):
    text=re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f]', ' ', text)).strip()
    for word in ['Определение','Теорема','Лемма','Следствие','Утверждение','Предложение']:
        text=re.sub(r'\b'+r'\s*'.join(word)+r'\b',word,text,flags=re.I)
    return text

def page_lines(page):
    result=[]
    for b in page.get_text('dict')['blocks']:
        for line in b.get('lines',[]):
            spans=line['spans']
            result.append({'text':clean(''.join(s['text'] for s in spans)),
                           'rect':list(line['bbox']), 'colors':{s['color'] for s in spans}})
    return sorted(result,key=lambda l:(round(l['rect'][1],1),l['rect'][0]))

def claim_key(kind,num):
    return KINDS[kind]+':'+num

def identify_ref(kind,num):
    k=next((v for prefix,v in [('теорем','theorem'),('лемм','lemma'),('определени','definition'),
                             ('следстви','corollary'),('утверждени','proposition')]
            if kind.lower().startswith(prefix)),None)
    return k+':'+num if k else None

def segments_after(doc, lines, start_page, start_line, limit_page):
    """Keep exactly the source statement, stopping before proof or next claim."""
    result=[]
    text=[]
    done=False
    for pi in range(start_page,min(limit_page,len(doc))):
        selected=[]
        for li,line in enumerate(lines[pi]):
            if pi==start_page and li<start_line:continue
            y=line['rect'][1]
            if y>doc[pi].rect.height-38:continue
            if pi!=start_page and y<45:continue
            if (pi!=start_page or li!=start_line) and (
               (PURPLE in line['colors'] and HEAD.match(line['text'])) or BLUE in line['colors'] or
               (selected and PURPLE not in line['colors'] and len(clean(line['text']))>35)):
                done=True;break
            if pi!=start_page and not selected and PURPLE not in line['colors']:
                continue
            selected.append(line);text.append(line['text'])
        if selected:
            top=min(l['rect'][1] for l in selected)-3
            bottom=max(l['rect'][3] for l in selected)+4
            result.append({'page':pi+1,'rect':[38,round(top,2),557,round(bottom,2)]})
        if done:break
    return result,clean(' '.join(text))

def section_for(sections,page):
    return next((s for s in sections if s['start']<=page<=s['end']),None)

def main():
    (ROOT/'sources').mkdir(exist_ok=True)
    sources={'program':WORK/'upload/02-tfkp_20_full.pdf',
             'tickets':WORK/'upload/01-tfkp_32_tickets_full.pdf',
             'book':ROOT/'sources/hasanov-2022.pdf'}
    names={'program':'tfkp-program-20.pdf','tickets':'tfkp-tickets-32.pdf','book':'hasanov-2022.pdf'}
    for key in ['program','tickets']:
        target=ROOT/'sources'/names[key]
        if not sources[key].exists():sources[key]=target
        if sources[key].resolve()!=target.resolve():shutil.copyfile(sources[key],target)
    docs={k:fitz.open(p) for k,p in sources.items()}
    printed_to_pdf={}
    for pi,p in enumerate(docs['book']):
        for w in p.get_text('words'):
            if w[4].isdigit() and 1<=int(w[4])<=201 and w[1]>p.rect.height*.9 and p.rect.width*.4<w[0]<p.rect.width*.6:
                printed_to_pdf[int(w[4])]=pi+1
    assert printed_to_pdf[7]==8 and printed_to_pdf[28]==29 and printed_to_pdf[201]==202
    metadata={};cards={};card_locations=defaultdict(lambda:defaultdict(list));all_lines={}
    for key,doc in docs.items():
        if key=='book':
            sections=[{'id':n,'title':title,'start':printed_to_pdf[page],'printedPage':page,'extra':n>=24}
                      for n,title,page in BOOK_SECTIONS]
        else:
            sections=[{'id':i+1,'title':re.sub(r'^\d+\.\s*','',title),'start':page}
                      for i,(_,title,page) in enumerate(doc.get_toc())]
        for i,s in enumerate(sections):
            s['end']=sections[i+1]['start']-1 if i+1<len(sections) else len(doc)
            first_text=clean(doc[s['start']-1].get_text())
            s['source']=re.search(r'Хасанов:\s*(.+?)(?=Определение|Теорема|Лемма|Следствие|$)',first_text)
            s['source']=s['source'].group(0)[:220] if s['source'] else ''
            program_match=re.search(r'Программа Волкова:\s*пп?\.\s*([^Х]+)',first_text)
            s['programIds']=[int(x) for x in re.findall(r'\d+',program_match.group(1)) if 1<=int(x)<=20] if key=='tickets' and program_match else []
            s['text']=clean(' '.join(doc[p-1].get_text() for p in range(s['start'],s['end']+1)))
        lines=[page_lines(p) for p in doc];all_lines[key]=lines
        metadata[key]={'file':'./sources/'+names[key],'pages':len(doc),'sections':sections,
                       'sha256':hashlib.sha256((ROOT/'sources'/names[key]).read_bytes()).hexdigest(),
                       'pageIndex':[]}
        for pi,p in enumerate(doc):
            page={'width':round(p.rect.width,2),'height':round(p.rect.height,2),'links':[],'claims':[],
                  'text':clean(p.get_text())}
            if key=='book':page['printedPage']=next((n for n,v in printed_to_pdf.items() if v==pi+1),None)
            metadata[key]['pageIndex'].append(page)
            for li,line in enumerate(lines[pi]):
                m=HEAD.match(line['text'])
                if not m or (key!='book' and PURPLE not in line['colors']):continue
                ckey=claim_key(*m.groups());cid=ckey.replace(':','-').replace('.','-')
                if key=='book' and ckey not in cards:continue
                section=section_for(sections,pi+1)
                rect=[round(x,2) for x in line['rect']]
                page['claims'].append({'id':cid,'rect':rect})
                loc={'doc':key,'page':pi+1,'y':round(rect[1],2),'section':section['id'] if section else 1}
                card_locations[ckey][key].append(loc)
                if key=='book':continue
                segments,answer_text=segments_after(doc,lines,pi,li,section['end'] if section else len(doc))
                if ckey not in cards:
                    parenthetic=re.search(r'\(([^)]*)\)',line['text'])
                    fallback=parenthetic.group(1) if parenthetic and 'Хасанов' not in parenthetic.group(1) else clean(answer_text[len(line['text']):])[:110]
                    title=NAMES.get(ckey,parenthetic.group(1) if parenthetic and 'Хасанов' not in parenthetic.group(1) else m.group(1)+' '+m.group(2))
                    cards[ckey]={'id':cid,'key':ckey,'kind':KINDS[m.group(1)],'label':m.group(1)+' '+m.group(2),
                      'title':title,'heading':clean(line['text']),'answerDoc':key,'segments':segments,
                      'text':answer_text,'locations':{}}
    for key,card in cards.items():card['locations']=dict(card_locations[key])

    # Index exact statement mentions and page/ticket references as real reader links.
    for dkey,doc in docs.items():
        for pi,p in enumerate(doc):
            page=metadata[dkey]['pageIndex'][pi]
            grouped=defaultdict(list)
            for word in p.get_text('words'):grouped[(word[5],word[6])].append(word)
            for words in grouped.values():
                words.sort(key=lambda w:w[0]);text=' '.join(w[4] for w in words)
                starts=[];at=0
                for w in words:starts.append((at,at+len(w[4]),w));at+=len(w[4])+1
                def rect_for(match):
                    ws=[w for a,b,w in starts if a<match.end() and b>match.start()]
                    return [round(min(w[0] for w in ws),2),round(min(w[1] for w in ws),2),
                            round(max(w[2] for w in ws),2),round(max(w[3] for w in ws),2)]
                for m in REF.finditer(text):
                    c=cards.get(identify_ref(m.group('kind'),m.group('num')))
                    if not c:continue
                    r=rect_for(m)
                    # A statement's own heading is an anchor, not a self-link.
                    if any(a['id']==c['id'] and abs(a['rect'][1]-r[1])<5 for a in page['claims']):continue
                    page['links'].append({'rect':r,'claim':c['id'],'label':c['label']+' — '+c['title']})
                for pattern,ckey in ALIASES:
                    for m in re.finditer(pattern,text,re.I):
                        c=cards.get(ckey)
                        if not c:continue
                        r=rect_for(m)
                        if any(a['id']==c['id'] and abs(a['rect'][1]-r[1])<5 for a in page['claims']):continue
                        if any(l.get('claim')==c['id'] and abs(l['rect'][1]-r[1])<3 for l in page['links']):continue
                        page['links'].append({'rect':r,'claim':c['id'],'label':c['label']+' — '+c['title']})
                for m in re.finditer(r'(?:билет(?:е|а|у)?|пункт(?:е|а|у)?)\s+(\d{1,2})',text,re.I):
                    target='tickets' if m.group(0).lower().startswith('билет') else 'program'
                    num=int(m.group(1));section=next((s for s in metadata[target]['sections'] if s['id']==num),None)
                    if section:page['links'].append({'rect':rect_for(m),'doc':target,'page':section['start'],'label':m.group(0)})
                for m in re.finditer(r'с\.\s*(\d{1,3})(?:\s*[–-]\s*\d{1,3})?\s+настоящего\s+PDF',text):
                    num=int(m.group(1))
                    if 1<=num<=len(doc):page['links'].append({'rect':rect_for(m),'doc':dkey,'page':num,'label':'Страница '+str(num)})
                for m in re.finditer(r'с\.\s*(\d{1,3})(?:\s*[–-]\s*\d{1,3})?',text):
                    if re.match(r'\s+настоящего\s+PDF',text[m.end():]):continue
                    if dkey!='book' and 'Хасанов' not in text:continue
                    num=printed_to_pdf.get(int(m.group(1)))
                    if num:
                        page['links'].append({'rect':rect_for(m),'doc':'book','page':num,'label':'Хасанов, печатная страница '+m.group(1)})
            # Preserve every actual PDF annotation, including TOC and proof links.
            for l in p.get_links():
                if 'page' in l and l['page']>=0:
                    page['links'].append({'rect':[round(x,2) for x in l['from']],
                                         'doc':dkey,'page':l['page']+1,'label':'Перейти к доказательству'})
                elif l.get('uri','').startswith('https://'):
                    page['links'].append({'rect':[round(x,2) for x in l['from']],
                                         'url':l['uri'],'label':'Открыть источник'})
    for dkey,meta in metadata.items():
        for s in meta['sections']:
            pages=meta['pageIndex'][s['start']-1:s['end']]
            s['claimIds']=list(dict.fromkeys(c['id'] for pg in pages for c in pg['claims']))
            s['references']=list(dict.fromkeys(l['claim'] for pg in pages for l in pg['links'] if 'claim' in l))
    result={'schemaVersion':1,'pdfjsVersion':'5.6.205','docs':metadata,'cards':list(cards.values()),
      'sourceNotes':{'program':'20 пунктов официальной программы Волкова; полный присланный PDF.',
       'tickets':'32 предполагаемых билета — рабочее разбиение, а не утверждённый комплект экзаменационных билетов.',
       'book':'А. А. Хасанов, МФТИ, 2022. Все 204 страницы PDF, включая дополнительные §§24–25.'}}
    out=ROOT/'data/theory.json';out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
    summary={'programSections':20,'ticketSections':32,'bookSections':25,'cards':len(cards),
      'definitions':sum(c['kind']=='definition' for c in cards.values()),
      'sourcePages':{k:len(d) for k,d in docs.items()},
      'links':{k:sum(len(p['links']) for p in m['pageIndex']) for k,m in metadata.items()},
      'emptyAnswers':[c['id'] for c in cards.values() if not c['segments']]}
    (ROOT/'audit/theory-2026-10-09.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
