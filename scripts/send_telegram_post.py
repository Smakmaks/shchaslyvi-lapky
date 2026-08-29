"""
Надсилає сьогоднішній запланований пост із telegram-posts.json у Telegram-канал.
Запускається кожні 30 хв через GitHub Actions (.github/workflows/telegram-post.yml) —
GitHub Actions може відкладати денний cron на години, тому надійніше перевіряти
часте вікно і надсилати щойно настав потрібний час, ніж покладатись на точний час крону.

Формат telegram-posts.json — список об'єктів:
  {"date": "YYYY-MM-DD", "text": "...", "image": "https://..." | null, "sent": false}

Надсилає лише якщо зараз >= PUBLISH_HOUR за Europe/Kyiv — раніше цього часу
скрипт нічого не робить, навіть якщо запуститься. Знаходить перший ще не
надісланий запис з датою <= сьогодні, надсилає його через Telegram Bot API
і позначає sent: true.
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime
from zoneinfo import ZoneInfo

POSTS_FILE = os.path.join(os.path.dirname(__file__), "..", "telegram-posts.json")
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
CHANNEL = os.environ.get("TELEGRAM_CHANNEL", "@shchaslyvi_lapky_shop")
PUBLISH_HOUR = 19  # не надсилати раніше 19:00 за Europe/Kyiv


def telegram_api(method, payload):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        raise RuntimeError(f"Telegram API {method} failed: {e.code} {body}")


def main():
    if not BOT_TOKEN:
        print("::error::TELEGRAM_BOT_TOKEN секрет не заданий")
        sys.exit(1)

    now_kyiv = datetime.now(ZoneInfo("Europe/Kyiv"))
    if now_kyiv.hour < PUBLISH_HOUR:
        print(f"Ще не {PUBLISH_HOUR}:00 за Києвом (зараз {now_kyiv.strftime('%H:%M')}) — чекаємо.")
        return

    with open(POSTS_FILE, "r", encoding="utf-8") as f:
        posts = json.load(f)

    today = now_kyiv.date().isoformat()

    # Перший ще не надісланий пост, дата якого вже настала
    due = [p for p in posts if not p.get("sent") and p["date"] <= today]
    if not due:
        print(f"Немає постів на надсилання (сьогодні {today}).")
        return

    post = sorted(due, key=lambda p: p["date"])[0]
    print(f"Надсилаю пост за {post['date']}...")

    if post.get("image"):
        result = telegram_api(
            "sendPhoto",
            {
                "chat_id": CHANNEL,
                "photo": post["image"],
                "caption": post["text"],
            },
        )
    else:
        result = telegram_api(
            "sendMessage",
            {
                "chat_id": CHANNEL,
                "text": post["text"],
            },
        )

    if not result.get("ok"):
        print(f"::error::Telegram відповів помилкою: {result}")
        sys.exit(1)

    print("Надіслано успішно.")

    for p in posts:
        if p is post:
            p["sent"] = True

    with open(POSTS_FILE, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
