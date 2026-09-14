#!/usr/bin/env python3
"""Publish due static-blog articles stored on a non-Pages Git branch."""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from html import escape
from pathlib import Path


BLOG_INDEX = Path("blog/index.html")
SITEMAP = Path("sitemap.xml")
SITE_BASE = "https://smakmaks.github.io/shchaslyvi-lapky"


def git_show(ref: str, path: str) -> bytes:
    return subprocess.run(
        ["git", "show", f"{ref}:{path}"],
        check=True,
        stdout=subprocess.PIPE,
    ).stdout


def parse_now(value: str | None) -> datetime:
    if value:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("--now must include a timezone")
        return parsed
    return datetime.now(timezone.utc)


def card(entry: dict[str, str]) -> str:
    return f'''\n        <!-- scheduled:{escape(entry["slug"])} -->
        <a class="blog-card" href="{escape(Path(entry["destination"]).name)}">
          <p class="blog-card__eyebrow">{escape(entry["eyebrow"])}</p>
          <h2 class="blog-card__title">{escape(entry["title"])}</h2>
          <p class="blog-card__excerpt">{escape(entry["description"])}</p>
        </a>\n'''


def insert_card(index_html: str, entry: dict[str, str]) -> str:
    marker = f'<!-- scheduled:{entry["slug"]} -->'
    if marker in index_html:
        return index_html
    anchor = "\n      </div>\n    </div>\n  </main>"
    if anchor not in index_html:
        raise RuntimeError("Could not locate blog-list closing tag")
    return index_html.replace(anchor, card(entry) + anchor, 1)


def insert_sitemap(sitemap: str, entry: dict[str, str]) -> str:
    destination = Path(entry["destination"]).name
    loc = f"{SITE_BASE}/blog/{destination}"
    if loc in sitemap:
        return sitemap
    published = datetime.fromisoformat(entry["publish_at"]).date().isoformat()
    node = f'''  <url>
    <loc>{escape(loc)}</loc>
    <lastmod>{published}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
'''
    return sitemap.replace("</urlset>", node + "</urlset>", 1)


def load_manifest(path: str, source_ref: str) -> list[dict[str, str]]:
    local = Path(path)
    raw = local.read_bytes() if local.exists() else git_show(source_ref, path)
    entries = json.loads(raw)
    if not isinstance(entries, list):
        raise ValueError("Manifest must be a JSON list")
    return entries


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="scheduled-blog/manifest.json")
    parser.add_argument("--source-ref", default="origin/scheduled-blog-september")
    parser.add_argument("--now", help="Override current ISO timestamp for testing")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    now = parse_now(args.now)
    due: list[dict[str, str]] = []
    for entry in load_manifest(args.manifest, args.source_ref):
        publish_at = datetime.fromisoformat(entry["publish_at"])
        if publish_at <= now and not Path(entry["destination"]).exists():
            due.append(entry)

    if not due:
        print("No blog articles are due.")
        return 0

    for entry in due:
        print(f'Due: {entry["publish_at"]} — {entry["title"]}')
    if args.dry_run:
        return 0

    index_html = BLOG_INDEX.read_text(encoding="utf-8")
    sitemap = SITEMAP.read_text(encoding="utf-8")
    for entry in due:
        destination = Path(entry["destination"])
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(git_show(args.source_ref, entry["source"]))
        index_html = insert_card(index_html, entry)
        sitemap = insert_sitemap(sitemap, entry)

    BLOG_INDEX.write_text(index_html, encoding="utf-8")
    SITEMAP.write_text(sitemap, encoding="utf-8")
    print(f"Published {len(due)} article(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
