"""Independent checks of the final merged catalogue, without changing any task data.

Dependencies: requirements-checks.txt. Run --group laurent|real|contour|algebra|all.
Numerical checks supplement the proofs; essential/accumulation classifications are reviewed analytically.
"""
from math_support import *
import argparse
import mpmath as mp
import numpy as np
mp.mp.dps=60
args=argparse.ArgumentParser();args.add_argument('--group',choices=['laurent','real','contour','algebra','all'],default='all');args=args.parse_args()
checked=[]
def record(id,kind,error=0):
    assert np.isfinite(float(error)),(id,error)
    checked.append({'id':id,'check':kind,'relativeError':float(error)})
def constant(card):
    a=answer_constant(card);return mp.mpc(str(S.N(S.re(a),65)),str(S.N(S.im(a),65)))
def relative(value,expected):return abs(value-expected)/(1+abs(expected))

def laurent():
    for card in CAT.values():
        if card['primaryTopic']!='Ряды Лорана и Тейлора':continue
        audit=card['laurentAudit'];id=card['id']
        if audit.get('checkType')=='nonrational-series':
            cases={
            'kolesnikova-2016-example-1-11':([.3,1.1,1.7],lambda q:mp.e**4*(1+q*q)*mp.exp(-q*q),lambda q:mp.e**4*(1+mp.fsum((-1)**(k-1)*(k-1)*q**(2*k)/mp.factorial(k) for k in range(1,200)))),
            '2023-осень-v1-n4':([.4,1.2,2.3],lambda q:mp.e*(1/q+3/q**2)*mp.exp(3*q),lambda q:3*mp.e/q**2+10*mp.e/q+mp.e*mp.fsum(3**(k+1)*(k+11)*q**k/mp.factorial(k+2) for k in range(200))),
            'oral-2007-2008-n9':([.45,1.7],lambda q:mp.cos(q)+mp.sinh(1/q)+1/(q-1)**2,lambda q:mp.fsum((-1)**n*q**(2*n)/mp.factorial(2*n)+q**(-2*n-1)/mp.factorial(2*n+1) for n in range(200))+(mp.fsum((n+1)*q**n for n in range(600)) if abs(q)<1 else mp.fsum((n+1)*q**(-n-2) for n in range(600)))),
            'oral-2007-2008-n33':([.5,2],lambda q:1/mp.sqrt(1-q*q) if abs(q)<1 else -1j/q/mp.sqrt(1-1/q**2),lambda q:mp.fsum(mp.binomial(2*n,n)/4**n*q**(2*n) for n in range(200)) if abs(q)<1 else -1j/q*mp.fsum(mp.binomial(2*n,n)/4**n*q**(-2*n) for n in range(200)))}
            radii,fn,series=cases[id];errors=[]
            for r in radii:
                for a in [.25,1.1,2.4]:
                    q=mp.mpc(r*mp.cos(a),r*mp.sin(a));err=relative(series(q),fn(q));assert err<mp.mpf('1e-25'),(id,err);errors.append(err)
            record(id,'nonrational Laurent/Taylor sums',max(errors));continue
        f=function(card)
        for a in audit.get('rings',[audit]):
            c=S.sympify(a['center']);g=S.cancel(f.subs(z,u+c),extension=I);num,den=S.fraction(g);roots=S.roots(den,u);assert sum(roots.values())==S.degree(den,u)
            low=S.sympify(a['inner']);high=S.sympify(a['outer']);z0=S.sympify(a['point']);distance=S.Abs(z0-c);assert float(low)<float(distance)<float(high)
            actual={str(S.simplify(b+c)):m for b,m in roots.items()};stored={str(S.simplify(S.sympify(b))):m for b,m,_ in a['poles']};assert actual==stored,(id,actual,stored)
            poly,rem=S.div(num,den,u);coeff=[]
            for b,m in roots.items():
                H=S.cancel(g*(u-b)**m,extension=I)
                for k in range(1,m+1):
                    A=S.simplify(S.diff(H,u,m-k).subs(u,b)/S.factorial(m-k))
                    if A!=0:coeff.append((b,k,A))
            assert S.cancel(g-poly-sum(A/(u-b)**k for b,k,A in coeff),extension=I)==0
            radius=(float(low)+float(high))/2 if high!=S.oo else max(1,float(low)*2)
            if low==0:radius=float(high)*.47 if high!=S.oo else 1
            fn=S.lambdify(u,g,'mpmath');pp=S.lambdify(u,poly,'mpmath');errors=[]
            for theta in [.31,1.22,2.43]:
                point=radius*mp.exp(1j*theta);value=pp(point)
                for b,k,A in coeff:
                    bv=mp.mpc(str(S.N(S.re(b),65)),str(S.N(S.im(b),65)));Av=mp.mpc(str(S.N(S.re(A),65)),str(S.N(S.im(A),65)))
                    if b==0:value+=Av/point**k
                    elif float(S.Abs(b))<=float(low):value+=mp.fsum(Av*mp.binomial(n+k-1,k-1)*bv**n/point**(n+k) for n in range(600))
                    else:value+=mp.fsum(Av*(-bv)**(-k)*mp.binomial(n+k-1,k-1)*(point/bv)**n for n in range(600))
                err=relative(value,fn(point));assert err<mp.mpf('1e-17'),(id,err);errors.append(err)
            record(id,'rational Laurent ring and three sums',max(errors))

