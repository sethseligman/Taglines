#!/usr/bin/env python3
"""
boxofficemojo_top_grossing.py
=============================
Build a CSV of the top-N highest-grossing movies for each year, ranked by
*domestic* (US & Canada) box office, scraped from Box Office Mojo.

    https://www.boxofficemojo.com/year/<YEAR>/

WHY BOX OFFICE MOJO
-------------------
BOM is the canonical public source for accurate DOMESTIC (US/Canada) box office,
which is what TMDb cannot provide (TMDb only stores a single worldwide revenue
field). Each yearly page is a single ranked table, so we get rank + title +
domestic gross directly, with no per-movie follow-up requests.

IMPORTANT NOTES / CAVEATS
-------------------------
* COVERAGE: BOM's yearly charts reliably go back to 1977. Years 1975-1976 may
  return no page or sparse data; the script logs and skips any year it can't
  fetch rather than crashing.
* FIGURES: Domestic gross in NOMINAL dollars (not inflation-adjusted). These are
  a film's full domestic run as currently recorded (numbers for recent releases
  can still be climbing).
* "TOP OF A YEAR": BOM's default /year/ view ranks films by their domestic gross
  and includes RE-RELEASES (e.g. anniversary re-releases) mixed into the list.
  Use --exclude-rereleases to drop entries BOM annotates as re-releases/
  anniversaries so you get original releases only.
* TERMS OF USE: This scrapes a public IMDb/Box Office Mojo page. Be considerate:
  the script makes only one request per year and pauses between them. Review
  Box Office Mojo's terms before large-scale or commercial use.

USAGE
-----
    pip install requests beautifulsoup4
    python boxofficemojo_top_grossing.py
    python boxofficemojo_top_grossing.py --start-year 1977 --end-year 2024 \
        --top 50 --exclude-rereleases --output domestic_top50.csv
"""

import argparse
import csv
import datetime
import re
import sys
import time

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("This script needs 'requests' and 'beautifulsoup4'. Install with:\n"
             "    pip install requests beautifulsoup4")

YEAR_URL = "https://www.boxofficemojo.com/year/{year}/"

# A normal browser User-Agent. BOM serves a plain HTML table to ordinary GETs.
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/124.0 Safari/537.36"),
    "Accept-Language": "en-US,en;q=0.9",
}

# Text Box Office Mojo appends after a title to mark non-original releases.
RERELEASE_PATTERN = re.compile(
    r"(re-?release|anniversary|re-?issue|restored|remaster)", re.IGNORECASE)

MONEY_RE = re.compile(r"[^\d]")


def parse_money(text):
    """'$636,238,421' -> 636238421 ; '-' or '' -> None."""
    if not text:
        return None
    cleaned = MONEY_RE.sub("", text)
    return int(cleaned) if cleaned else None


def parse_int(text):
    if not text:
        return None
    cleaned = MONEY_RE.sub("", text)
    return int(cleaned) if cleaned else None


def find_year_table(soup):
    """Return the main results <table> on a /year/ page.

    Strategy is header-text based so it survives CSS/class changes: pick the
    first table whose header row contains both a 'Rank' and a 'Gross' column.
    """
    for table in soup.find_all("table"):
        header_cells = table.find_all("th")
        headers = [th.get_text(strip=True).lower() for th in header_cells]
        if any("rank" in h for h in headers) and any("gross" in h for h in headers):
            return table
    # Fallback: BOM's known class.
    return soup.find("table", class_=re.compile(r"mojo-body-table"))


def header_index_map(table):
    """Map normalized column header text -> column index."""
    header_row = table.find("tr")
    headers = [th.get_text(strip=True).lower()
               for th in header_row.find_all(["th", "td"])]
    return {h: i for i, h in enumerate(headers)}, headers


def cell_text(cells, idx):
    if idx is None or idx >= len(cells):
        return ""
    return cells[idx].get_text(" ", strip=True)


def parse_release_cell(cell):
    """Return (title, release_url, annotation).

    The release cell looks like:  <a href="/release/rl.../">Barbie</a>
    or, for a re-release:          <a ...>Titanic</a> 25 Year Anniversary
    The anchor text is the clean title; any trailing text is the annotation.
    """
    if cell is None:
        return "", "", ""
    link = cell.find("a")
    if link is not None:
        title = link.get_text(strip=True)
        href = link.get("href", "")
        if href.startswith("/"):
            href = "https://www.boxofficemojo.com" + href.split("?")[0]
        full = cell.get_text(" ", strip=True)
        annotation = full.replace(title, "", 1).strip()
        return title, href, annotation
    return cell.get_text(" ", strip=True), "", ""


