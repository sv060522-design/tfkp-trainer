"""Author explicit undetermined-coefficient solutions and collect equal powers.

The input is the final merged source-backed catalogue. This script is an authoring
tool; check-series-review.py validates its output independently.
"""
from math_support import *
import copy
import hashlib
import mpmath as mp

mp.mp.dps = 60
n = S.Symbol('n', integer=True, nonnegative=True)
CAT = {q['id']: q for q in json.loads(subprocess.check_output(['node', '-e', "const {loadCatalog}=require('./scripts/load-catalog');console.log(JSON.stringify(loadCatalog({excludeBatches:['data/batches/v35-series-review.js']}).tasks));"], cwd=ROOT))}


def c_notation(text):
    """Read both TeX arguments as balanced groups or single tokens."""
    def arg(pos):
        while text[pos].isspace():
            pos += 1
        if text[pos] == '{':
            return brace(text, pos)
        if text[pos] == '\\':
            token = re.match(r'\\[A-Za-z]+', text[pos:])[0]
            return token, pos + len(token)
        return text[pos], pos + 1
    out, at = '', 0
    while True:
        start = text.find(r'\binom', at)
        if start < 0:
            return out + text[at:]
        top, end = arg(start + len(r'\binom'))
        bottom, end = arg(end)
        out += text[at:start] + 'C_{' + c_notation(top) + '}^{' + c_notation(bottom) + '}'
        at = end


def tex(a):
    return c_notation(S.latex(a))


def inline(a):
    return r'\(' + tex(a) + r'\)'


def display(text):
    return '\n\n$$' + text.replace('+-', '-') + '$$\n\n'


def eq(a, b):
    return tex(a) + '=' + tex(b)


def add_tex(parts):
    out = ''
    for part in parts:
        if not part or part == '0':
            continue
        if out and not part.lstrip().startswith('-'):
            out += '+'
        out += part
    return out or '0'


def system(rows, variables):
    return display(r'\begin{cases}' + r'\\'.join(
        eq(sum(row[j] * variables[j] for j in range(len(variables))), row[-1])
        for row in rows) + r'\end{cases}')


def solve_explained(rows, variables):
    """Forward substitution, followed by explicit back substitution."""
    matrix = [list(row) for row in rows]
    text = ''
    for j, variable in enumerate(variables):
        pivot = next(i for i in range(j, len(matrix)) if S.simplify(matrix[i][j]) != 0)
        if pivot != j:
            matrix[j], matrix[pivot] = matrix[pivot], matrix[j]
            text += '\n\nПереставим строки, чтобы выразить ' + inline(variable) + '.'
        div = matrix[j][j]
        matrix[j] = [S.simplify(v / div) for v in matrix[j]]
        expression = S.simplify(matrix[j][-1] - sum(matrix[j][k] * variables[k] for k in range(j + 1, len(variables))))
        text += '\n\nИз этой строки: ' + display(eq(variable, expression))
        for i in range(j + 1, len(matrix)):
            mul = matrix[i][j]
            matrix[i] = [S.simplify(matrix[i][k] - mul * matrix[j][k]) for k in range(len(variables) + 1)]
        if j + 1 < len(variables):
            text += 'Подставляем это выражение в оставшиеся уравнения; после приведения подобных членов:'
            text += system(matrix[j + 1:], variables)
    values = {}
    for j in range(len(variables) - 1, -1, -1):
        rhs = matrix[j][-1] - sum(matrix[j][k] * variables[k] for k in range(j + 1, len(variables)))
        value = S.simplify(rhs.subs(values))
        values[variables[j]] = value
        if j < len(variables) - 1:
            text += '\n\nВозвращаем найденные значения в выражение для ' + inline(variables[j]) + ': '
            substituted = rhs.xreplace({key: S.UnevaluatedExpr(val) for key, val in values.items()})
            text += display(eq(variables[j], rhs) + '=' + tex(substituted) + '=' + tex(value))
    text += '\n\nПолучили ' + display(r',\qquad '.join(eq(v, values[v]) for v in variables))
    return values, text


