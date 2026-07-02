#!/usr/bin/env python3
"""
generate_thumbnails.py

Generates structure thumbnails for ChlamAtlas proteins using a local Mol* viewer
served over localhost. Each protein's CIF file is fetched from the EBI AlphaFold
file CDN and rendered locally — no dependency on EBI's interactive website.

Designed to be re-run for different structure sources (AF2 today, AF3 later).
See SOURCE_CONFIGS below to add new sources.

Usage:
  python3 generate_thumbnails.py --pilot                  # 5 proteins, visible browser (POC)
  python3 generate_thumbnails.py --pilot --limit 10       # custom pilot size
  python3 generate_thumbnails.py --full --strain L2       # all missing L2, headless
  python3 generate_thumbnails.py --full --strain L2 --limit 100
  python3 generate_thumbnails.py --full --source af3_ebi  # when AFDB hosts AF3
  python3 generate_thumbnails.py --full --workers 4
"""

import asyncio
import argparse
import json
import sys
import threading
import time
import urllib.request
import urllib.parse
import http.server
import socketserver
import os
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = "https://ihobumwetoidqioifknt.supabase.co"
SUPABASE_KEY = "sb_publishable_ONFzRadujAFsi2mVGTmCvA_pK61sODL"
REPO_ROOT    = Path(__file__).parent.parent
AFMODELS_DIR = REPO_ROOT / "AFmodels"
VIEWER_HTML  = Path(__file__).parent / "viewer.html"
LOCAL_PORT   = 8765

STRAIN_FOLDER = {
    "CT-L2": "L2",
    "CT-D":  "DUW3",
    "CM":    "CM",
    "Cpn":   "Cpn",
}

# ── Post-processing constants ─────────────────────────────────────────────────
# viewer.html configures Mol* with axes: 'off', so post_process is a no-op
# by default. Keep these in case a future source config renders the axis.
AXIS_MASK_W = 0   # set > 0 if axis appears in renders from a given source
AXIS_MASK_H = 0

# ── Source configs ─────────────────────────────────────────────────────────────
# Each entry defines how to render structures for a given source.
#
# url_fn(uniprot_id, locus_tag, cif_url) → page URL to navigate to.
#
# To add AF3 support when AFDB publishes AF3 models:
#   1. Add an "af3_local" entry below (same url_fn, different af_version + cif_url_fn)
#   2. Run: python3 generate_thumbnails.py --full --source af3_local

SOURCE_CONFIGS = {
    "af2_local": {
        "label":       "AlphaFold v2 (local Mol* viewer)",
        "af_version":  "AF2",
        "cif_url_fn":  lambda uid: None,   # resolved by prefetch_cif_urls()
        "render_wait_ms": 2000,
        "use_local_server": True,
    },
    # Uncomment when AFDB publishes AF3 CIF files:
    # "af3_local": {
    #     "label":       "AlphaFold v3 (local Mol* viewer)",
    #     "af_version":  "AF3",
    #     "cif_url_fn":  lambda uid: None,   # resolved by prefetch_cif_urls()
    #     "render_wait_ms": 8000,
    #     "use_local_server": True,
    # },
}

DEFAULT_SOURCE = "af2_local"

# ── Local HTTP server ─────────────────────────────────────────────────────────

def start_local_server():
    """Serve the data/ directory on localhost so viewer.html is accessible."""
    data_dir = str(Path(__file__).parent)

    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=data_dir, **kwargs)

        def log_message(self, fmt, *args):
            pass  # suppress per-request logging

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("localhost", LOCAL_PORT), QuietHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    print(f"  Local viewer: http://localhost:{LOCAL_PORT}/viewer.html")
    return httpd

# ── Supabase helpers ──────────────────────────────────────────────────────────

