"""
Надсилає адміну в особисті прев'ю поста, який буде опубліковано сьогодні о 19:00,
щоб можна було внести корективи до фактичної публікації в канал.
Запускається щодня вранці через GitHub Actions (.github/workflows/telegram-preview.yml).

Використовує ту саму логіку вибору поста, що й send_telegram_post.py,
але лише надсилає його адміну і позначає previewed: true (не sent).
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
ADMIN_CHAT_ID = os.environ.get("TELEGRAM_ADMIN_CHAT_ID")


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
    if not ADMIN_CHAT_ID:
        print("::error::TELEGRAM_ADMIN_CHAT_ID секрет не заданий")
        sys.exit(1)

    with open(POSTS_FILE, "r", encoding="utf-8") as f:
        posts = json.load(f)

    today = datetime.now(ZoneInfo("Europe/Kyiv")).date().isoformat()

    # Перший ще не опублікований і ще не показаний на прев'ю пост, дата якого вже настала
    due = [
        p
        for p in posts
        if not p.get("sent") and not p.get("previewed") and p["date"] <= today
    ]
    if not due:
        print(f"Немає постів на прев'ю (сьогодні {today}).")
        return

    post = sorted(due, key=lambda p: p["date"])[0]
    print(f"Надсилаю прев'ю поста за {post['date']}...")

    caption = f"🔍 ПРЕВ'Ю — сьогодні о 19:00 буде опубліковано в канал:\n\n{post['text']}"

    if post.get("image"):
        result = telegram_api(
            "sendPhoto",
            {"chat_id": ADMIN_CHAT_ID, "photo": post["image"], "caption": caption},
        )
    else:
        result = telegram_api(
            "sendMessage",
            {"chat_id": ADMIN_CHAT_ID, "text": caption},
        )

    if not result.get("ok"):
        print(f"::error::Telegram відповів помилкою: {result}")
        sys.exit(1)

    print("Прев'ю надіслано успішно.")

    for p in posts:
        if p is post:
            p["previewed"] = True

    with open(POSTS_FILE, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