def factor_explained(Q):
    roots = sorted(S.roots(Q, u).items(), key=lambda item: (float(S.Abs(item[0])), str(item[0])))
    assert sum(m for a, m in roots) == S.degree(Q, u)
    text = '\n\nРазложим знаменатель на линейные множители. Последовательно проверяем корень и делим многочлен на соответствующий множитель:'
    current = S.expand(Q)
    for a, multiplicity in roots:
        for _ in range(multiplicity):
            quotient, remainder = S.div(current, u - a, u, extension=I)
            assert S.simplify(remainder) == 0
            text += '\n\n' + display(r'\left[' + tex(current) + r'\right]_{u=' + tex(a) + '}=0')
            text += display(tex(current) + '=' + tex(S.Mul(u - a, quotient, evaluate=False)))
            current = S.expand(quotient)
    product = S.Mul(*([current] if current != 1 else []), *(S.Pow(u-a, m, evaluate=False) if m > 1 else u-a for a, m in roots), evaluate=False)
    assert S.expand(product-Q) == 0
    text += '\n\nИтак, ' + display('Q(u)=' + tex(product))
    return roots, text


def decompose(card):
    f = function(card)
    audit = card['laurentAudit']
    first_ring = audit.get('rings', [audit])[0]
    center = S.sympify(first_ring['center'])
    shifted = f.subs(z, u + center)
    together = S.together(shifted)
    N0, Q0 = S.fraction(together)
    g = S.cancel(shifted, extension=I)
    N, Q = S.fraction(g)
    poly, remainder = S.div(N, Q, u, extension=I)
    roots, factor_text = factor_explained(Q)
    text = '**1. Центр, общий знаменатель и его множители.** Введём ' + r'\(u=z-(' + tex(center) + r'),\ z=u+(' + tex(center) + r')\).'
    text += ' Подставляем эту замену в исходную функцию и приводим дроби к общему знаменателю:'
    text += display('f(z)=' + tex(shifted) + '=' + tex(together))
    if S.degree(Q0, u) > S.degree(Q, u):
        common = S.gcd(S.Poly(N0, u, extension=I), S.Poly(Q0, u, extension=I)).as_expr()
        text += '\n\nЧислитель и знаменатель имеют общий множитель ' + inline(common) + '. Показываем сокращение:'
        text += display('N_0(u)=' + tex(S.Mul(common, S.cancel(N0/common), evaluate=False)))
        text += display('Q_0(u)=' + tex(S.Mul(common, S.cancel(Q0/common), evaluate=False)))
        text += 'После сокращения ' + display('f(z)=' + tex(g))
    text += factor_text
    original_exclusions = set()
    for term in S.Add.make_args(f):
        term_den = S.denom(S.together(term))
        if term_den.has(z):
            original_exclusions.update(S.roots(term_den, z))
    actual = {S.simplify(a + center) for a, m in roots}
    removable = [q for q in original_exclusions if q not in actual]
    if removable:
        text += '\n\nИсходная запись не определена в ' + ', '.join(inline(q) for q in removable) + '. После сокращения здесь получаем устранимые особенности и аналитическое продолжение. Радиусы ряда определяем по настоящим полюсам продолжения; равенство с исходной записью понимаем в точках, где она определена.'
    if poly != 0:
        text += '\n\nСтепень числителя не меньше степени знаменателя, поэтому сначала выделяем целую часть. Деление с остатком даёт:'
        text += display(tex(N) + '=' + tex(S.Mul(poly, Q, evaluate=False)) + '+' + tex(remainder))
        text += display('f(z)=' + tex(poly) + '+' + tex(remainder/Q))
    text += '\n\n**2. Метод неопределённых коэффициентов.** У полюса порядка ' + inline(S.Integer(max(m for _, m in roots))) + ' нужно предусмотреть все степени знаменателя от первой до его порядка. Введём неизвестные коэффициенты:'
    slots = [(a, k) for a, m in roots for k in range(1, m + 1)]
    variables = list(S.symbols('A B C D E F G H'))[:len(slots)]
    terms = [v/(u-a)**k for v, (a, k) in zip(variables, slots)]
    text += display(tex(remainder/Q) + '=' + add_tex([tex(q) for q in terms]))
    basis = [S.cancel(Q/(u-a)**k, extension=I) for a, k in slots]
    text += '\n\nУмножаем обе части на общий знаменатель ' + r'\(Q(u)\). Это тождество многочленов:'
    text += display(tex(remainder) + '=' + add_tex([tex(S.Mul(v, S.factor(b, extension=I), evaluate=False)) for v, b in zip(variables, basis)]))
    expanded = S.expand(sum(v*b for v, b in zip(variables, basis)))
    text += '\n\nРаскрываем скобки и группируем степени ' + r'\(u\):'
    text += display(tex(remainder) + '=' + tex(S.Poly(expanded, u).as_expr().collect(u)))
    powers = list(range(len(slots)-1, -1, -1))
    rows = [[S.expand(b).coeff(u, power) for b in basis] + [S.expand(remainder).coeff(u, power)] for power in powers]
    text += '\n\nУ равных многочленов равны коэффициенты при каждой степени. Строки идут по степеням ' + ', '.join(inline(u**p) for p in powers) + ':'
    text += system(rows, variables)
    values, solving = solve_explained(rows, variables)
    text += solving
    coefficients = [(a, k, values[v]) for v, (a, k) in zip(variables, slots) if values[v] != 0]
    decomposed = poly + sum(A/(u-a)**k for a, k, A in coefficients)
    assert S.cancel(g-decomposed, extension=I) == 0
    text += '\n\nПодставляем коэффициенты в простые дроби:'
    text += display('f(z)=' + add_tex(([tex(poly)] if poly else []) + [tex(A/(u-a)**k) for a, k, A in coefficients]))
    text += 'Для проверки приводим эти дроби к общему знаменателю: их числитель равен ' + inline(S.expand(sum(values[v]*b for v, b in zip(variables, basis)))) + ', то есть исходному остатку. Разложение проверено точным тождеством.'
    data = {'center': str(center), 'numerator': str(N), 'denominator': str(Q), 'polynomial': str(poly), 'remainder': str(remainder), 'unknowns': [str(v) for v in variables], 'system': [[str(q) for q in row] for row in rows], 'values': [str(values[v]) for v in variables], 'fractions': [[str(a), k, str(A)] for a, k, A in coefficients], 'rings': []}
    return g, center, roots, poly, coefficients, text, data


