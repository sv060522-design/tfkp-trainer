"""Validate authored coefficient systems and collected series against source functions.

This is deliberately independent of the authoring algorithm: coefficients are
compared with Cauchy integrals sampled on a circle, and rendered TeX is parsed.
"""
from math_support import *
import numpy as np

nn = S.Symbol('n', integer=True, nonnegative=True)
checked = 0
rings_checked = 0
coefficient_checks = 0


def authored_expr(value):
    return S.sympify(value, locals={'n': nn})


def read_tex(value):
    value = re.sub(r'\b([A-Hn])\s*(?=\\left\(|\()', r'\1\\cdot ', value)
    return parse(value).subs(S.Symbol('n'), nn)


def assert_same(a, b, label):
    assert S.simplify(S.cancel(a-b, extension=I)) == 0, (label, a, b)


for card in CAT.values():
    if not card.get('seriesReview'):
        continue
    id = card['id']
    data = card['seriesReview']
    center = S.sympify(data['center'])
    source = S.cancel(function(card).subs(z, u+center), extension=I)
    numerator, denominator = S.fraction(source)
    assert_same(numerator, S.sympify(data['numerator']), id+' numerator')
    assert_same(denominator, S.sympify(data['denominator']), id+' denominator')
    polynomial = S.sympify(data['polynomial'])
    remainder = S.sympify(data['remainder'])
    assert_same(numerator, polynomial*denominator+remainder, id+' division')
    variables = [S.Symbol(q) for q in data['unknowns']]
    values = [S.sympify(q) for q in data['values']]
    equations = next(q for q in maths(card['solution']) if r'\begin{cases}' in q)
    rendered_rows = equations.removeprefix(r'\begin{cases}').removesuffix(r'\end{cases}').split(r'\\')
    assert len(rendered_rows) == len(values), id
    for rendered, row in zip(rendered_rows, data['system']):
        row = [S.sympify(q) for q in row]
        left, right = rendered.split('=')
        assert_same(read_tex(left), sum(a*v for a, v in zip(row[:-1], variables)), id+' displayed system')
        assert_same(read_tex(right), row[-1], id+' displayed rhs')
        assert_same(sum(a*v for a, v in zip(row[:-1], values)), row[-1], id+' solved equation')
    fractions = [(S.sympify(a), k, S.sympify(A)) for a, k, A in data['fractions']]
    assert_same(source, polynomial+sum(A/(u-a)**k for a, k, A in fractions), id+' partial fractions')

    # The displayed prefactors must multiply the entire complex number.
    for formula in maths(card['solution']):
        if r'\sum' not in formula or '=\\sum' not in formula:
            continue
        before = formula.split(r'=\sum', 1)[0]
        sides = before.split('=')
        if len(sides) != 2 or sides[0].startswith('f('):
            continue
        assert_same(read_tex(sides[0]), read_tex(sides[1]), id+' geometric prefactor')

    for ring in data['rings']:
        low, high = S.sympify(ring['inner']), S.sympify(ring['outer'])
        neg = authored_expr(ring['negativeCoefficient'])
        pos = authored_expr(ring['positiveCoefficient'])
        finite_neg = {int(k): S.sympify(v) for k, v in ring['finiteNegative'].items()}
        finite_pos = {int(k): S.sympify(v) for k, v in ring['finitePositive'].items()}
        formula = maths(ring['answer'])[0]
        assert formula in maths(card['answer']), id+' published ring answer'
        sums = list(re.finditer(r'\\sum_\{n=(\d+)\}\^\{\\infty\}\\left\(([\s\S]*?)\\right\)u\^\{(-?n)\}', formula))
        assert len(sums) == int(neg != 0)+int(pos != 0), id+' unique sums'
        for match in sums:
            negative = match[3] == '-n'
            expected_start = ring['negativeStart'] if negative else ring['positiveStart']
            assert int(match[1]) == expected_start, (id, 'lower limit')
            assert_same(read_tex(match[2]), neg if negative else pos, id+' displayed collected coefficient')
        finite_text = formula.split(r',\qquad', 1)[0].removeprefix('f(z)=')
        if sums:
            finite_text = finite_text[:sums[0].start()-len('f(z)=')].rstrip('+')
        finite = sum(v*u**(-k) for k, v in finite_neg.items())+sum(v*u**k for k, v in finite_pos.items())
        assert_same(read_tex(finite_text) if finite_text else S.Integer(0), finite, id+' displayed finite terms')

        # Cauchy coefficient integral on an independently chosen interior circle.
        radius = (float(low)+float(high))/2 if high != S.oo else max(1., float(low)*1.8)
        if low == 0:
            radius = float(high)*.41 if high != S.oo else 1.
        theta = (np.arange(8192)+.173)*2*np.pi/8192
        points = radius*np.exp(1j*theta)
        fn = S.lambdify(u, source, 'numpy')
        samples = fn(points)
        for power in range(-7, 8):
            observed = np.mean(samples*points**(-power))
            if power < 0:
                expected = finite_neg.get(-power, S.Integer(0)) if -power < ring['negativeStart'] else neg.subs(nn, -power)
            else:
                expected = finite_pos.get(power, S.Integer(0)) if power < ring['positiveStart'] else pos.subs(nn, power)
            target = complex(S.N(expected, 30))
            error = abs(observed-target)/(1+abs(target))
            assert error < 2e-8, (id, power, error, observed, target)
            coefficient_checks += 1
        rings_checked += 1
    assert 'метод неопределённых коэффициентов' in card['solution'].lower(), id
    assert r'\frac{d^{m-k}}' not in card['solution'], id
    checked += 1

# Collected coefficients for the nonrational cos+sinh example.
q = S.Symbol('q')
source = S.cos(q)+S.sinh(1/q)+1/(q-1)**2
for radius in [.43, 1.8]:
    points = radius*np.exp(1j*(np.arange(8192)+.173)*2*np.pi/8192)
    samples = S.lambdify(q, source, 'numpy')(points)
    for power in range(-7, 8):
        b = (-1)**(power//2)/S.factorial(power) if power >= 0 and power % 2 == 0 else 0
        if power >= 0:
            target = b+(power+1 if radius < 1 else 0)
        else:
            j = -power
            target = (S.Rational(1, S.factorial(j)) if j % 2 else 0)+(j-1 if radius > 1 and j >= 2 else 0)
        observed = np.mean(samples*points**(-power))
        assert abs(observed-complex(target))/(1+abs(complex(target))) < 2e-8
        coefficient_checks += 1

assert checked == 76
assert rings_checked == 81
print('Series review OK:', checked, 'rational tasks;', rings_checked, 'rings;', coefficient_checks, 'independent Cauchy coefficients; displayed systems/prefactors/answers checked')