def scrape_year(session, year, top_n, exclude_rereleases):
    """Return a list of row dicts for one year, or [] if unavailable."""
    url = YEAR_URL.format(year=year)
    resp = session.get(url, timeout=30)
    if resp.status_code == 404:
        print(f"  [{year}] no page (404) -- skipping.", file=sys.stderr)
        return []
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    table = find_year_table(soup)
    if table is None:
        print(f"  [{year}] no results table found -- skipping.", file=sys.stderr)
        return []

    idx_map, _ = header_index_map(table)

    # Resolve column indices by header text. Prefer an EXACT header match (so
    # 'Open' the date column is not shadowed by 'Opening' the weekend-gross
    # column), then fall back to a substring match.
    def col(*names):
        for n in names:
            for h, i in idx_map.items():
                if h == n:
                    return i
        for n in names:
            for h, i in idx_map.items():
                if n in h:
                    return i
        return None

    rel_i = col("release")
    gross_i = col("gross")
    dist_i = col("distributor")
    open_i = col("open")          # 'Open' (release date) column
    maxth_i = col("max th")
    openwk_i = col("opening")     # 'Opening' (opening weekend gross) column

    rows = []
    # Skip the header row; iterate the rest.
    all_rows = table.find_all("tr")
    for tr in all_rows[1:]:
        cells = tr.find_all("td")
        if not cells:
            continue
        rel_cell = cells[rel_i] if (rel_i is not None and rel_i < len(cells)) else None
        title, release_url, annotation = parse_release_cell(rel_cell)
        if not title:
            continue

        is_rerelease = bool(annotation and RERELEASE_PATTERN.search(annotation))
        if exclude_rereleases and is_rerelease:
            continue

        gross = parse_money(cell_text(cells, gross_i))

        rows.append({
            "year": year,
            "title": title,
            "domestic_gross": gross if gross is not None else "",
            "distributor": cell_text(cells, dist_i),
            "release_date": cell_text(cells, open_i),
            "max_theaters": parse_int(cell_text(cells, maxth_i)) or "",
            "opening_weekend": parse_money(cell_text(cells, openwk_i)) or "",
            "is_rerelease": is_rerelease,
            "boxofficemojo_url": release_url,
        })
        if len(rows) >= top_n:
            break

    # Re-rank after any re-release filtering so ranks are 1..N contiguous.
    for new_rank, row in enumerate(rows, start=1):
        row["rank"] = new_rank
    return rows


def main():
    current_year = datetime.date.today().year
    parser = argparse.ArgumentParser(
        description="Scrape top-grossing DOMESTIC movies per year from Box "
                    "Office Mojo into a CSV.")
    parser.add_argument("--start-year", type=int, default=1975)
    parser.add_argument("--end-year", type=int, default=current_year)
    parser.add_argument("--top", type=int, default=50,
                        help="Movies per year (default 50).")
    parser.add_argument("--exclude-rereleases", action="store_true",
                        help="Drop anniversary/re-release entries.")
    parser.add_argument("--output", default="boxofficemojo_top_grossing.csv")
    parser.add_argument("--delay", type=float, default=1.5,
                        help="Seconds to wait between years (be polite).")
    args = parser.parse_args()

    if args.start_year > args.end_year:
        sys.exit("--start-year must be <= --end-year.")
    if args.start_year < 1977:
        print("Note: Box Office Mojo yearly charts generally start at 1977; "
              "earlier years may be skipped.", file=sys.stderr)

    session = requests.Session()
    session.headers.update(HEADERS)

    fieldnames = [
        "year", "rank", "title", "domestic_gross", "distributor",
        "release_date", "max_theaters", "opening_weekend", "is_rerelease",
        "boxofficemojo_url",
    ]

    total = 0
    with open(args.output, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for year in range(args.start_year, args.end_year + 1):
            print(f"[{year}] fetching top {args.top} domestic...", flush=True)
            try:
                rows = scrape_year(session, year, args.top,
                                   args.exclude_rereleases)
            except Exception as exc:  # noqa: BLE001
                print(f"  ! {year} failed: {exc}", file=sys.stderr)
                continue
            for row in rows:
                writer.writerow({k: row.get(k, "") for k in fieldnames})
            fh.flush()
            total += len(rows)
            print(f"  -> {len(rows)} rows", flush=True)
            time.sleep(args.delay)

    print(f"\nDone. {total} rows -> {args.output}")
    print("Figures are DOMESTIC (US/Canada) gross in nominal dollars.")


if __name__ == "__main__":
    main()