def negative_coefficient(coefficients, index):
    return S.simplify(sum(A if a == 0 and index == k else A*S.binomial(index-1, k-1)*a**(index-k) if a != 0 and index >= k else 0 for a, k, A in coefficients))


def positive_coefficient(coefficients, index):
    grouped = {}
    for a, k, A in coefficients:
        grouped.setdefault(a, []).append((k, A))
    result = 0
    for a, entries in grouped.items():
        max_order = max(k for k, A in entries)
        numerator = S.simplify(sum((-1)**k*A*S.binomial(index+k-1, k-1)*a**(max_order-k) for k, A in entries))
        result += numerator/a**(index+max_order)
    return result


def sum_term(coefficient, start, negative=False):
    if coefficient == 0:
        return ''
    return r'\sum_{n=' + str(start) + r'}^{\infty}\left(' + tex(coefficient) + r'\right)u^{' + ('-n' if negative else 'n') + '}'


def combined_ring(g, center, roots, poly, coefficients, ring, all_rings=False):
    low, high = S.sympify(ring['inner']), S.sympify(ring['outer'])
    point = S.sympify(ring['point'])
    ring_tex = (r'0<|u|<' if low == 0 and any(a == 0 for a, m in roots) else r'|u|<' if low == 0 else tex(low) + r'<|u|<') + tex(high)
    negative = [(a, k, A) for a, k, A in coefficients if a == 0 or float(S.Abs(a)) <= float(low)]
    positive = [q for q in coefficients if q not in negative]
    text = '**3. Кольцо сходимости.** Координаты настоящих полюсов относительно центра, их порядки и расстояния:'
    text += '\n\n' + '; '.join(r'\(a=' + tex(a) + r',\ m=' + str(m) + r',\ |a|=' + tex(S.Abs(a)) + r'\)' for a, m in roots) + '.'
    if all_rings:
        text += '\n\nРассматриваем кольцо ' + display(ring_tex) + 'Его края — соседние радиусы настоящих полюсов. Контрольная точка ' + inline(point) + ' используется только для проверки суммы; в исходном условии такая точка не задана.'
    else:
        distance = S.simplify(S.Abs(point-center))
        text += '\n\nУ заданной точки расстояние до центра ' + display(r'|z_0-c|=' + tex(distance))
        text += 'Ближайшие радиусы по обе стороны этого расстояния дают ' + display(ring_tex)
    text += 'Ненулевой конечный край проходит через настоящий полюс. Его нельзя пересечь, сохранив одно разложение с этим центром.'
    text += '\n\n**4. Разложения отдельных дробей и замена индекса.** Используем ' + r'\((1-q)^{-k}=\sum_{j=0}^{\infty}C_{j+k-1}^{k-1}q^j\)' + ' при ' + r'\(|q|<1\)' + '. Здесь ' + r'\(C_N^r=N!/[r!(N-r)!]\), \(C_N^0=1\), \(C_N^1=N\)' + '. Вывод из геометрического ряда приведён в блоке «Метод».'
    for a, k, A in coefficients:
        if a == 0:
            text += '\n\nДробь ' + inline(A/u**k) + ' уже имеет нужную степень. Она войдёт в коэффициент при ' + inline(u**(-k)) + '.'
        elif (a, k, A) in negative:
            j = S.Symbol('j', integer=True, nonnegative=True)
            individual = A*S.binomial(j+k-1, k-1)*a**j
            text += '\n\nДля ' + inline(A/(u-a)**k) + ' выбираем ' + r'\(q=a/u\)' + ', потому что ' + r'\(|u|>' + tex(S.Abs(a)) + r'\)' + '. Тогда:'
            text += display(tex(A/(u-a)**k) + r'=\left(' + tex(A/u**k) + r'\right)\left(1-\frac{' + tex(a) + r'}u\right)^{-' + str(k) + '}=' + r'\sum_{j=0}^{\infty}\left(' + tex(individual) + r'\right)u^{-(j+' + str(k) + ')}')
            text += 'Чтобы получить именно степень ' + r'\(u^{-n}\)' + ', положим ' + r'\(n=j+' + str(k) + r',\ j=n-' + str(k) + r'\)' + '. При ' + r'\(j=0\)' + ' получаем ' + r'\(n=' + str(k) + r'\)' + ', поэтому меняется и нижний предел:'
            text += display(tex(A/(u-a)**k) + '=' + sum_term(A*S.binomial(n-1, k-1)*a**(n-k), k, True))
        else:
            individual = positive_coefficient([(a, k, A)], n)
            text += '\n\nДля ' + inline(A/(u-a)**k) + ' выбираем ' + r'\(q=u/a\)' + ', поскольку ' + r'\(|u|<' + tex(S.Abs(a)) + r'\)' + '. Выносим постоянный множитель и получаем:'
            text += display(tex(A/(u-a)**k) + r'=\left(' + tex(S.simplify(A/(-a)**k)) + r'\right)\left(1-\frac u{' + tex(a) + r'}\right)^{-' + str(k) + '}=' + sum_term(individual, 0))
    neg_nonzero = [q for q in negative if q[0] != 0]
    neg_start = max([k for a, k, A in neg_nonzero] + [k+1 for a, k, A in negative if a == 0] + [1])
    neg_tail = sum(A*S.binomial(n-1, k-1)*a**(n-k) for a, k, A in neg_nonzero)
    neg_finite_end = neg_start if neg_nonzero else max([k for a, k, A in negative] + [0])+1
    neg_finite = {i: negative_coefficient(negative, i) for i in range(1, neg_finite_end)}
    pos_start = int(S.degree(poly, u))+1 if poly != 0 else 0
    pos_tail = positive_coefficient(positive, n)
    pos_finite = {i: S.simplify(poly.expand().coeff(u, i)+positive_coefficient(positive, i)) for i in range(pos_start)}
    finite_expr = sum(v*u**(-i) for i, v in neg_finite.items()) + sum(v*u**i for i, v in pos_finite.items())
    result_parts = ([tex(S.expand(finite_expr))] if finite_expr != 0 else []) + [sum_term(neg_tail, neg_start, True), sum_term(pos_tail, pos_start)]
    result = display('f(z)=' + add_tex(result_parts) + r',\qquad ' + ring_tex)
    text += '\n\n**5. Объединяем одинаковые степени.** После замены индексов коэффициенты всех дробей при ' + r'\(u^{-n}\)' + ' складываем внутри одной скобки; так же поступаем с коэффициентами при ' + r'\(u^n\)' + '. Если нижние пределы различаются, сначала выносим недостающие первые члены.'
    if neg_finite:
        text += '\n\nПервые отрицательные степени после сложения всех вкладов: ' + display(r',\qquad '.join('c_{-' + str(i) + '}=' + tex(v) for i, v in neg_finite.items()))
    if neg_tail != 0:
        text += '\n\nОбщий коэффициент главной части: ' + display('c_{-n}=' + tex(neg_tail) + r',\qquad n\ge ' + str(neg_start))
    if pos_finite:
        text += '\n\nКоэффициенты первых неотрицательных степеней, включая целую часть: ' + display(r',\qquad '.join('c_{' + str(i) + '}=' + tex(v) for i, v in pos_finite.items()))
    if pos_tail != 0:
        text += '\n\nОбщий коэффициент регулярной части: ' + display('c_n=' + tex(pos_tail) + r',\qquad n\ge ' + str(pos_start))
    text += '\n\nИтоговое разложение: ' + result
    text += 'Здесь ' + r'\(u=z-(' + tex(center) + r')\)' + '. Каждая степень встречается один раз. Отрицательные и неотрицательные степени образуют разные части ряда Лорана. Перегруппировка допустима благодаря абсолютной сходимости рядов на каждом компактном подкольце.'
    radius = (float(low)+float(high))/2 if high != S.oo else max(1., float(low)*2)
    if low == 0:
        radius = float(high)*.47 if high != S.oo else 1.
    fn = S.lambdify(u, g, 'mpmath')
    def mpc(v):
        return mp.mpc(str(S.N(S.re(v), 65)), str(S.N(S.im(v), 65)))
    coefs_neg = [lambda j, av=mpc(a), kv=k, Av=mpc(A): Av*mp.binomial(j-1, kv-1)*av**(j-kv) for a, k, A in neg_nonzero]
    coefs_pos = [lambda j, av=mpc(a), kv=k, Av=mpc(A): (-1)**kv*Av*mp.binomial(j+kv-1, kv-1)/av**(j+kv) for a, k, A in positive]
    finite_fn = S.lambdify(u, finite_expr, 'mpmath')
    errors = []
    for angle in [.31, 1.22, 2.43]:
        q = radius*mp.exp(1j*angle)
        value = finite_fn(q)
        value += mp.fsum(mp.fsum(fn0(j) for fn0 in coefs_neg)*q**(-j) for j in range(neg_start, 650)) if coefs_neg else 0
        value += mp.fsum(mp.fsum(fn0(j) for fn0 in coefs_pos)*q**j for j in range(pos_start, 650)) if coefs_pos else 0
        error = abs(value-fn(q))/(1+abs(fn(q)))
        assert error < mp.mpf('1e-18'), (error, ring)
        errors.append(float(error))
    data = {'inner': str(low), 'outer': str(high), 'negativeStart': neg_start, 'positiveStart': pos_start, 'negativeCoefficient': str(neg_tail), 'positiveCoefficient': str(pos_tail), 'finiteNegative': {str(k): str(v) for k, v in neg_finite.items()}, 'finitePositive': {str(k): str(v) for k, v in pos_finite.items()}, 'answer': result, 'maxRelativeError': max(errors)}
    return text, result, data


