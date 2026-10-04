import json, re
from pathlib import Path
import sympy as S
from sympy.parsing.latex import parse_latex
from sympy.core.function import AppliedUndef

import subprocess
ROOT=Path(__file__).resolve().parents[1]
CAT={q['id']:q for q in json.loads(subprocess.check_output(['node',str(ROOT/'scripts/export-catalog.js')]))}
z,x,u,w,t=S.symbols('z x u w t')
I,pi=S.I,S.pi
L=lambda a:S.latex(a)
M=lambda a:r'\('+L(a)+r'\)'
D=lambda a:'$$'+L(a)+'$$'

def fraction_braces(src):
    def atom(pos):
        while pos<len(src) and src[pos].isspace():pos+=1
        if src[pos]=='{':
            depth=1;j=pos+1
            while depth:depth+=(src[j]=='{')-(src[j]=='}');j+=1
            return src[pos+1:j-1],j
        if src[pos]=='\\':
            token=re.match(r'\\[A-Za-z]+',src[pos:])[0];return token,pos+len(token)
        return src[pos],pos+1
    out='';at=0
    while True:
        start=src.find(r'\frac',at)
        if start<0:return out+src[at:]
        a,end=atom(start+5);b,end=atom(end)
        out+=src[at:start]+r'\frac{'+fraction_braces(a)+'}{'+fraction_braces(b)+'}';at=end

def parse(src):
    src=src.strip().rstrip('.,;')
    src=src.replace(r'\log',r'\ln')
    src=src.replace(r'\operatorname{ch}',r'\cosh').replace(r'\operatorname{sh}',r'\sinh').replace(r'\operatorname{ctg}',r'\cot').replace(r'\operatorname{tg}',r'\tan')
    src=re.sub(r'(\d)\\,\s*(\d)',r'\1\\cdot\2',src)
    src=src.replace(r'\left','').replace(r'\right','').replace(r'\,',' ').replace(r'\!','').replace(r'{,}','.')
    src=fraction_braces(src)
    src=re.sub(r'\\(?:bigl|bigr|Bigl|Bigr|big|Big|bigg|Bigg)\b','',src)
    src=re.sub(r'\\(sin|cos|tan|cot|sinh|cosh|ln)\^([0-9])\s*([0-9])',r'\\\1^{\2}{\3}',src)
    src=re.sub(r'\\(sin|cos|tan|cot|sinh|cosh|ln)\{\(([^()]*)\)\}\^(\{[^{}]+\}|[0-9])',r'(\\\1(\2))^\3',src)
    src=re.sub(r'\\frac\s*(\\[A-Za-z]+|[A-Za-z0-9])\s*([0-9])',r'\\frac{\1}{\2}',src)
    src=re.sub(r'\\frac\s*(\\[A-Za-z]+|[A-Za-z0-9])(?=\{)',r'\\frac{\1}',src)
    src=re.sub(r'([izxuwt])\s*\(',r'\1\\cdot(',src)
    src=re.sub(r'\\sqrt\s*([0-9])',r'\\sqrt{\1}',src)
    a=parse_latex(src)
    a=a.subs({S.Symbol('i'):I,S.Symbol('e'):S.E,S.Symbol('pi'):pi})
    for q in a.atoms(S.log):
        if len(q.args)==2:a=a.xreplace({q:S.log(q.args[0])/S.log(q.args[1])})
    for q in a.atoms(AppliedUndef):
        if str(q.func) in ['i','z','x','u','w','t'] and len(q.args)==1:a=a.xreplace({q:(I if str(q.func)=='i' else S.Symbol(str(q.func)))*q.args[0]})
    if a.atoms(AppliedUndef):raise ValueError(('unknown function',src,a))
    return a

def formulas(src):
    return [m[1] or m[2] for m in re.findall(r'(?:(\$\$)([\s\S]*?)\$\$)|(?:\\\(([\s\S]*?)\\\))',src)]

def maths(src):
    return [m.group(1) or m.group(2) for m in re.finditer(r'\$\$([\s\S]*?)\$\$|\\\(([\s\S]*?)\\\)',src)]

def function(t):
    for a in maths(t['statementPretty']):
        m=re.search(r'[fgh]\(z\)\s*=([\s\S]+)',a)
        if m:return parse(m.group(1))
    raise ValueError('no function '+t['id'])


def answer_constant(t):
    for a in reversed(maths(t['answer']) or [t['answer']]):
        a=a.replace(r'\displaystyle','')
        if '=' in a:a=a.rsplit('=',1)[1]
        a=a.strip().rstrip('.,;')
        try:
            b=parse(a)
            if not b.free_symbols:return b
        except Exception:pass
    raise ValueError('no constant answer '+t['id'])

def brace(s,pos):
    assert s[pos]=='{'
    depth=0
    for j in range(pos,len(s)):
        depth+=s[j]=='{';depth-=s[j]=='}'
        if depth==0:return s[pos+1:j],j+1
    raise ValueError('unbalanced brace')

def integral(card):
    src=next(a for a in maths(card['statementPretty']) if r'\int' in a)
    src=src.split(r'\int',1)[1].replace(r'\limits','').lstrip()
    limits={}
    while src and src[0] in '_^':
        key=src[0];src=src[1:].lstrip()
        if src[0]=='{':val,end=brace(src,0);src=src[end:].lstrip()
        elif src[0]=='\\':
            token=re.match(r'\\[A-Za-z]+',src);val=token[0];src=src[len(val):].lstrip()
        else:val=src[0];src=src[1:].lstrip()
        limits[key]=val
    # TeX sometimes puts the differential in the numerator of a fraction.
    src=re.sub(r'\\[,!; ]',' ',src)
    src=re.sub(r'\bd\s*x\b(?=\s*/)', '1',src)
    src=re.sub(r'\bd\s*x\b','',src).strip().rstrip('.,;')
    src=re.sub(r'\{\s*\}','{1}',src)
    src=src.replace(r'\sqrt[3]x',r'\sqrt[3]{x}').replace(r'\sqrt[5]x',r'\sqrt[5]{x}').replace(r'\sqrt x',r'\sqrt{x}').replace(r'\sqrt2x',r'\sqrt{2}x')
    return parse(src),parse(limits.get('_','0')),parse(limits.get('^',r'\infty'))
