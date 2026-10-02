# Independent numerical contour integrals with branch continuation from source normalizations.
# Requires numpy.
import numpy as np, json, math
from pathlib import Path
pi=np.pi;I=1j;N=8192;results=[]
def polyline(points,steps=400):
 return np.concatenate([np.linspace(a,b,steps,endpoint=False) for a,b in zip(points,points[1:])]+[np.array([points[-1]])])
def continuation(P,n,points,value):
 zz=polyline(points);a=np.unwrap(np.angle(P(zz)));offset=(np.imag(value) if n==0 else n*np.angle(value))-a[0]
 a=a+offset
 return (np.log(np.abs(P(zz)))+I*a if n==0 else np.abs(P(zz))**(1/n)*np.exp(I*a/n))[-1]
def circle_case(id,P,n,start,norm,c,r,fn,expected,angle=0):
 t=angle+(np.arange(N)+.137)*2*pi/N;circle=c+r*np.exp(I*t)
 path=polyline(start+[circle[0]]);zz=np.concatenate([path,circle]);a=np.unwrap(np.angle(P(zz)));offset=(np.imag(norm) if n==0 else n*np.angle(norm))-a[0];a+=offset
 vals=np.log(np.abs(P(zz)))+I*a if n==0 else np.abs(P(zz))**(1/n)*np.exp(I*a/n);ff=vals[-N:]
 numerical=np.mean(fn(circle,ff)*I*r*np.exp(I*t))*2*pi;err=abs(numerical-expected);ok=bool(err<1e-9*max(1,abs(expected)))
 results.append({'id':id,'ok':ok,'error':float(err)});print(id,ok,err,flush=True)