patch = {}
report = []
for card in CAT.values():
    if card['primaryTopic'] != 'Ряды Лорана и Тейлора' or card.get('laurentAudit', {}).get('checkType') == 'nonrational-series':
        continue
    g, center, roots, poly, coefficients, opening, data = decompose(card)
    rings = card['laurentAudit'].get('rings', [card['laurentAudit']])
    bodies, answers = [], []
    for i, ring in enumerate(rings):
        body, answer, ring_data = combined_ring(g, center, roots, poly, coefficients, ring, len(rings) > 1)
        bodies.append(('**Кольцо ' + str(i+1) + '.**\n\n' if len(rings) > 1 else '') + body)
        answers.append(answer)
        data['rings'].append(ring_data)
    patch[card['id']] = {'solution': opening + '\n\n' + '\n\n'.join(bodies), 'answer': '\n\n'.join(answers) + '\n\n' + r'\(u=z-(' + tex(center) + r')\).', 'seriesReview': data, 'shortSolution': 'Вводим ' + r'\(u=z-(' + tex(center) + r')\)' + ', факторизуем знаменатель и решаем систему для коэффициентов простых дробей. Затем выбираем геометрические ряды по кольцу, заменяем индексы и складываем коэффициенты одинаковых степеней.\n\n' + '\n\n'.join(answers), 'algorithm': ['Ввести переменную относительно указанного центра; объединить дроби, показать сокращения и разложить знаменатель.', 'Выписать все неизвестные коэффициенты простых дробей, умножить на общий знаменатель и приравнять коэффициенты степеней.', 'Решить полученную систему подстановкой и проверить точное тождество.', 'Выбрать кольцо по расстояниям до настоящих полюсов; для каждой дроби объяснить выбор малого отношения.', 'Заменить индексы, вынести первые несовпадающие члены и объединить одинаковые степени в одну сумму.'], 'hints': ['Начни с замены переменной и факторизации знаменателя. Для полюса порядка m нужны дроби всех порядков от 1 до m.', 'Коэффициенты простых дробей найди из тождества многочленов после умножения на общий знаменатель. При объединении рядов меняй и индекс, и нижний предел.']}
    report.append({'id': card['id'], 'rings': len(rings), 'maxRelativeError': max(q['maxRelativeError'] for q in data['rings'])})
    print(card['id'], 'OK', flush=True)


