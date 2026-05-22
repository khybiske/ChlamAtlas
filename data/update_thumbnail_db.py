#!/usr/bin/env python3
"""
update_thumbnail_db.py

After generate_thumbnails.py has run and images have been pushed to GitHub,
this script updates alphafold_results.thumbnail_path in Supabase with the
correct raw GitHub URLs for each image found locally.

Run after: git push (images must be on GitHub before the URLs are live)

Usage:
  python3 update_thumbnail_db.py --dry-run   # preview what would be updated
  python3 update_thumbnail_db.py             # apply updates to Supabase
  python3 update_thumbnail_db.py --source af3_ebi  # target a different af_version
"""

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

SUPABASE_URL = "https://ihobumwetoidqioifknt.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or (
    print("Error: set SUPABASE_SERVICE_KEY env var (service_role key required for writes)", file=sys.stderr)
    or sys.exit(1)
)
GITHUB_RAW   = "https://raw.githubusercontent.com/khybiske/ChlamAtlas/refs/heads/main"
REPO_ROOT    = Path(__file__).parent.parent
AFMODELS_DIR = REPO_ROOT / "AFmodels"

STRAIN_FOLDER = {
    "CT-L2": "L2",
    "CT-D":  "DUW3",
    "CM":    "CM",
}

# Must match af_version values used in generate_thumbnails.py SOURCE_CONFIGS
AF_VERSIONS = ["AF2", "AF3", "AFDB"]


def sb_get(path, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{path}{'?' + params if params else ''}"
    req = urllib.request.Request(url, headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def sb_patch(path, match_param, payload):
    url  = f"{SUPABASE_URL}/rest/v1/{path}?{match_param}"
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(url, data=data, method="PATCH", headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    })
    urllib.request.urlopen(req)


def fetch_rows_needing_update(af_version):
    """Fetch alphafold_results rows with null thumbnail_path for the given af_version."""
    rows      = []
    page_size = 1000
    offset    = 0

    while True:
        params = (
            "select=id,proteins(uniprot_id,genes(locus_tag,strains(common_name)))"
            f"&thumbnail_path=is.null&af_version=eq.{af_version}"
            f"&limit={page_size}&offset={offset}"
        )
        page = sb_get("alphafold_results", params)
        if not page:
            break
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size

    return rows


def build_update_list(rows):
    """
    Cross-reference DB rows against local image files.
    Returns list of (af_id, github_url, locus_tag) for rows that have a local image.
    """
    updates = []
    for r in rows:
        p      = r.get("proteins") or {}
        g      = p.get("genes") or {}
        s      = g.get("strains") or {}
        folder = STRAIN_FOLDER.get(s.get("common_name", ""), "")
        tag    = g.get("locus_tag", "")
        if not folder or not tag:
            continue
        local_path = AFMODELS_DIR / folder / f"{tag}.png"
        if not local_path.exists():
            continue
        github_url = f"{GITHUB_RAW}/AFmodels/{folder}/{tag}.png"
        updates.append((r["id"], github_url, tag))
    return updates


def main():
    ap = argparse.ArgumentParser(
        description="Update Supabase thumbnail_path URLs after pushing images to GitHub."
    )
    ap.add_argument("--dry-run",  action="store_true",
                    help="Preview updates without writing to Supabase")
    ap.add_argument("--source",   default="AF2",
                    choices=AF_VERSIONS,
                    help="Which af_version to target (default: AF2)")
    ap.add_argument("--limit",    type=int, default=None,
                    help="Cap number of updates (useful for testing)")
    args = ap.parse_args()

    print(f"Source: af_version={args.source}")
    print("Fetching alphafold_results rows with null thumbnail_path from Supabase...")

    rows    = fetch_rows_needing_update(args.source)
    updates = build_update_list(rows)

    if args.limit:
        updates = updates[:args.limit]

    if not updates:
        print("No matching local images found. Have you run generate_thumbnails.py and git push?")
        sys.exit(0)

    print(f"Found {len(updates)} image(s) ready to register.\n")

    if args.dry_run:
        print("[DRY RUN] Would update these rows:")
        for af_id, url, tag in updates[:15]:
            print(f"  {tag:12s}  {url}")
        if len(updates) > 15:
            print(f"  ... and {len(updates) - 15} more")
        print(f"\nRe-run without --dry-run to apply.")
        return

    ok = fail = 0
    for af_id, github_url, tag in updates:
        try:
            sb_patch("alphafold_results", f"id=eq.{af_id}", {"thumbnail_path": github_url})
            print(f"  ✓  {tag}")
            ok += 1
        except Exception as e:
            print(f"  ✗  {tag}  {e}")
            fail += 1

    print(f"\nDone: {ok} updated  {fail} failed")


if __name__ == "__main__":
    main()