P=lambda z:z*(1-z)**2;eps=.0000001
circle_case('1996-v1',P,3,[.5+I*eps,.5+I,2+I,2],P(.5+I*eps)**(1/3),0,2,lambda z,f:f/(z*z-1),2*pi*I*np.exp(-2*pi*I/3))
P=lambda z:(1-z)/(1+z)
circle_case('1996-v3',P,0,[.01*I,2*I],-2*I*np.arctan(.01),0,2,lambda z,f:f*np.exp(-2*I/(pi*z)),-8*pi*I,pi/2)
P=lambda z:z*z-1
circle_case('1996-v4-and-2000-v4',P,2,[0,-2*I,2-2*I,2],I,0,2,lambda z,f:(z+1)/((z+3)*(f-2*np.sqrt(2))),2*pi*I*(25*np.sqrt(2)/36-1))
for v,P,n,start,norm,r,fn,ev in [
(1,lambda z:z+16,4,[-32,-17-I,-15-I,0,12],2*np.exp(-pi*I/4),12,lambda z,f:(f-2)/(z*(z+10)),pi*I/5*(2-6**.25)),
(2,lambda z:z+5,0,[-6,-6-.5*I,-4-.5*I,0,4.5],-pi*I,4.5,lambda z,f:f/((z+4)*(z+1)**2),2*pi*I*(1/12-np.log(4)/9)),
(3,lambda z:z+9,3,[-10,-10+.5*I,-8+.5*I,0,2],np.exp(pi*I/3),2,lambda z,f:(f-2)/(z*(z+1)**2),2*pi*I*(9**(1/3)-25/12)),
(4,lambda z:z+3,0,[-4,-4+.5*I,-2+.5*I,0,2.5],pi*I,2.5,lambda z,f:f/((z-1)*(z+2)**2),2*pi*I*(np.log(4)/9-1/3))]:circle_case(f'1997-v{v}',P,n,start,norm,0,r,fn,ev)
circle_case('1998-v1',lambda z:(3-z)/z,2,[-1,-1+.5*I,1+.5*I,1-.5*I,4-.5*I,4],2*I,0,4,lambda z,f:z*z*f/(3+4*z),-2*pi*I*(9*I/64))
circle_case('1998-v2',lambda z:(z+5)/(1-z),0,[10,10-I,-2-I,-2,-1],np.log(5/3)-3*pi*I,-2,1,lambda z,f:(z+2+3*pi*I)*f/(z+2)**2,0)
circle_case('1998-v3',lambda z:2*z-z*z,2,[1,1-I,3-I,3],1,0,3,lambda z,f:z*f/(2*z+1),-2*pi*I*(-I/8))
circle_case('1998-v4',lambda z:(z-2)/(z+2),0,[0,-3*I,3-3*I,3],-5*pi*I,0,3,lambda z,f:z*z*f/(1+pi*I*z),0)
circle_case('1999-v1',lambda z:(2*I-z)/(z+1),0,[0,-1+2*I,-1+3*I,4*I],np.log(2)-3*pi*I/2,0,4,lambda z,f:z*f/(1+np.tan(1/z)),2*pi*I*(3.5+I*(2-3*pi)),pi/2)
circle_case('1999-v2',lambda z:z*z*(I-z),3,[-I,.25-I,.25+.5*I,.5*I,-4+.5*I,-4],2**(1/3)*np.exp(7*pi*I/6),0,4,lambda z,f:f/(1+np.exp(2/z)),pi/3-pi*I/9,pi)
circle_case('1999-v3',lambda z:(1-z)/(I*z+1),0,[0,5/np.sqrt(2)*(1+I)],-4*pi*I,0,5,lambda z,f:z*f/(np.sin(1/z)+np.cos(1/z)),2*pi*(1+33*pi/4),pi/4)
circle_case('1999-v4',lambda z:z*z*(z+2*I)**2,4,[-3*I,-.5-3*I,-.5-I,-I,5-I,5],-np.sqrt(3),0,5,lambda z,f:f/(1+2*np.sin(1/z)),-9*pi+4*pi*I)
circle_case('2000-v3',lambda z:2*z-8,3,[8,8+I,2+I,3.5],-1-I*np.sqrt(3),2,1.5,lambda z,f:1/(f-z+2),3*pi/5-9*pi*I/5)
for v,P,start,norm,c,target,ev in [
(1,lambda z:z*(z-4),[-5,-5-3*I,5-3*I,5+2*I,2+2*I,3+2*I],np.log(45),2+2*I,np.log(8)+3*pi*I,-4*pi),
(2,lambda z:z*z+4,[-4,-4-3*I,3-3*I,3,2,3],np.log(20),2,np.log(8)+2*pi*I,4*pi*I),
(3,lambda z:z*(z-4),[-4,-4+3*I,5+3*I,5-2*I,2-2*I,3-2*I],np.log(32),2-2*I,np.log(8)-3*pi*I,4*pi),
(4,lambda z:z*z+4,[4,4+3*I,-1+3*I,-1,0],np.log(20),-1,np.log(5)+2*pi*I,-5*pi*I)]:circle_case(f'2001-autumn-v{v}',P,0,start,norm,c,1,lambda z,f:1/(f-target),ev)
circle_case('2001-spring-v1',lambda z:(z+1)*(I-z)**2,3,[0,2],-1,0,2,lambda z,f:f/(z-1),2*pi*I/3*np.exp(4*pi*I/3)*(4-2*I))
circle_case('2001-spring-v3',lambda z:2*z*z+1,2,[0,-2,-2-2*I,1-2*I,1],1,0,1,lambda z,f:1/((z-2)*(f+3)),-pi*I/24)
P=lambda z:(z-2)**2*(2*I-z);start=-100;norm=np.exp(-pi*I/3)*start*((1-2/start)**2*(1-2*I/start))**(1/3)
circle_case('2001-spring-v4',P,3,[start,0,1],norm,0,1,lambda z,f:f/np.sinh(z)**3,-pi*I/9*(-np.sqrt(3)+I)*(9+I))
for id,P,qinf,C,direction,r,fn,ev in [
('2001-spring-v2',lambda z:(2+I*z)/(2+z),I,pi*I/2,-1+I,1,lambda z,f:np.exp(z)*f/np.sin(z)**3,-4*pi*pi-pi-pi*I/2),
('2001-spring-v5',lambda z:(3+z)/(I*z-3),-I,-5*pi*I/2,-1-I,1,lambda z,f:1/(f*f+pi*pi)**2,3*(1+pi)*(I-1)/(4*pi*pi)),
('2002-spring-v1',lambda z:(z+1)/(2+I*z),-I,-pi*I/2,-1+I,.5,lambda z,f:f/np.sin(z)**3,2*pi*pi-pi*I*(1.25+np.log(2))),
('2002-spring-v3',lambda z:(2+z)/(I*z-1),-I,3*pi*I/2,-1-I,.5,lambda z,f:f/np.sinh(z)**3,3*pi*pi-pi*I*(1.25+np.log(2)))]:
 start=100*direction;norm=C+np.log(P(start)/qinf);circle_case(id,P,0,[start,0,r],norm,0,r,fn,ev)
circle_case('2002-spring-v2',lambda z:4*z*z+1,2,[0,-2,-2-2*I,1-2*I,1],-1,0,1,lambda z,f:z/(f+3)**2,0)
circle_case('2002-spring-v4',lambda z:2*z*z+1,2,[0,-2-2*I,1-2*I,1],1,0,1,lambda z,f:z/(f+3)**2,0)
# Rectangle around a slit, with the branch continued from the given normalization.
P=lambda z:(I+z)/(I-z);start=polyline([1,2,2-2*I,.5-1.5*I]);path=polyline([.5-1.5*I,.5+1.5*I,-.5+1.5*I,-.5-1.5*I,.5-1.5*I],3000);zz=np.r_[start,path];a=np.unwrap(np.angle(P(zz)));a+=-pi/2-a[0];f=(np.log(np.abs(P(zz)))+I*a)[-len(path):];F=1/((path+1)*(f+3*pi*I/2));val=np.sum((F[1:]+F[:-1])/2*np.diff(path));err=abs(val-(4-pi));ok=bool(err<3e-7);print('log-rectangle',ok,err);results.append({'id':'1996/2000-log-rectangle','ok':ok,'error':float(err)})
print(f'Branch continuation OK: {len(results)} numerical checks');assert all(r['ok'] for r in results),[r for r in results if not r['ok']]
