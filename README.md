# music_app

Невеликий десктопний застосунок для гітаристів: Flask-бекенд + `pywebview`
(нативне вікно, без окремого сервера чи вкладки браузера).

## Що вміє

1. **AI-асистент голосоведення (voice-leading)** — для прогресії з 4 акордів
   перебирає всі можливі аплікатури на середніх чотирьох струнах (A, D, G, B)
   і Viterbi-подібним динамічним програмуванням підбирає найплавніший /
   найзручніший перехід від акорду до акорду.
2. **Перегляд гам і ладів на грифі або клавіатурі** — усі 7 диатонічних ладів
   (мажорна група: іонійський, лідійський, міксолідійський; мінорна:
   еолійський, дорійський, фригійський, локрійський) з підсвіченими
   ступенями, які відрізняються від "стандартного" мажору/мінору (наприклад,
   `#4` у лідійському). Можна перемикати вигляд гітара/фортепіано.
3. **Асистент модуляцій** — набір готових прикладів модуляції між тональностями
   плюс динамічний підбір варіантів для довільної пари тональностей.
4. **Розпізнавання акордів з аудіофайлу** — завантажте локальний аудіофайл і
   отримайте таймлайн акордів, які розпізнав легкий локальний аналізатор
   (хрома-ознаки + пошук найближчого шаблону акорду, без важких ML-моделей).

## Технології

- Python 3, Flask (`app.py`)
- `pywebview` для нативного вікна
- `librosa` + `numpy` для розпізнавання акордів (опціонально — застосунок
  запускається і без них, просто вкладка розпізнавання повідомить про
  відсутність залежностей)
- Фронтенд: чистий HTML/CSS/JS без фреймворків і build-кроку
  (`templates/index.html` + `static/css/style.css` +
  `static/js/{theory,app,audio-chords}.js`)

## Запуск з вихідників

```bash
pip install -r requirements.txt
python app.py
```

## Збірка Windows .exe (PyInstaller)

```bash
pip install -r requirements.txt -r requirements-build.txt
pyinstaller music_app.spec
```

Детальніше — у `AGENTS.md` (розділ "Building a Windows .exe (PyInstaller)"),
включно з поясненням чому obraно onedir-збірку та що робити, якщо збірка або
готовий `.exe` падають.

## Документація для розробки

Повний опис архітектури, історія змін і відомі обмеження — у `AGENTS.md` у
корені репозиторію. Це основне джерело правди про проєкт для будь-якої
майбутньої сесії розробки.

---

## Summary (English)

A small desktop app for guitarists combining an AI voice-leading assistant
(finds smooth chord-to-chord fingerings on a guitar fretboard), a scale/mode
viewer for guitar or piano that highlights scale degrees altered relative to
standard major/minor (e.g. Lydian's #4), a modulation assistant between keys,
and local audio chord detection (chroma features + template matching, no
heavy ML model required). Built with Python/Flask + `pywebview` for the
desktop shell, and plain HTML/CSS/JS (no framework) for the frontend. See
`AGENTS.md` for the full architecture writeup, and the PyInstaller build
instructions above for packaging a Windows `.exe`.

## License

MIT — see [LICENSE](LICENSE).
