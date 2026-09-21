# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec для music_app.

Збірка (у теці проєкту, з активованим .venv, у якому вже встановлено
requirements.txt + requirements-build.txt):

    pyinstaller music_app.spec

Результат: dist/music_app/music_app.exe - тека "onedir" (.exe поруч зі
своїми залежностями), а не єдиний "onefile" .exe. Обрано свідомо: numba
(залежність librosa) кешує JIT-скомпільований код на диску і найкраще
почувається в стабільній теці поруч з .exe; у режимі onefile довелося б
розпаковувати десятки мегабайтів у тимчасову теку і перекомпільовувати
numba-код при КОЖНОМУ запуску, що суттєво уповільнює старт. Якщо
однофайловий .exe все ж потрібен - дивіться коментар "ONEFILE" нижче.

Детальніше про причини (numba/llvmlite/soundfile, чому потрібен
collect_all, WebView2 на цільовій машині) - AGENTS.md, розділ
"Збірка .exe (PyInstaller)".
"""
from PyInstaller.utils.hooks import collect_all

# templates/ і static/ - Flask шукає їх через resource_path() в app.py,
# який враховує розпаковану PyInstaller-теку (sys._MEIPASS).
datas = [("templates", "templates"), ("static", "static")]
binaries = []
hiddenimports = []

# librosa/numba/llvmlite/soundfile/webview мають дані та/або біноварні
# залежності (JIT-компілятор, бандл libsndfile, .NET-міст для
# WebView2-бекенда), які звичайний аналіз PyInstaller часто не знаходить
# сам. collect_all тягне все явно і надійно, ціною більшого розміру збірки.
for pkg in ("librosa", "numba", "llvmlite", "soundfile", "webview"):
    try:
        pkg_datas, pkg_binaries, pkg_hiddenimports = collect_all(pkg)
        datas += pkg_datas
        binaries += pkg_binaries
        hiddenimports += pkg_hiddenimports
    except Exception:
        # Пакет не встановлено (наприклад, librosa пропущено навмисно) -
        # тоді вкладка розпізнавання акордів у зібраному .exe покаже
        # помилку в рантаймі так само, як і при запуску з вихідників без
        # librosa, а решта застосунку працює як завжди.
        pass

a = Analysis(
    ["app.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="music_app",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    # console=True тимчасово, якщо .exe падає без пояснень - побачите
    # traceback у консольному вікні замість того, щоб вікно просто зникло.
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# ONEFILE: якщо потрібен саме один .exe-файл (а не тека) - видаліть весь
# блок COLLECT нижче і в EXE(...) вище поміняйте `exclude_binaries=True`
# на `exclude_binaries=False`, а також додайте туди ж `a.binaries,
# a.zipfiles, a.datas,` (як у COLLECT нижче). Старт буде помітно повільнішим
# при кожному запуску - див. пояснення на початку файлу.
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="music_app",
)
