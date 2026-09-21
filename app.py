import os
import sys
import tempfile

import webview
from flask import Flask, request, jsonify, render_template
import itertools

try:
    import numpy as np
    import librosa
    AUDIO_DEPS_AVAILABLE = True
    AUDIO_DEPS_ERROR = None
except ImportError as _e:
    AUDIO_DEPS_AVAILABLE = False
    AUDIO_DEPS_ERROR = str(_e)


def resource_path(relative_path):
    """
    Абсолютний шлях до ресурсу (templates/, static/), який працює
    однаково і при запуску "python app.py" з вихідників, і у
    скомпільованому .exe. PyInstaller (onefile і onedir) розпаковує/кладе
    додані дані у власну теку, шлях до якої видно через sys._MEIPASS лише
    в замороженому (frozen) стані - для звичайного запуску цього атрибута
    немає, тож використовуємо теку самого файлу як запасний варіант.
    """
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)


app = Flask(
    __name__,
    template_folder=resource_path("templates"),
    static_folder=resource_path("static"),
)

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


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/voice-lead', methods=['POST'])
def api_voice_lead():
    data = request.json
    progression_pcs = data.get('progression', [])
    algorithm = data.get('algorithm', 'ergonomic')

    if not progression_pcs:
        return jsonify({"error": "Порожня прогресія"}), 400

    states = [generate_voicings(pcs) for pcs in progression_pcs]

    if any(not s for s in states):
        return jsonify({"error": "Для одного з акордів не знайдено зручної аплікатури на середніх струнах."}), 400

    # Передаємо цільові ноти (progression_pcs[i]) в shape_difficulty для оцінки басу
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
    result = [{"5": v[0], "4": v[1], "3": v[2], "2": v[3]} for v in path]

    return jsonify({"path": result})


# ---------------------------------------------------------------------------
# Розпізнавання акордів з аудіофайлу (легкий підхід: хрома-ознаки + пошук
# найближчого шаблону акорду, без важких ML-моделей на кшталт madmom, тому
# встановлюється звичайним pip install і не потребує компілятора).
# ---------------------------------------------------------------------------

NOTE_NAMES_AUDIO = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

# Ступеневий склад (у півтонах від кореня) для кожного типу акорду, який ми
# вміємо впізнавати. Навмисно обмежено тими ж якостями, що вже підтримує
# фронтенд (customChordTypes у theory.js), плюс проста тріада без септими.
CHORD_QUALITY_INTERVALS = {
    "":     [0, 4, 7],       # мажорне тризвуччя
    "m":    [0, 3, 7],       # мінорне тризвуччя
    "7":    [0, 4, 7, 10],   # домінантсептакорд
    "maj7": [0, 4, 7, 11],
    "m7":   [0, 3, 7, 10],
    "dim":  [0, 3, 6],
    "aug":  [0, 4, 8],
    "sus2": [0, 2, 7],
    "sus4": [0, 5, 7],
}


def _build_chord_template_bank():
    """12 тонік x N якостей акордів -> нормалізовані 12-вектори хроми."""
    bank = []
    for quality, intervals in CHORD_QUALITY_INTERVALS.items():
        for root in range(12):
            vec = np.zeros(12, dtype=float)
            for interval in intervals:
                vec[(root + interval) % 12] = 1.0
            vec /= np.linalg.norm(vec)
            label = NOTE_NAMES_AUDIO[root] + quality
            bank.append((label, vec))
    return bank


