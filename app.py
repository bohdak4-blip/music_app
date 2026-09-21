"""
Точка входу застосунку: створює Flask-додаток (з правильними шляхами до
templates/static, які працюють і з вихідників, і у зібраному PyInstaller
.exe), реєструє HTTP-маршрути з backend/routes.py, і за прямого запуску
("python app.py") відкриває це все у нативному вікні через pywebview.

Уся музична логіка (voice-leading DP, розпізнавання акордів) винесена у
пакет backend/ — цей файл навмисно "тонкий" і не містить жодних обчислень,
за тим самим принципом, що застосований і на фронтенді (index.html —
розмітка, theory.js — чисті дані/функції, app.js/audio-chords.js —
DOM-контролери). Дивись AGENTS.md, розділ "Backend", для повного опису.
"""
import os
import sys

import webview
from flask import Flask

from backend.routes import bp


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


def create_app():
    flask_app = Flask(
        __name__,
        template_folder=resource_path("templates"),
        static_folder=resource_path("static"),
    )
    flask_app.register_blueprint(bp)
    return flask_app


app = create_app()


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
