"""Independent numerical checks for the source formulas in the new batches.

Uses Python's standard library only. Contours evaluate the original integrands,
not the intermediate residues. This complements editorial and catalog checks.
"""
import cmath
import math

PI = math.pi


def close(actual, expected, label, tolerance=2e-9):
    error = abs(actual - expected)
    assert error < tolerance * max(1, abs(expected)), (label, actual, expected, error)


def contour(function, center, radius, count=8192):
    step = 2 * PI / count
    return sum(function(center + radius * cmath.exp(1j * (k + .5) * step))
               * 1j * radius * cmath.exp(1j * (k + .5) * step)
               for k in range(count)) * step


def simpson(function, count=16384):
    step = 1 / count
    return (function(0) + function(1)
            + sum((4 if k % 2 else 2) * function(k * step)
                  for k in range(1, count))) * step / 3


essential_cases = [
    (lambda z: z**3 * cmath.exp(1/(z-1))/(z+1), .5, 1,
     2*PI*1j*(2/3 + math.exp(-.5)), '82.3'),
    (lambda z: (z-1j)/(z+2j) * cmath.sin((z+1j)/(z-1j)), 0, 1.5,
     2*PI*(3*math.sin(1)-2*math.cos(1)-3*math.sin(1/3)), '83.3'),
    (lambda z: (z**3+z)/(z-1) * cmath.cosh(1/(z+1)), -1, .5,
     2*PI*1j*(1.5-2*math.cosh(.5)), '84.3'),
]
for function, center, radius, expected, label in essential_cases:
    close(contour(function, center, radius), expected, label)

a = 2**.25
branch_cases = [
    (math.sqrt(3), 1j, 9/5,
     lambda z, g: (z*z+z+1)/(z*(g+1j*math.sqrt(2))),
     2*PI*(1-2*math.sqrt(2)/5), '82.6'),
    (2, -1j*a, math.sqrt(7),
     lambda z, g: cmath.exp(1/z**2)/(g+1j*z),
     2*PI*(1/(1-a)+4*math.exp(1/8)), '83.6'),
    (1, 1j, 4/3,
     lambda z, g: (z*z+math.sqrt(2)*z+1)/(z*(g+1j*a)),
     2*PI*(math.sqrt(2)-a+a**3/3), '84.6'),
]
for cut, factor, radius, function, expected, label in branch_cases:
    close(contour(lambda z: function(z, factor*z*(1-cut*cut/z**2)**.25), 0, radius),
          expected, label)

# Check the principal-root convention in 82.5 by a different finite-interval
# substitution x=t-2. The transformed real coefficient includes its endpoint
# powers directly, instead of the partial-fraction formula in the solution.
root_integral = simpson(lambda t: t**.5*(1-t)**1.5/(2-t)**2)
close(root_integral, PI/4*(10-7*math.sqrt(2)), '82.5', 2e-8)

def beta_integrand(t):
    if t == 0 or t == 1:
        return 0
    u = t/(1-t)
    return 16*u**4*math.log(u)/((1+u**4)**2*(1-t)**2)

close(simpson(beta_integrand), PI*(4-PI)/(2*math.sqrt(2)), '83.5')

original_cube = simpson(lambda x: x*(x*(x+1)**2)**(1/3)/(1+x*x))
b = 2**(-1/3)
logs = 0j
for k in range(3):
    r = cmath.exp(2j*PI*k/3)
    logs += -2*r/3*cmath.log(1-b/r) + r*r/3*(1/(r-b)-1/r)
    for sign in (-1, 1):
        pole = 2**(-1/6)*cmath.exp(1j*(sign*PI/12+2*PI*k/3))
        logs += sign*1j/(2*pole*pole)*cmath.log(1-b/pole)
close(logs, original_cube, '84.5 exact logarithmic sum')

for z in (4+2j, -4+1j, 8-3j):
    u=z-1-1j
    original=z**3/(z*z+4)-4j/(z*z+2j*z)
    series=u+1+1j-2*sum(((-1+1j)**n+(-1-1j)**n)/u**(n+1) for n in range(90))
    close(series, original, '82.1 Laurent')