def detect_chords_from_audio(path, window_seconds=0.5, min_segment_seconds=1.0):
    """
    Повертає список сегментів [{start, end, chord}] (секунди, назва акорду
    або "N" для тиші/невизначеного звучання).

    Підхід: CQT-хрома по гармонічній складовій сигналу -> усереднення у вікна
    ~0.5с для стабільності -> косинусна відстань до банку шаблонів акордів ->
    злиття сусідніх однакових сегментів -> злиття надто коротких "миготінь".
    Це не нейромережевий розпізнавач (як madmom / BTC), тому не варто
    очікувати ідеальної точності на щільних джазових гармоніях, але для
    типового поп/рок/акустичного запису з чіткими акордами гітари чи фортепіано
    результат цілком читабельний.
    """
    if not AUDIO_DEPS_AVAILABLE:
        raise RuntimeError(
            "Аудіо-залежності не встановлено (librosa/numpy): " + str(AUDIO_DEPS_ERROR)
        )

    y, sr = librosa.load(path, sr=22050, mono=True)
    if y.size == 0:
        return []

    # Прибираємо перкусійну складову (барабани/атаки) - вона лише шумить у хромі.
    y_harmonic = librosa.effects.harmonic(y)

    hop_length = 2048
    chroma = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr, hop_length=hop_length)
    n_frames = chroma.shape[1]
    if n_frames == 0:
        return []

    times = librosa.frames_to_time(np.arange(n_frames), sr=sr, hop_length=hop_length)
    frames_per_window = max(1, int(round(window_seconds * sr / hop_length)))
    template_bank = _build_chord_template_bank()

    raw_segments = []
    for start in range(0, n_frames, frames_per_window):
        end = min(start + frames_per_window, n_frames)
        mean_vec = chroma[:, start:end].mean(axis=1)
        energy = float(np.linalg.norm(mean_vec))
        t0 = float(times[start])
        t1 = float(times[end - 1]) if end - 1 < n_frames else float(times[-1])

        if energy < 1e-3:
            label = "N"
        else:
            norm_vec = mean_vec / energy
            best_label, best_score = "N", -1.0
            for label_candidate, template in template_bank:
                score = float(np.dot(norm_vec, template))
                if score > best_score:
                    best_score, best_label = score, label_candidate
            label = best_label

        if raw_segments and raw_segments[-1]["chord"] == label:
            raw_segments[-1]["end"] = t1
        else:
            raw_segments.append({"start": t0, "end": t1, "chord": label})

    # Зливаємо надто короткі сегменти (ймовірний шум/перехідний акорд) із
    # попереднім, а потім ще раз склеюємо однакові сусідні мітки, які могли
    # утворитись після цього злиття.
    merged = []
    for seg in raw_segments:
        duration = seg["end"] - seg["start"]
        if merged and duration < min_segment_seconds:
            merged[-1]["end"] = seg["end"]
        else:
            merged.append(dict(seg))

    final_segments = []
    for seg in merged:
        if final_segments and final_segments[-1]["chord"] == seg["chord"]:
            final_segments[-1]["end"] = seg["end"]
        else:
            final_segments.append(seg)

    return final_segments


@app.route('/api/detect-chords', methods=['POST'])
def api_detect_chords():
    if not AUDIO_DEPS_AVAILABLE:
        return jsonify({
            "error": "Розпізнавання акордів недоступне: не встановлено librosa/numpy. "
                     "Виконайте: pip install -r requirements.txt"
        }), 500

    if 'audio' not in request.files or request.files['audio'].filename == '':
        return jsonify({"error": "Аудіофайл не додано"}), 400

    audio_file = request.files['audio']
    suffix = os.path.splitext(audio_file.filename)[1] or '.wav'

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            audio_file.save(tmp.name)
            tmp_path = tmp.name

        segments = detect_chords_from_audio(tmp_path)
    except Exception as exc:  # noqa: BLE001 - показуємо повідомлення користувачу, не тільки в лог
        return jsonify({"error": f"Не вдалося обробити файл: {exc}"}), 500
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    duration = segments[-1]["end"] if segments else 0.0
    return jsonify({"segments": segments, "duration": duration})


if __name__ == '__main__':
    # Створюємо вікно програми, передаючи йому наш Flask-додаток
    window = webview.create_window(
        'AI Голосовеведення для Гітари',
        app,
        width=1150,
        height=850,
        min_size=(800, 600)
    )
    # Запускаємо десктопний додаток
    webview.start()