def components(f):
    base=S.Mul(*(q for q in S.Mul.make_args(f) if q.is_rational_function(x)));expanded=S.expand(S.cancel(f/base).rewrite(S.exp));grouped={}
    for term in S.Add.make_args(expanded):
        exps=[(q,p) for q,p in term.as_powers_dict().items() if q.func==S.exp or q==S.E];power=sum((q.args[0]*p if q.func==S.exp else p) for q,p in exps)
        k=S.simplify(S.diff(power,x)/I);assert not k.free_symbols
        R=S.cancel(base*term/S.Mul(*(q**p for q,p in exps)))*S.exp(S.simplify(power-I*k*x));assert R.is_rational_function(x);grouped[k]=grouped.get(k,0)+R
    return [(k,S.cancel(R)) for k,R in grouped.items() if S.simplify(R)!=0]
def real():
    for card in CAT.values():
        if card['primaryTopic']!='Интегралы по вещественной оси' or card['id'].startswith('kolesnikova-2016-example-1-2') and card['id']!='kolesnikova-2016-example-1-25':continue
        f,a,b=integral(card)
        if a!=-S.oo or b!=S.oo:continue
        total=0
        for k,R in components(f):
            sign=1 if k>=0 else -1;R=R.subs(x,z);num,den=S.fraction(R);roots=S.roots(den,z);assert sum(roots.values())==S.degree(den,z)
            assert all(abs(complex(S.N(r)).imag)>1e-10 for r in roots)
            assert S.degree(den,z)-S.degree(num,z)>=(2 if k==0 else 1)
            # SymPy's local residue computation is independent of the authored derivative calculation.
            residues=sum(S.residue(R*S.exp(I*k*z),z,r) for r in roots if sign*complex(S.N(r)).imag>0)
            total+=sign*2*pi*I*residues
        expected=constant(card);value=mp.mpc(str(S.N(S.re(total),65)),str(S.N(S.im(total),65)));err=relative(value,expected);assert err<mp.mpf('1e-25'),(card['id'],err);record(card['id'],'independent symbolic real-axis residues',err)

def circle(card):
    formula=next(a for a in maths(card['statementPretty']) if r'\oint' in a);body=formula.split(r'\oint',1)[1].replace(r'\limits','').strip()
    assert body.startswith('_{');boundary,end=brace(body,1);body=body[end:].strip();expr,radius=boundary.split('=',1);c=S.simplify(z-parse(expr.strip('|')));r=parse(radius)
    body=re.sub(r'\bdz\b','',body.replace('dz/','1/',1)).replace(r'\,',' ').strip().rstrip('.,;');body=re.sub(r'\{\s*\}','{1}',body);return parse(body),c,r