oral9 = 'oral-2007-2008-n9'
patch[oral9] = {
    'solution': r'''**1. Замена переменной и элементарные ряды.** Положим \(u=z+1\), тогда \(z=u-1\) и
$$f(z)=\cos u+\sinh(1/u)+\frac1{(u-1)^2}.$$
Из рядов косинуса и гиперболического синуса:
$$\cos u=\sum_{k=0}^{\infty}\frac{(-1)^k}{(2k)!}u^{2k},\qquad
\sinh(1/u)=\sum_{k=0}^{\infty}\frac{u^{-2k-1}}{(2k+1)!}.$$
Косинус сходится для всех u; ряд sinh(1/u) — при u≠0. Поэтому границу колец создаёт двойной полюс u=1. В центре u=0 есть существенная особенность. Всего два максимальных кольца: \(0<|u|<1\) и \(1<|u|<\infty\).

**2. Внутреннее кольцо.** Дифференцируем геометрический ряд по u при |u|<1:
$$\frac1{1-u}=\sum_{k=0}^{\infty}u^k,\qquad
\frac1{(u-1)^2}=\frac1{(1-u)^2}=\sum_{n=0}^{\infty}(n+1)u^n.$$
Степени u^{2k} встречаются и в косинусе, и в последнем ряде. Поэтому перед сложением записываем коэффициент косинуса при общей степени u^n:
$$b_n=\begin{cases}(-1)^{n/2}/n!,&n\text{ чётное},\\0,&n\text{ нечётное}.\end{cases}$$
Получаем один коэффициент при каждой неотрицательной степени:
$$c_n=n+1+b_n,\qquad n\ge0.$$
Отрицательные степени приходят только из sinh. Для степени u^{-n} нужно 2k+1=n, поэтому
$$d_n=\begin{cases}1/n!,&n\text{ нечётное},\\0,&n\text{ чётное},\end{cases}\qquad n\ge1.$$
Итог:
$$f(z)=\sum_{n=0}^{\infty}c_nu^n+\sum_{n=1}^{\infty}d_nu^{-n},\qquad0<|u|<1.$$
Проверка первых членов: \(c_0=2\), \(c_1=2\), \(c_2=5/2\), \(d_1=1\), \(d_2=0\), \(d_3=1/6\).

**3. Внешнее кольцо и выравнивание индексов.** При |u|>1 малым отношением является 1/u:
$$\frac1{(u-1)^2}=u^{-2}(1-u^{-1})^{-2}
=\sum_{k=0}^{\infty}(k+1)u^{-k-2}.$$
Полагаем n=k+2, то есть k=n−2. Нижний предел k=0 превращается в n=2:
$$\frac1{(u-1)^2}=\sum_{n=2}^{\infty}(n-1)u^{-n}.$$
В sinh отдельно выносим u^{-1}, а остальные его отрицательные степени складываем с этой суммой. Для n≥2:
$$e_n=n-1+\begin{cases}1/n!,&n\text{ нечётное},\\0,&n\text{ чётное}.\end{cases}$$
Таким образом,
$$f(z)=\sum_{n=0}^{\infty}b_nu^n+\frac1u+\sum_{n=2}^{\infty}e_nu^{-n},\qquad1<|u|<\infty.$$
Например, коэффициенты при u^{-2}, u^{-3}, u^{-4} равны 1, 13/6, 3. Каждая степень записана один раз. На компактных подкольцах ряды абсолютно сходятся, поэтому сложение коэффициентов допустимо. Полюс u=1 запрещает расширить любое из этих колец через радиус 1. Во всех формулах u=z+1.''',
    'answer': r'''Положим \(u=z+1\) и
$$b_n=\begin{cases}(-1)^{n/2}/n!,&n\text{ чётное},\\0,&n\text{ нечётное}.\end{cases}$$
При \(0<|u|<1\):
$$f(z)=\sum_{n=0}^{\infty}(n+1+b_n)u^n+\sum_{n=1}^{\infty}d_nu^{-n},\qquad
d_n=\begin{cases}1/n!,&n\text{ нечётное},\\0,&n\text{ чётное}.\end{cases}$$
При \(1<|u|<\infty\):
$$f(z)=\sum_{n=0}^{\infty}b_nu^n+\frac1u+\sum_{n=2}^{\infty}e_nu^{-n},\qquad
e_n=n-1+\begin{cases}1/n!,&n\text{ нечётное},\\0,&n\text{ чётное}.\end{cases}$$'''
}
patch[oral9]['shortSolution'] = 'Вводим u=z+1. Двойной полюс u=1 разделяет два кольца. Внутри объединяем регулярные коэффициенты косинуса и дроби; снаружи — отрицательные коэффициенты sinh и дроби.\n\n' + patch[oral9]['answer']

