"""
HTTP-шар (Flask Blueprint): приймає запити, викликає чисту логіку з
voice_leading.py / chord_detection.py, повертає JSON. Жодної музичної
математики тут навмисно немає — вона вся в тих двох модулях і тестується
без Flask (див. AGENTS.md "Testing this project"). За тим самим принципом,
що app.js/audio-chords.js на фронтенді — DOM-контролери, а theory.js —
чисті дані/функції.
"""
import os
import tempfile

from flask import Blueprint, request, jsonify, render_template

from .voice_leading import solve_voice_leading
from .chord_detection import AUDIO_DEPS_AVAILABLE, detect_chords_from_audio

bp = Blueprint('main', __name__)


@bp.route('/')
def index():
    return render_template('index.html')


@bp.route('/api/voice-lead', methods=['POST'])
def api_voice_lead():
    data = request.json
    progression_pcs = data.get('progression', [])
    algorithm = data.get('algorithm', 'ergonomic')

    path, error = solve_voice_leading(progression_pcs, algorithm)
    if error:
        return jsonify({"error": error}), 400

    result = [{"5": v[0], "4": v[1], "3": v[2], "2": v[3]} for v in path]
    return jsonify({"path": result})


@bp.route('/api/detect-chords', methods=['POST'])
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
