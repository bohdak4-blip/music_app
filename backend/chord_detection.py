"""
Розпізнавання акордів з аудіофайлу (легкий підхід: хрома-ознаки + пошук
найближчого шаблону акорду, без важких ML-моделей на кшталт madmom, тому
встановлюється звичайним pip install і не потребує компілятора). Чиста
логіка, без Flask — легко тестувати окремо (див. AGENTS.md "Testing this
project"). AUDIO_DEPS_AVAILABLE дозволяє решті застосунку працювати навіть
якщо librosa/numpy не встановлені — лише ця вкладка тоді повідомить помилку.
"""
try:
    import numpy as np
    import librosa
    AUDIO_DEPS_AVAILABLE = True
    AUDIO_DEPS_ERROR = None
except ImportError as _e:
    AUDIO_DEPS_AVAILABLE = False
    AUDIO_DEPS_ERROR = str(_e)

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