branch_id = 'oral-2007-2008-n33'
branch = c_notation(CAT[branch_id]['solution'])
branch = branch.replace('В нуле биномиальная формула даёт', r'''В нуле используем биномиальные коэффициенты с верхним и нижним индексами. Выведем нужный коэффициент из формулы для (1−t)^{-1/2}:
$$C_{-1/2}^{n}=\frac{(-1/2)(-3/2)\cdots(-(2n-1)/2)}{n!},\qquad
(-1)^n C_{-1/2}^{n}=\frac{1\cdot3\cdots(2n-1)}{2^n n!}=\frac{(2n)!}{4^n(n!)^2}=\frac{C_{2n}^{n}}{4^n}.$$
Для n=0 произведение пустое и равно 1. Здесь \(C_\alpha^n\) при нецелом α означает обобщённый коэффициент — произведение n последовательных множителей, делённое на n!, а \(C_{2n}^n\) — обычный биномиальный коэффициент. Подстановка t=z² даёт''')
patch[branch_id] = {'solution': branch}

from clarity_additions import CLARITY_PATCHES
for id, values in CLARITY_PATCHES.items():
    patch.setdefault(id, {}).update(values)

# Convert the final visible catalogue recursively, including hints and methods.
def convert(value):
    if isinstance(value, str):
        return c_notation(value)
    if isinstance(value, list):
        return [convert(v) for v in value]
    if isinstance(value, dict):
        return {k: convert(v) for k, v in value.items()}
    return value

