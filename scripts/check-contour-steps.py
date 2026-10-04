"""Check intermediate calculations against the actual displayed integrands.

Small independent contour integrals test each stated local residue; this catches
compensating numerator/denominator errors that a final-answer test cannot see.
"""
from math_support import *
import mpmath as mp
mp.mp.dps=50

def circle_source(card):
    formula=next(a for a in maths(card['statementPretty']) if r'\oint' in a)
    body=formula.split(r'\oint',1)[1].replace(r'\limits','').strip()
    boundary,end=brace(body,1);body=body[end:].strip()
    expr,radius=boundary.split('=',1)
    center=S.simplify(z-parse(expr.strip('|')))
    body=re.sub(r'\bdz\b','',body.replace('dz/','1/',1)).replace(r'\,',' ').strip().rstrip('.,;')
    return parse(body),center,parse(radius)

def number(expr):
    return mp.mpc(str(S.N(S.re(expr),55)),str(S.N(S.im(expr),55)))

def equal_function(a,b,label):
    # Four independent values also cover trigonometric transformations whose
    # equivalent exponential forms can be expensive to simplify symbolically.
    fa=S.lambdify(z,a,'mpmath');fb=S.lambdify(z,b,'mpmath')
    for point in [mp.mpc('.73','.61'),mp.mpc('1.83','-.44'),mp.mpc('-2.17','1.23'),mp.mpc('.31','-1.91')]:
        error=abs(fa(point)-fb(point))/(1+abs(fa(point)))
        assert error<mp.mpf('1e-40'),(label,error)

checked=0;local_checks=0;coefficient_checks=0
for card in CAT.values():
    audit=card.get('contourStepAudit')
    if not audit:continue
    id=card['id'];source,center,radius=circle_source(card)
    authored=S.sympify(audit['integrand']);equal_function(source,authored,id)
    assert S.simplify(center-S.sympify(audit['center']))==0
    assert S.simplify(radius-S.sympify(audit['radius']))==0
    if audit.get('transformed'):equal_function(source,S.sympify(audit['transformed']),id+' transform')
    fn=S.lambdify(z,source,'mpmath')
    for pole in audit.get('residues',[]):
        a=S.sympify(pole['point']);expected=S.sympify(pole['residue'])
        if pole['order']=='essential-even':
            equal_function(source,source.subs(z,-z),id+' even residue')
            assert expected==0
        else:
            av=number(a);eps=mp.mpf('.02')*min(1,abs(av) or 1)
            # Residue = mean F(a+eps e^it) eps e^it, independently of the
            # derivative or series coefficients in the written solution.
            value=mp.fsum(fn(av+eps*mp.exp(2j*mp.pi*(k+mp.mpf('.137'))/256))*eps*mp.exp(2j*mp.pi*(k+mp.mpf('.137'))/256) for k in range(256))/256
            err=abs(value-number(expected))/(1+abs(number(expected)))
            assert err<mp.mpf('1e-25'),(id,a,value,expected,err)
        local_checks+=1
    for key in ['simpleCoefficient','localCoefficient']:
        q=audit.get(key)
        if not q:continue
        a=S.sympify(q['point']);N=S.sympify(q['numerator']);Dn=S.sympify(q['denominator'])
        equal_function(source,N/Dn,id+' N/D')
        if key=='simpleCoefficient':
            actual_n=S.simplify(N.subs(z,a));actual_d=S.simplify(S.diff(Dn,z).subs(z,a))
            assert S.simplify(actual_n-S.sympify(q['numeratorValue']))==0
            assert S.simplify(actual_d-S.sympify(q['denominatorDerivative']))==0
            assert S.simplify(actual_n/actual_d-S.sympify(q['residue']))==0
        else:
            expansion=S.series(Dn.subs(z,a+u),u,0,4).removeO()
            assert S.expand(expansion).coeff(u,3)==0
            leading=S.expand(expansion).coeff(u,2)
            assert S.simplify(leading-S.sympify(q['leading']))==0
            derivative=S.simplify(S.diff(N,z).subs(z,a))
            assert S.simplify(derivative-S.sympify(q['numeratorDerivative']))==0
            assert S.simplify(derivative/leading-S.sympify(q['residue']))==0
        coefficient_checks+=1
    coefficients=audit.get('infinityCoefficients')
    if coefficients:
        actual=S.series(source.subs(z,1/w),w,0,2).removeO().expand()
        for exponent,value in coefficients.items():
            assert S.simplify(actual.coeff(w,int(exponent))-S.sympify(value))==0,(id,exponent)
            coefficient_checks+=1
        if audit.get('strategy')=='outside':
            expected=answer_constant(card)
            residues=sum(S.sympify(q['residue']) for q in audit['residues'])
            result=2*pi*I*(actual.coeff(w,1)-residues)
            assert abs(number(result-expected))<mp.mpf('1e-30'),(id,result,expected)
    checked+=1
assert checked==32,(checked,'expected 32 audited derivations')
print(f'Contour steps OK: {checked} source integrands; {local_checks} independent local residues; {coefficient_checks} intermediate coefficient checks')
