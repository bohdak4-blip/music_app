"""
Чиста музична логіка AI-асистента голосоведення (voice leading) на гітарі:
генерація аплікатур на середніх чотирьох струнах (A, D, G, B) та
Viterbi-подібний пошук найплавнішого/найзручнішого шляху між акордами
прогресії. Жодних залежностей від Flask/HTTP — легко тестувати окремо
(див. AGENTS.md "Testing this project").
"""
import itertools

TUNING = {
    5: 9,  # A
    4: 2,  # D
    3: 7,  # G
    2: 11  # B
}


def get_pitch_class(string, fret):
    return (TUNING[string] + fret) % 12


def generate_voicings(target_pcs):
    valid_voicings = []
    for f5, f4, f3, f2 in itertools.product(range(15), repeat=4):
        pcs = {
            get_pitch_class(5, f5),
            get_pitch_class(4, f4),
            get_pitch_class(3, f3),
            get_pitch_class(2, f2)
        }
        if set(pcs) == set(target_pcs):
            non_open = [f for f in (f5, f4, f3, f2) if f != 0]
            if not non_open or (max(non_open) - min(non_open) <= 4):
                valid_voicings.append((f5, f4, f3, f2))
    return valid_voicings


def transition_cost(v1, v2):
    return sum(abs(v1[i] - v2[i]) for i in range(4))


def shape_difficulty(v, target_pcs):
    """
    Оцінює фізичну складність та "нормальність" (музичність) акорду.
    """
    non_open = [f for f in v if f != 0]
    if not non_open:
        return 0

    span = max(non_open) - min(non_open)
    unique_frets = len(set(non_open))
    cost = span * 2.5

    # 1. Штраф за відкриті струни разом із високими ладами (незручно і нетипово)
    if 0 in v and max(non_open) > 4:
        cost += 15

    # 2. Бонус за баре або зручні аплікатури (мало різних ладів)
    if unique_frets <= 2:
        cost -= 3

    if span == 3: cost += 2
    if span == 4: cost += 5

    # 3. АНАЛІЗ ЗВУЧАННЯ ("Нормальність" акорду)
    # Бонус, якщо корінь акорду (target_pcs[0]) знаходиться в басу (на 5-й струні)
    bass_pc = get_pitch_class(5, v[0])
    if target_pcs and bass_pc == target_pcs[0]:
        cost -= 6  # Сильна перевага для стандартних Root-позицій

    # 4. Штраф за "брудний" бас: інтервали секунди (1-2 півтони) на 5-й та 4-й струнах
    pitch_5 = TUNING[5] + v[0]
    pitch_4 = TUNING[4] + v[1]
    if abs(pitch_4 - pitch_5) <= 2:
        cost += 8

    return cost


def solve_voice_leading(progression_pcs, algorithm='ergonomic'):
    """
    Приймає прогресію акордів (список списків pitch-class'ів) та назву
    алгоритму ('ergonomic' або будь-що інше — тоді просто мінімізується
    фізичний рух між аплікатурами без урахування зручності форми).

    Повертає (path, error): у разі успіху `path` — список кортежів
    (f5, f4, f3, f2), `error` — None; у разі помилки `path` — None,
    `error` — текст повідомлення для користувача.

    Раніше ця функція була вбудована прямо в обробник маршруту
    /api/voice-lead; винесена сюди, щоб routes.py лишався тонким
    HTTP-адаптером, а саму DP-логіку можна було тестувати без
    Flask/request/jsonify (наприклад, тим самим hand-rolled підходом, що й
    для theory.js — простий скрипт з відомими вхідними прогресіями).
    """
    if not progression_pcs:
        return None, "Порожня прогресія"

    states = [generate_voicings(pcs) for pcs in progression_pcs]
    if any(not s for s in states):
        return None, "Для одного з акордів не знайдено зручної аплікатури на середніх струнах."

    dp = [{v: (shape_difficulty(v, progression_pcs[0]) if algorithm == 'ergonomic' else 0, None) for v in states[0]}]

    for i in range(1, len(states)):
        new_dp = {}
        for curr_v in states[i]:
            best_cost = float('inf')
            best_prev = None
            shape_cost = shape_difficulty(curr_v, progression_pcs[i]) if algorithm == 'ergonomic' else 0

            for prev_v, (prev_cost, _) in dp[i - 1].items():
                t_cost = transition_cost(prev_v, curr_v)

                if algorithm == 'ergonomic':
                    step_cost = (t_cost * 1.5) + shape_cost
                else:
                    step_cost = t_cost

                cost = prev_cost + step_cost
                if cost < best_cost:
                    best_cost = cost
                    best_prev = prev_v
            new_dp[curr_v] = (best_cost, best_prev)
        dp.append(new_dp)

    best_last_v = min(dp[-1].keys(), key=lambda v: dp[-1][v][0])

    path = [best_last_v]
    curr_v = best_last_v
    for i in range(len(states) - 1, 0, -1):
        curr_v = dp[i][curr_v][1]
        path.append(curr_v)
    path.reverse()

    return path, None
