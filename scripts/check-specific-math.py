"""Checks of the corrected branch, inverse/product series, source fraction and special cases."""
from math_support import *
import mpmath as mp
import numpy as np
mp.mp.dps=40
N=65536;theta=2*np.pi*(np.arange(N)+.173)/N
def contour(fn,r,expected,id):
    q=r*np.exp(1j*theta);value=2*np.pi*np.mean(fn(q)*1j*q);err=abs(value-complex(expected))/(1+abs(expected));assert err<1e-9,(id,err)

id='2014-2015-осень-v41-n7';card=CAT[id]
g=lambda q:-q*np.sqrt(1+1j/q)
assert abs(g(1)-2**.25*np.exp(9j*np.pi/8))<1e-12
contour(lambda q:g(q)/(2*q+3),2,complex(S.N(answer_constant(card))),id)
id='2008-2009-осень-v81-n6';a=2**.25;contour(lambda q:np.cos(1/q)/(-1j*a*q*(1-1/q**2)**.25+1j*q),5**.5/2,complex(S.N(answer_constant(CAT[id]))),id)
u=S.symbols('u');inverse=u/(S.exp(u)-1);assert S.series(inverse,u,0,4).removeO()==1-u/2+u*u/12
id='oral-2007-2008-n17';contour(lambda q:1/(np.exp(1/q)-1),1,complex(S.N(answer_constant(CAT[id]))),id)
id='oral-2007-2008-n19';F=z**3*S.sin(1/z)/(z-1)**2;series=S.series(F.subs(z,1/u),u,0,4).removeO();assert S.expand(series).coeff(u,2)==S.Rational(17,6);assert S.residue(F,z,1)==3*S.sin(1)-S.cos(1)
contour(lambda q:q**3*np.sin(1/q)/(q-1)**2,.5,complex(S.N(answer_constant(CAT[id]))),id)
id='kolesnikova-2016-example-1-2';roots=[mp.exp(mp.pi*1j*k/4) for k in range(8)];assert all(abs(q**8-1)<mp.mpf('1e-35') for q in roots);assert all(abs(a-b)>mp.mpf('.7') for j,a in enumerate(roots) for b in roots[j+1:]);assert all(abs(8*q**7)>7 for q in roots)
id='kolesnikova-2016-example-2-3';assert '-i/\\sqrt2' in CAT[id]['statementPretty'];q=-I/S.sqrt(2);value=-3*I/S.sqrt(2);assert S.simplify(value*value-(q*q-4))==0 and S.simplify(q/value)==S.Rational(1,3)
id='2023-осень-v1-n1';P=9*z**4+12*z**3-5*z*z+6*z-1;assert S.expand((9*z*z-3*z+3)*(z*z+S.Rational(5,3)*z-S.Rational(1,3))-P)==0
for q in [(1-I*S.sqrt(11))/6,(1+I*S.sqrt(11))/6,(-5-S.sqrt(37))/6,(-5+S.sqrt(37))/6]:assert S.simplify(P.subs(z,q))==0
for id,expr,values in [('kolesnikova-2016-example-1-3',lambda q:mp.exp(q)+1,[1j*mp.pi*(2*k+1) for k in range(-3,4)]),('kolesnikova-2016-example-1-5',lambda q:mp.cosh(q)-.5,[1j*(s*mp.pi/3+2*mp.pi*k) for s in [-1,1] for k in range(-3,4)]),('kolesnikova-2016-example-1-6',lambda q:mp.sinh(q)-1j*mp.sqrt(3)/2,[1j*(a+2*mp.pi*k) for a in [mp.pi/3,2*mp.pi/3] for k in range(-3,4)]),('kolesnikova-2016-example-1-7',lambda q:mp.sin(q)-3,[mp.pi/2+2*mp.pi*k+s*1j*mp.log(3+2*mp.sqrt(2)) for s in [-1,1] for k in range(-3,4)]),('kolesnikova-2016-example-1-8',lambda q:mp.cosh(q)+1,[1j*mp.pi*(2*k+1) for k in range(-3,4)])]:assert all(abs(expr(q))<mp.mpf('1e-34') for q in values),id
y=S.symbols('y',real=True)
U=-3*x*x*y-4*x*x+y**3+4*y*y;V=x**3-3*x*y*y-8*x*y
assert S.diff(U,x)==S.diff(V,y) and S.diff(U,y)==-S.diff(V,x)
U=x**3-3*x*(y-1)**2;derivative=S.diff(U,x)-I*S.diff(U,y);assert S.expand(derivative-3*(x+I*y-I)**2)==0
for U,V in [(x*x,x*y),(x*y,y*y)]:assert S.solve([S.diff(U,x)-S.diff(V,y),S.diff(U,y)+S.diff(V,x)],(x,y))=={x:0,y:0}
assert S.residue((S.sin(3*z)-3*S.sin(z))/((S.sin(z)-z)*S.sin(z)),z,0)==24
assert S.residue(1/(z*(S.exp(z)-1)),z,0)==-S.Rational(1,2)
for a,b in [(3,1),(2,mp.mpf('.5')),(5,4)]:
    v=mp.quad(lambda q:1/(a+b*mp.cos(q))**2,[0,mp.pi,2*mp.pi]);assert abs(v-2*mp.pi*a/(a*a-b*b)**mp.mpf('1.5'))<mp.mpf('1e-34')
mp.mp.dps=25
for a in [mp.mpf('.5'),mp.mpf('2'),mp.mpf('-1')]:
    v=mp.quadosc(lambda q:mp.sin(a*q)/q,[0,mp.inf],omega=abs(a));assert abs(v-mp.sign(a)*mp.pi/2)<mp.mpf('1e-22')
for fn,zeros in [(lambda q:mp.cos(q*q),lambda n:mp.sqrt(mp.pi*(n-mp.mpf('.5')))),(lambda q:mp.sin(q*q),lambda n:mp.sqrt(mp.pi*n))]:assert abs(mp.quadosc(fn,[0,mp.inf],zeros=zeros)-mp.sqrt(mp.pi/8))<mp.mpf('1e-22')
print('Specific mathematics OK: required four rewrites, source fraction, quartic roots, elementary equation families, CR, textbook residues, periodic/Dirichlet/Fresnel integrals')
