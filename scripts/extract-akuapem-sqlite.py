#!/usr/bin/env python3
# extract-akuapem-sqlite.py — pull the Akuapem/Asante Twi bible out of the
# christappzz APK's Room database (assets/book_database) and emit a ChMS Bible
# bundle (see apps/api/src/bible/bible.service.ts for the shape).
#
# usage: python extract-akuapem-sqlite.py <book_database> <out.json> [translation_key]
#   translation_key defaults to 'twi_bible' (the DB also contains 'nkjv_bible')
#
# Schema notes (Room): ChapterOfVerseData.titleOfVerse holds VERSE TEXT with the
# verse number prefixed ("1 In the beginning…"); rows with isVerseTitle=1 /
# isFooter=1 are titles/footers and are skipped. Books come from TotalBooks
# (subBookName = standard English book names), chapters from BooksOfChapter.
import json
import re
import sqlite3
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

KJV_JSON = sys.argv[4] if len(sys.argv) > 4 else r"C:\Users\HP\Desktop\church\apps\api\data\bible\kjv.json"


def main():
    if len(sys.argv) < 3:
        print(__doc__ or "usage: extract-akuapem-sqlite.py <book_database> <out.json> [translation_key]")
        sys.exit(1)
    db_path, out_path = sys.argv[1], sys.argv[2]
    lang_key = sys.argv[3] if len(sys.argv) > 3 else "twi_bible"

    con = sqlite3.connect(db_path)
    con.text_factory = str
    cur = con.cursor()

    books_meta = cur.execute(
        "SELECT subBookName, subBookId FROM TotalBooks WHERE WhichTypeOfBookName=? ORDER BY id",
        (lang_key,),
    ).fetchall()
    if len(books_meta) < 60:
        print(f"ERROR: only {len(books_meta)} books for {lang_key}; translations present:",
              cur.execute("SELECT DISTINCT WhichTypeOfBookName FROM TotalBooks").fetchall())
        sys.exit(2)

    verse_rows = cur.execute(
        "SELECT subBookId, chapterNoOfSubBook, isVerseTitle, isFooter, titleOfVerse "
        "FROM ChapterOfVerseData WHERE WhichTypeOfBookName=? ORDER BY id",
        (lang_key,),
    ).fetchall()

    by_book = {b[1]: {"name": b[0], "chapters": {}} for b in books_meta}
    stats = {"verses": 0, "titles": 0, "footers": 0, "captions": 0, "continued": 0}
    last_ref = None  # (sub_id, ch_key, idx) — continuations append here

    # Phase A: classify rows — numbered verses keep their source number (rows may
    # arrive OUT OF ORDER, e.g. 1 Tim 5 stores vv16–25 before vv1–15).
    events = []
    for sub_id, ch, is_title, is_footer, text in verse_rows:
        if sub_id not in by_book:
            continue
        if is_footer:
            stats["footers"] += 1
            continue
        text = (text or "").replace("\r\n", "\n").strip()
        if not text:
            continue
        if is_title:
            stats["titles"] += 1
            continue
        m = re.match(r"^(\d+)", text)
        if m:
            body = re.sub(r"^\d+\s*", "", text).replace("\n", " ").strip()
            events.append(("v", sub_id, int(ch), int(m.group(1)), body))
        else:
            events.append(("c", sub_id, int(ch), text))

    # Phase B: place verses with lookahead (same clamp rule as extract-apk-bible.mjs:
    # an isolated gap of >3 is a typo, but keep the number when the NEXT marker
    # continues n+1 — the out-of-order case above must NOT clamp).
    last_ref = None
    for i, ev in enumerate(events):
        if ev[0] == "c":
            _, sid, _ch, text = ev
            if len(text) > 25 and last_ref:
                psid, ck, idx = last_ref
                arr = by_book[psid]["chapters"][ck]
                if idx < len(arr) and arr[idx]:
                    arr[idx] = (arr[idx] + " " + text.replace("\n", " ")).strip()
                    stats["continued"] += 1
                    continue
            stats["captions"] += 1
            continue

        _, sub_id, ch, n, body = ev
        next_n = None
        for ev2 in events[i + 1:]:
            if ev2[0] == "v":
                next_n = ev2[3]
                break
        ch_key = str(ch)
        arr = by_book[sub_id]["chapters"].setdefault(ch_key, [])
        idx = n - 1
        if idx > len(arr) and idx - len(arr) > 3 and next_n != n + 1:
            idx = len(arr)
        while len(arr) < idx:
            arr.append("")  # source-omitted verse
        if idx < len(arr) and arr[idx]:
            stats["captions"] += 1
            continue  # duplicate number — keep first
        if idx < len(arr):
            arr[idx] = body
        else:
            arr.append(body)
        last_ref = (sub_id, ch_key, idx)
        # numbered row with EMPTY text still claims its slot — the following
        # unnumbered row (verse text split across rows) fills it via last_ref
        if body:
            stats["verses"] += 1
        else:
            stats["placeholders"] += 1

    # keep chapters that have content; fill omitted verses with ellipsis
    books = []
    for _, sub_id in books_meta:
        b = by_book[sub_id]
        chapters = {c: [v if v.strip() else "…" for v in vs] for c, vs in b["chapters"].items() if any(v.strip() for v in vs)}
        books.append({"name": b["name"], "chapters": chapters})

    # validate names + structure against KJV
    try:
        with open(KJV_JSON, encoding="utf-8") as fh:
            kjv_names = [b["name"] for b in json.load(fh)["books"]]
    except Exception as exc:
        kjv_names = []
        print(f"WARN: KJV not loaded ({exc}) — skipping name validation")
    got = [b["name"] for b in books]
    if kjv_names:
        missing = [n for n in kjv_names if n not in got]
        extra = [n for n in got if n not in kjv_names]
        print(f"name check: missing={missing or 'none'} extra={extra or 'none'}")

    total = sum(len(v) for b in books for v in b["chapters"].values())
    bundle = {
        "translation": "TWI (Asante)",
        "language": "Twi",
        "languageCode": "tw",
        "license": "Extracted from Akuapem Twi Bible & Audio APK (com.christappzz.twi.bible.akaupem) Room DB — "
                   "labelled 'TWI BIBLE ASANTE VERSION' in-app; translation identity/rights NOT verified. "
                   "Confirm redistribution rights before public hosting.",
        "publicDomain": False,
        "source": "com.christappzz.twi.bible.akaupem (assets/book_database)",
        "books": books,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(bundle, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"books={len(books)} chapters={sum(len(b['chapters']) for b in books)} verses(total rows kept)={total} stats={stats}")
    print(f"written: {out_path}")


if __name__ == "__main__":
    main()
