"""
Запускає цей самий Flask-додаток БЕЗ pywebview-вікна, доступним по мережі -
або по домашньому Wi-Fi (локально), або, якщо на комп'ютері встановлено й
увімкнено Tailscale, звідусіль, де є інтернет (через стабільну Tailscale-
адресу цього комп'ютера). Додає на головний екран iPhone через Safari
("Поділитися" -> "На екран Домій").

Навмисно окремий файл, а не новий режим app.py: app.py лишається
незмінним (і далі відкриває pywebview-вікно при "python app.py"), а цей
файл просто імпортує вже готовий Flask-додаток (`app` з app.py,
створений через create_app()) і піднімає його на 0.0.0.0 - тобто на всіх
мережевих інтерфейсах цього комп'ютера (звичайний Wi-Fi і, якщо є,
Tailscale), а не лише на localhost.

Без Tailscale телефон і цей комп'ютер мають бути в одній Wi-Fi мережі.
З Tailscale (встановленим і увімкненим на обох пристроях, залогиненим в
один акаунт) - працює з будь-якого місця з інтернетом, в т.ч. на мобільних
даних, без прив'язки до конкретної мережі.

При першому запуску Windows, скоріш за все, спитає дозвіл через Брандмауер
Windows ("Windows Defender Firewall") - треба дозволити доступ для
приватних мереж (Private networks), інакше ніхто не зможе достукатись.
"""
import socket
import subprocess

from app import app as flask_app

PORT = 5000


def get_local_ip():
    """
    Локальна IP-адреса цього комп'ютера у звичайній (домашній) мережі
    (напр. 192.168.1.23). Трюк без реального мережевого запиту:
    "підключаємось" по UDP до публічної адреси (нічого фактично не
    надсилається), і ОС підбирає вихідний мережевий інтерфейс для
    звичайного інтернет-трафіку - з нього й беремо IP. Це НЕ той самий
    інтерфейс, що Tailscale (Tailscale не змінює маршрут для звичайного
    інтернет-трафіку, лише додає маршрути до tailnet-адрес 100.x.x.x) -
    тому Tailscale-адреса визначається окремо, через get_tailscale_ip().
    Якщо мережі немає взагалі, тихо повертаємось до localhost.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def get_tailscale_ip():
    """
    Tailscale-адреса цього комп'ютера (100.x.x.x), якщо Tailscale
    встановлено й увімкнено - через офіційний `tailscale ip -4`.
    Повертає None, якщо команда не знайдена, Tailscale вимкнено, чи щось
    пішло не так - це необов'язкова можливість, а не вимога для запуску
    сервера, тож будь-яка помилка тут просто тихо пропускається.
    """
    try:
        result = subprocess.run(
            ["tailscale", "ip", "-4"],
            capture_output=True, text=True, timeout=3,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip().splitlines()[0]
    except Exception:
        pass
    return None


if __name__ == "__main__":
    local_ip = get_local_ip()
    tailscale_ip = get_tailscale_ip()

    print("=" * 56)
    print("  music_app запущено")
    print("=" * 56)
    print(f"  У домашній Wi-Fi мережі:\n\n      http://{local_ip}:{PORT}\n")
    if tailscale_ip:
        print(f"  З будь-якого місця (через Tailscale):\n\n      http://{tailscale_ip}:{PORT}\n")
    else:
        print("  Tailscale не знайдено або вимкнено - доступ лише в межах")
        print("  домашньої Wi-Fi мережі (адреса вище).")
        print()
    print("  У Safari на телефоні: кнопка 'Поділитися' -> 'На екран Домій',")
    print("  щоб отримати іконку застосунку.")
    print()
    print("  Якщо Windows запитає про доступ у брандмауері - дозвольте")
    print("  для приватних мереж (Private networks).")
    print("=" * 56)

    flask_app.run(host="0.0.0.0", port=PORT, threaded=True)