for id, card in CAT.items():
    updated = convert({**copy.deepcopy(card), **patch.get(id, {})})
    changed = {k: v for k, v in updated.items() if card.get(k) != v}
    if not changed:
        continue
    evidence = copy.deepcopy(updated['verificationEvidence'])
    evidence['date'] = '2026-10-08'
    for field, hash_key in [('statementPretty', 'statementSha256'), ('answer', 'answerSha256'), ('solution', 'solutionSha256')]:
        evidence[hash_key] = hashlib.sha256(updated[field].encode()).hexdigest()
    if 'seriesReview' in updated:
        evidence['answerReview']['checks'] = ['Тождество многочленов и система неопределённых коэффициентов', 'Подстановка найденных коэффициентов и точная проверка дробей', 'Замены индексов, первые члены и объединённые коэффициенты каждой степени', 'Суммы объединённых рядов в трёх точках каждого кольца']
        evidence['answerReview']['maxRelativeError'] = max(q['maxRelativeError'] for q in updated['seriesReview']['rings'])
    change_note = 'разложение через систему неопределённых коэффициентов; одинаковые степени собраны' if 'seriesReview' in updated else 'арифметика и объяснения дополнены' if id in CLARITY_PATCHES else 'обозначения и запись рядов пересмотрены'
    evidence['summary'] = evidence['summary'].split(' Обновление 08.10.2026:')[0] + ' Обновление 08.10.2026: ' + change_note + '.'
    changed['verificationEvidence'] = evidence
    patch[id] = changed

output = ROOT/'data/batches/v35-series-review.js'
output.write_text('// Explicit coefficient systems and collected powers; source identities are unchanged.\nwindow.TFKP_MERGE_OVERRIDES(' + json.dumps(patch, ensure_ascii=False, indent=2) + ');\nwindow.TFKP_BUILD = "2026-10-08-v35";\n')
(ROOT/'audit/series-review-2026-10-08.json').write_text(json.dumps({'rationalTasks': len(report), 'rings': sum(q['rings'] for q in report), 'tasks': report, 'styleReference': 'Скубачевский, семинар 3, PDF страницы 18–21 (страницы семинара 2–5)'}, ensure_ascii=False, indent=2))
print('Written', output, 'rational tasks', len(report), 'patches', len(patch), flush=True)