for z in (-3-2j, 5-2j, 6+5j):
    u=z-2j
    original=((1+1j)*z-2j)/(z*z-(4+2j)*z+4+4j)+z/(z-2-2j)
    series=1+sum((1j*(2-2j)**n+(3+2j)*2**n)/u**(n+1) for n in range(150))
    close(series, original, '83.1 Laurent')
for z in (-5+2j, 11-2j, 4+9j):
    u=z-3
    original=2*z**3/(z*z-9)+9j/(z*z-(6+1j)*z+9+3j)
    series=2*u+6+9*sum(((-6)**n+1j**n)/u**(n+1) for n in range(180))
    close(series, original, '84.1 Laurent')

for u in (.2+.3j, -1+.5j):
    taylor=math.exp(4)*(1+sum((-1)**(k-1)*(k-1)*u**(2*k)/math.factorial(k)
                            for k in range(1, 35)))
    close(taylor, math.exp(4)*(1+u*u)*cmath.exp(-u*u), 'textbook 1.11')
for u in (3.6, 3+1.6j, -3.5+1j):
    z=u-1-1j
    original=(2*(1-1j)*z*z+(16+13j)*z+57j)/((z-1j)*(z+5)*(z+4j))
    series=sum((3*(1+2j)**n-(1-3j)**n)/u**(n+1) for n in range(400))
    series-=2j/(4-1j)*sum((-u/(4-1j))**n for n in range(400))
    close(series, original, 'textbook 1.13 Laurent')

residue_function=lambda z: 1/((z*z+3-4j)*(z-2j)**2)
residues=[(1+2j, 1/(2*(1+2j))),
          (-1-2j, -1/(2*(1+2j)*(1+4j)**2)),
          (2j, -4j/(1+4j)**2)]
for pole, expected in residues:
    close(contour(residue_function,pole,.05)/(2*PI*1j), expected, 'textbook 1.18')
close(sum(residue for _,residue in residues),0,'textbook full residue sum')
close(contour(lambda z:1/(z*(cmath.exp(z)-1)),0,.1)/(2*PI*1j),-.5,'textbook 1.20')
for sign, expected in [(1,4*PI*1j),(-1,0)]:
    close(contour(lambda z:1/(sign*cmath.sqrt(z)-1),1,.5),expected,'textbook 2.12')

# A square-root branch with argument in (0,2pi), as specified in the arc maps.
def upper_sqrt(z):
    argument=cmath.phase(z) % (2*PI)
    return math.sqrt(abs(z))*cmath.exp(.5j*argument)

def arc82(z):
    h=upper_sqrt(cmath.exp(-1j*PI/4)*(z-1)/(z+1j))
    h0=cmath.exp(1j*PI/8)
    return cmath.exp(-1j*PI/4)*(h-h0)/(h-h0.conjugate())

def arc84(z):
    h=upper_sqrt(-1j*(z+1j)/(z-1j))
    h0=cmath.exp(1j*PI/4)
    return 1j*(h-h0)/(h-h0.conjugate())

close(arc82(0),0,'82.7 origin')
close(arc84(0),0,'84.7 origin')
for z in (.1+.3j, -2+3j, 2-.2j, -1-1j):
    assert abs(arc82(z)) < 1 and abs(arc84(z)) < 1
close(arc82(1+1e-12),1,'82.7 boundary',2e-5)
close(arc84(1j-1e-12),1j,'84.7 boundary',2e-5)
strip_map=lambda z:(cmath.exp(PI*z*z/2)+1)/(math.exp(PI/2)+1)
close(strip_map(1+1j),0,'83.7 first normalization')
close(strip_map(1),1,'83.7 second normalization')
for z in (.3+.7j, 2+.2j, .7+.8j):
    assert strip_map(z).imag > 0

print('Math OK: source contours, roots, exact finite integral, series, textbook residues and maps')