def contour():
    excluded={'2023-осень-v1-n2','2023-осень-v1-n3','kolesnikova-2016-example-1-17','kolesnikova-2016-example-1-18','kolesnikova-2016-example-1-19','kolesnikova-2016-example-1-20','oral-2007-2008-n15','kolesnikova-2016-example-1-23'}
    theta=(np.arange(16384)+.137)*2*np.pi/16384
    for card in CAT.values():
        if card['primaryTopic']!='Контурные интегралы и вычеты' or card['id'] in excluded:continue
        id=card['id']
        if id=='kolesnikova-2016-example-1-21':
            n=2016;t=2*np.pi*(np.arange(n*256)+.173)/(n*256);qn=np.exp(1+1j*n*t);val=2*np.pi*1j*np.mean(np.exp(qn)/(qn-1));err=relative(val,complex(constant(card)));assert err<1e-11;record(id,'homologous contour for large exponential',err);continue
        f,c,r=circle(card);assert not f.free_symbols-{z}
        if id.startswith('2000-2001'):r=S.Rational(11,10)
        fn=S.lambdify(z,f,modules=[{'cot':lambda q:1/np.tan(q),'coth':lambda q:1/np.tanh(q)},'numpy']);pts=complex(S.N(c))+float(r)*np.exp(1j*theta);value=np.mean(fn(pts)*1j*float(r)*np.exp(1j*theta))*2*np.pi
        err=relative(value,complex(constant(card)));assert np.isfinite(float(err)) and err<3e-9,(id,err);record(id,'direct circle quadrature',err)

def realpower(a,b):
    b=mp.mpf(b);rat=S.Rational(str(b)).limit_denominator(20)
    if abs(float(rat)-float(b))<1e-30 and a<0 and rat.q%2:return (-1 if rat.p%2 else 1)*mp.power(-a,b)
    return mp.power(a,b)
def algebra():
    for card in CAT.values():
        if card['primaryTopic']!='Интегралы с алгебраической ветвью' and card['id']!='2021-осень-v1-n6':continue
        id=card['id'];f,a,b=integral(card)
        if id=='2006-2007-осень-v52-n5':
            assert 'расход' in card['answer'].lower();real_f=f.replace(lambda q:isinstance(q,S.Pow) and q.exp.is_Rational and q.exp.q%2 and q.exp.q>1,lambda q:S.real_root(q.base,q.exp.q)**q.exp.p);coefficient=S.limit(real_f*x*x,x,0,dir='+');assert S.simplify(coefficient+S.real_root(2,3))==0;record(id,'nonintegrable interior pole');continue
        f=f.replace(lambda q:isinstance(q,S.Pow) and q.exp.is_Rational and q.exp.q>1,lambda q:S.Function('realpower')(q.base,q.exp));fn=S.lambdify(x,f,modules=[{'realpower':realpower},'mpmath'])
        if a==-S.oo:
            end=mp.mpf(str(S.N(b,65)));value=mp.quad(lambda v:fn(end-v),[0,.1,1,10,mp.inf])
        elif b==S.oo:
            start=mp.mpf(str(S.N(a,65)));value=mp.quad(lambda v:fn(start+v),[0,.1,1,10,mp.inf])
        else:
            left=mp.mpf(str(S.N(a,65)));right=mp.mpf(str(S.N(b,65)));value=mp.quad(fn,[left,left+(right-left)/10,(left+right)/2,right-(right-left)/10,right])
        if id=='2008-2009-осень-v84-n5':expected=mp.mpf('0.40334257295582052400248572340014536708653')
        elif id=='2008-2009-осень-v82-n5':expected=1j*mp.pi/4*(10-7*mp.sqrt(2))
        else:expected=constant(card)
        err=relative(value,expected);assert err<(mp.mpf('2e-12') if id=='2008-2009-осень-v84-n5' else mp.mpf('3e-9')),(id,err);record(id,'direct algebraic integral quadrature',err)

for name,fn in [('laurent',laurent),('real',real),('contour',contour),('algebra',algebra)]:
    if args.group not in [name,'all']:continue
    start=len(checked);fn();print(name,'OK:',len(checked)-start,'checks',flush=True)
print('Expanded mathematics OK:',len(set(r['id'] for r in checked)),'distinct tasks;',len(checked),'checks',flush=True)