def sb_get(path, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{path}{'?' + params if params else ''}"
    req = urllib.request.Request(url, headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def fetch_missing(af_version, limit=None, strain=None):
    """
    Returns alphafold_results rows with null thumbnail_path for the given
    af_version, joined to proteins/genes/strains.

    strain: optional folder name to restrict to one strain (e.g. "L2", "DUW3", "CM").
    """
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

        for r in page:
            p      = r.get("proteins") or {}
            uid    = p.get("uniprot_id")
            if not uid:
                continue
            g      = p.get("genes") or {}
            s      = g.get("strains") or {}
            folder = STRAIN_FOLDER.get(s.get("common_name", ""), "")
            if not folder:
                continue
            if strain and folder != strain:
                continue
            rows.append({
                "af_id":      r["id"],
                "uniprot_id": uid,
                "locus_tag":  g.get("locus_tag", ""),
                "folder":     folder,
            })
            if limit and len(rows) >= limit:
                return rows

        if len(page) < page_size:
            break
        offset += page_size

    return rows

# ── EBI API: resolve CIF URLs ─────────────────────────────────────────────────

async def prefetch_cif_urls(proteins, concurrency=8):
    """
    Fetch each protein's CIF URL from the EBI AlphaFold REST API.
    Returns a dict of {uniprot_id: cif_url}.

    The EBI API (alphafold.ebi.ac.uk/api/prediction/{id}) is a lightweight
    REST endpoint — not the interactive website that blocks headless browsers.
    """
    results   = {}
    semaphore = asyncio.Semaphore(concurrency)

    async def fetch_one(uid):
        async with semaphore:
            url = f"https://alphafold.ebi.ac.uk/api/prediction/{uid}"
            loop = asyncio.get_event_loop()
            try:
                def _get():
                    req = urllib.request.Request(url, headers={
                        "User-Agent": "ChlamAtlas/1.0 (khybiske@uw.edu; research use)"
                    })
                    with urllib.request.urlopen(req, timeout=15) as r:
                        return json.loads(r.read())
                data = await loop.run_in_executor(None, _get)
                results[uid] = data[0]["cifUrl"]
            except Exception as e:
                results[uid] = None

    unique_ids = list({p["uniprot_id"] for p in proteins})
    print(f"  Fetching CIF URLs for {len(unique_ids)} proteins from EBI API...")
    await asyncio.gather(*[fetch_one(uid) for uid in unique_ids])

    found   = sum(1 for v in results.values() if v)
    missing = len(unique_ids) - found
    print(f"  CIF URLs resolved: {found} ok, {missing} not found")
    return results

# ── Image post-processing ─────────────────────────────────────────────────────

def post_process(path):
    """
    Mask any remaining axis indicator from the canvas capture.
    viewer.html configures Mol* with axes: 'off', so this is typically a no-op
    (AXIS_MASK_W / AXIS_MASK_H are both 0). Kept for future source configs that
    may render an axis.
    """
    if AXIS_MASK_W <= 0 and AXIS_MASK_H <= 0:
        return

    from PIL import Image, ImageDraw
    img  = Image.open(path).convert("RGB")
    draw = ImageDraw.Draw(img)
    w, h = img.size
    draw.rectangle([(0, h - AXIS_MASK_H), (AXIS_MASK_W, h)], fill=(255, 255, 255))
    img.save(path, format="PNG")

# ── Playwright rendering ──────────────────────────────────────────────────────

async def render_one(page, cif_url, output_path, render_wait_ms):
    import base64

    viewer_url = f"http://localhost:{LOCAL_PORT}/viewer.html?cif={urllib.parse.quote(cif_url, safe='')}"

    try:
        # networkidle ensures the CDN script, CIF download, and Mol* render
        # have all completed before we attempt to read the canvas.
        await page.goto(viewer_url, wait_until="networkidle", timeout=90000)
    except Exception as e:
        return False, f"page load failed: {e}"

    # Check if Mol* reported a load error
    err = await page.evaluate("window.__error")
    if err:
        return False, f"Mol* error: {err}"

    # Short additional settle so the 3D scene is fully painted on the canvas
    await page.wait_for_timeout(render_wait_ms)

    # Read canvas pixels directly — bypasses any DOM overlays
    data_url = await page.evaluate("""() => {
        const all = Array.from(document.querySelectorAll('canvas'));
        if (!all.length) return null;
        const c = all.reduce((best, cv) =>
            (cv.width - cv.height) > (best.width - best.height) ? cv : best);
        try { return c.toDataURL('image/png'); }
        catch (e) { return 'ERROR:' + e.message; }
    }""")

    if not data_url:
        return False, "no canvas found"
    if str(data_url).startswith("ERROR:"):
        return False, f"toDataURL: {data_url}"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        img_bytes = base64.b64decode(data_url.split(",")[1])
        output_path.write_bytes(img_bytes)
    except Exception as e:
        return False, f"save failed: {e}"

    size = output_path.stat().st_size
    if size < 5_000:
        output_path.unlink(missing_ok=True)
        return False, f"only {size} bytes — likely blank; try increasing render_wait_ms"

    post_process(output_path)
    return True, ""

# ── Pilot (small batch, visible browser) ─────────────────────────────────────

async def run_pilot(proteins, source_cfg, cif_urls):
    from playwright.async_api import async_playwright

    n     = len(proteins)
    label = source_cfg["label"]
    wait  = source_cfg["render_wait_ms"]

    print(f"\n── PILOT ({label}): {n} proteins, visible browser ───────────────────")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False)
        ctx     = await browser.new_context(viewport={"width": 640, "height": 440})
        page    = await ctx.new_page()

        ok = fail = 0
        for p in proteins:
            uid     = p["uniprot_id"]
            cif_url = cif_urls.get(uid)
            out     = AFMODELS_DIR / p["folder"] / f"{p['locus_tag']}.png"
            print(f"  {p['locus_tag']:12s}  {uid:18s}  ", end="", flush=True)

            if not cif_url:
                print("✗  no CIF URL (not in EBI database)")
                fail += 1
                continue

            success, err = await render_one(page, cif_url, out, wait)
            if success:
                kb = out.stat().st_size // 1024
                print(f"✓  {kb} KB  →  {out.relative_to(REPO_ROOT)}")
                ok += 1
            else:
                print(f"✗  {err}")
                fail += 1

        await browser.close()

    print(f"\n  Result: {ok} ok  {fail} failed")
    if ok:
        print(f"\n  Inspect images in AFmodels/. If satisfied:")
        print(f"  python3 generate_thumbnails.py --full --strain {proteins[0]['folder']}")

# ── Full run (headless, parallel) ─────────────────────────────────────────────

async def _worker(browser, queue, results, source_cfg, cif_urls):
    ctx  = await browser.new_context(viewport={"width": 640, "height": 440})
    page = await ctx.new_page()
    wait = source_cfg["render_wait_ms"]

    while True:
        try:
            p = queue.get_nowait()
        except asyncio.QueueEmpty:
            break

        uid     = p["uniprot_id"]
        cif_url = cif_urls.get(uid)
        out     = AFMODELS_DIR / p["folder"] / f"{p['locus_tag']}.png"

        if not cif_url:
            results.append((p, False, "no CIF URL"))
            print(f"  [----] {p['folder']:4s}  {p['locus_tag']:12s}  ✗  no CIF URL")
            queue.task_done()
            continue

        success, err = await render_one(page, cif_url, out, wait)
        results.append((p, success, err))

        n      = len(results)
        status = (f"✓  {out.stat().st_size // 1024}KB" if success else f"✗  {err}")
        print(f"  [{n:4d}] {p['folder']:4s}  {p['locus_tag']:12s}  {status}")
        queue.task_done()

    await ctx.close()


async def run_full(proteins, source_cfg, cif_urls, workers=4):
    from playwright.async_api import async_playwright

    to_do   = [p for p in proteins
               if not (AFMODELS_DIR / p["folder"] / f"{p['locus_tag']}.png").exists()]
    skipped = len(proteins) - len(to_do)

    print(f"\n── FULL RUN ({source_cfg['label']}): {len(to_do)} to render"
          f"  ({skipped} already on disk, skipped) ─────")
    if not to_do:
        print("  Nothing to do.")
        return

    queue = asyncio.Queue()
    for p in to_do:
        await queue.put(p)

    results = []
    async with async_playwright() as pw:
        # WebGL (required by Mol*) is unavailable in headless Chromium on macOS.
        # We use visible windows positioned off-screen so they don't interrupt
        # normal work. The rendering is otherwise identical to the pilot.
        browser = await pw.chromium.launch(
            headless=False,
            args=["--window-position=-10000,-10000"],
        )
        await asyncio.gather(
            *[_worker(browser, queue, results, source_cfg, cif_urls) for _ in range(workers)]
        )
        await browser.close()

    ok   = [r for r in results if r[1]]
    fail = [r for r in results if not r[1]]
    print(f"\n  Done: {len(ok)} rendered  {len(fail)} failed")

    if fail:
        fail_file = Path(__file__).parent / "thumbnail_failures.txt"
        fail_file.write_text("\n".join(p["uniprot_id"] for p, _, _ in fail) + "\n")
        print(f"\n  Failed UniProt IDs → {fail_file.name}")
        for p, _, err in fail[:20]:
            print(f"    {p['locus_tag']:12s}  {err}")
        if len(fail) > 20:
            print(f"    ... and {len(fail) - 20} more")

    if ok:
        print("\n  Next steps:")
        print("  1. Inspect a sample of images in AFmodels/")
        print("  2. git add AFmodels/ && git commit -m 'feat: add AF2 structure thumbnails'")
        print("  3. git push")
        print("  4. python3 update_thumbnail_db.py --dry-run")
        print("  5. python3 update_thumbnail_db.py")

# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Generate structure thumbnails for ChlamAtlas proteins via local Mol* viewer."
    )
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--pilot", action="store_true",
                      help="Render a small batch with visible browser (POC verification)")
    mode.add_argument("--full",  action="store_true",
                      help="Render all missing thumbnails headless + parallel")
    ap.add_argument("--source",  default=DEFAULT_SOURCE, choices=list(SOURCE_CONFIGS),
                    help=f"Structure source to render (default: {DEFAULT_SOURCE})")
    ap.add_argument("--strain",  default=None, choices=list(STRAIN_FOLDER.values()),
                    help="Restrict to one strain: L2, DUW3, or CM")
    ap.add_argument("--limit",   type=int, default=None,
                    help="Cap number of proteins to render (default: 5 for --pilot, unlimited for --full)")
    ap.add_argument("--workers", type=int, default=4,
                    help="Parallel browser contexts for --full (default: 4)")
    args = ap.parse_args()

    cfg   = SOURCE_CONFIGS[args.source]
    limit = args.limit if args.limit is not None else (5 if args.pilot else None)

    print(f"Source: {cfg['label']}  (af_version={cfg['af_version']})")
    if args.strain:
        print(f"Strain: {args.strain}")
    if limit:
        print(f"Limit:  {limit}")

    print("Fetching proteins with missing thumbnails from Supabase...")
    proteins = fetch_missing(cfg["af_version"], limit=limit, strain=args.strain)

    if not proteins:
        print("No proteins found needing thumbnails.")
        sys.exit(0)

    print(f"Found {len(proteins)} protein(s) to process.")

    # Start local viewer server if this source needs it
    server = None
    if cfg.get("use_local_server"):
        server = start_local_server()

    # Prefetch CIF URLs from EBI API
    cif_urls = asyncio.run(prefetch_cif_urls(proteins))

    try:
        if args.pilot:
            asyncio.run(run_pilot(proteins, cfg, cif_urls))
        else:
            asyncio.run(run_full(proteins, cfg, cif_urls, workers=args.workers))
    finally:
        if server:
            server.shutdown()


if __name__ == "__main__":
    main()
