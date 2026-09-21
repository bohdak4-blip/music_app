"""
Автоматизовані тести бекенду (pytest). Використовують Flask test client
напряму проти backend/routes.py — НЕ імпортують app.py, бо той тягне
webview (потрібен лише для нативного вікна, не для HTTP-логіки, і не
завжди встановлений там, де просто хочеться прогнати тести).

Запуск:
    pip install -r requirements.txt -r requirements-dev.txt
    pytest
"""
import os

import pytest
from flask import Flask

from backend.routes import bp


@pytest.fixture
def client():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    flask_app = Flask(
        __name__,
        template_folder=os.path.join(project_root, "templates"),
        static_folder=os.path.join(project_root, "static"),
    )
    flask_app.register_blueprint(bp)
    flask_app.testing = True
    return flask_app.test_client()


def test_index_page_renders(client):
    r = client.get("/")
    assert r.status_code == 200
    assert b"<html" in r.data.lower()


def test_voice_lead_returns_full_path_for_four_chord_progression(client):
    # I-vi-IV-V in C major: C, Am, F, G
    progression = [
        [0, 4, 7],
        [9, 0, 4],
        [5, 9, 0],
        [7, 11, 2],
    ]
    r = client.post("/api/voice-lead", json={"progression": progression, "algorithm": "ergonomic"})
    assert r.status_code == 200
    body = r.get_json()
    assert "path" in body
    assert len(body["path"]) == 4
    for step in body["path"]:
        assert set(step.keys()) == {"5", "4", "3", "2"}


def test_voice_lead_rejects_empty_progression(client):
    r = client.post("/api/voice-lead", json={"progression": []})
    assert r.status_code == 400
    assert "error" in r.get_json()


def test_detect_chords_requires_a_file(client):
    r = client.post("/api/detect-chords", data={})
    assert r.status_code in (400, 500)
