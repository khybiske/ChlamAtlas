#!/usr/bin/env python3
"""
Fetch genomic coordinates (start_bp, end_bp, strand) from NCBI GFF3
and patch the Supabase genes table.

Handles four locus tag families in the ChlamAtlas DB:
  CTL####  →  C. trachomatis L2/434 chromosome  (AM884176)
  pL2-##   →  C. trachomatis L2/434 plasmid      (AJ086875)
  CT###    →  C. trachomatis D/UW-3 chromosome   (NC_000117)
  TC####   →  C. muridarum Nigg chromosome       (NC_002620 / AE002160)

Usage:
  python3 data/import_gene_coords.py [--dry-run]
"""

import json, os, re, sys, time, urllib.request, urllib.error, urllib.parse
from collections import defaultdict

# ─── Config ───────────────────────────────────────────────────────────────────

SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co'
SERVICE_KEY  = ''
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
with open(env_path) as f:
    for line in f:
        if line.startswith('SUPABASE_SERVICE_KEY='):
            SERVICE_KEY = line.strip().split('=', 1)[1].strip()

if not SERVICE_KEY:
    print('ERROR: SUPABASE_SERVICE_KEY not found in .env')
    sys.exit(1)

DRY_RUN = '--dry-run' in sys.argv

HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

NCBI_EMAIL = 'khybiske@uw.edu'   # polite NCBI API usage

# ─── NCBI genome accessions to try, in priority order ─────────────────────────
# Each entry: (accession, description)
# We try each and measure match rate vs DB; highest match wins.

GENOME_CANDIDATES = {
    'CTL': [
        ('AM884176', 'C. trachomatis L2/434 chromosome (Thomson 2008)'),
    ],
    'pL2': [
        ('AM886278', 'C. trachomatis L2/434 plasmid pL2 (Thomson 2008 companion)'),
    ],
    'CT': [
        ('NC_000117', 'C. trachomatis D/UW-3 chromosome (Stephens 1998 RefSeq)'),
    ],
    'TC': [
        ('NC_002620', 'C. muridarum Nigg chromosome (Stephens 2000 RefSeq)'),
        ('AE002160',  'C. muridarum Nigg chromosome (original GenBank)'),
    ],
}

# ─── Locus tag normalization ───────────────────────────────────────────────────
# NCBI GFF3 locus tags often differ slightly from what was imported into our DB.

def normalize_ncbi_locus(tag):
    """Map NCBI GFF3 locus tag formats to our DB format."""
    # CT_001 → CT001  (D/UW-3: NCBI uses underscore, our DB doesn't)
    m = re.match(r'^CT_0*(\d+)$', tag)
    if m: return f'CT{m.group(1).zfill(3)}'

    # TC_0001 → TC0001  (muridarum old format with underscore)
    m = re.match(r'^TC_0*(\d+)$', tag)
    if m: return f'TC{m.group(1).zfill(4)}'

    # TC_RS00005 → skip (RefSeq new IDs that don't map to our old locus tags)
    if re.match(r'^TC_RS\d+$', tag):
        return None

    # CT_RS... → skip
    if re.match(r'^CT_RS\d+$', tag):
        return None

    return tag   # CTL0001, pL2-01 already match

# ─── Supabase helpers ─────────────────────────────────────────────────────────

def sb_get_locus_tags():
    """Fetch all locus_tags from the genes table (paginated)."""
    tags = set()
    offset = 0
    page_size = 1000
    while True:
        url = (f'{SUPABASE_URL}/rest/v1/genes'
               f'?select=locus_tag&limit={page_size}&offset={offset}')
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req) as r:
            rows = json.loads(r.read())
        for row in rows:
            tags.add(row['locus_tag'])
        if len(rows) < page_size:
            break
        offset += page_size
    return tags

def sb_patch(locus_tag, start_bp, end_bp, strand):
    url = (f'{SUPABASE_URL}/rest/v1/genes'
           f'?locus_tag=eq.{urllib.parse.quote(locus_tag)}')
    body = json.dumps({'start_bp': start_bp, 'end_bp': end_bp, 'strand': strand}).encode()
    req = urllib.request.Request(url, data=body, headers=HEADERS, method='PATCH')
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f'  HTTP {e.code} patching {locus_tag}: {e.read().decode()[:100]}')
        return e.code

# ─── NCBI GFF3 fetch and parse ────────────────────────────────────────────────

def fetch_gff3(accession, retries=3):
    url = (f'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi'
           f'?db=nuccore&id={accession}&rettype=gff3&retmode=text'
           f'&email={NCBI_EMAIL}&tool=ChlamAtlas')
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'ChlamAtlas/1.0'})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read().decode('utf-8', errors='replace')
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(5)
            else:
                raise

def parse_gff3(text):
    """
    Parse GFF3 and return dict: normalized_locus_tag → (start_bp, end_bp, strand).
    Uses 'gene' features preferentially; falls back to 'CDS'.
    Also checks old_locus_tag attribute as a fallback key.
    Coordinates converted to 1-based inclusive (as stored in GenBank).
    """
    by_locus = {}    # primary locus_tag key
    by_old   = {}    # old_locus_tag fallback

    for line in text.splitlines():
        if line.startswith('#') or not line.strip():
            continue
        parts = line.split('\t')
        if len(parts) < 9:
            continue
        feat_type = parts[2]
        if feat_type not in ('gene', 'CDS'):
            continue

        start  = int(parts[3])   # already 1-based in GFF3
        end    = int(parts[4])
        strand = parts[6]        # '+' or '-'
        attrs  = parts[8]

        # Primary locus_tag
        m = re.search(r'(?:^|;)locus_tag=([^;]+)', attrs)
        if m:
            raw = m.group(1).strip()
            norm = normalize_ncbi_locus(raw)
            if norm and norm not in by_locus:
                by_locus[norm] = (start, end, strand)

        # old_locus_tag — used for RefSeq-renamed genes (TC_RS... → TC0001)
        m2 = re.search(r'old_locus_tag=([^;]+)', attrs)
        if m2:
            for old_raw in m2.group(1).strip().split(','):
                old_norm = normalize_ncbi_locus(old_raw.strip())
                if old_norm and old_norm not in by_old:
                    by_old[old_norm] = (start, end, strand)

    # Merge: by_locus takes priority, old_locus fills in gaps
    merged = dict(by_old)
    merged.update(by_locus)
    return merged

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print('ChlamAtlas — Gene Coordinate Import from NCBI')
    if DRY_RUN:
        print('DRY RUN — no data will be written\n')

    print('\nFetching all locus tags from Supabase...')
    db_tags = sb_get_locus_tags()
    print(f'  {len(db_tags)} genes in DB')

    # Group DB tags by prefix family
    db_by_prefix = defaultdict(set)
    for tag in db_tags:
        m = re.match(r'^(CTL|pL2|CT|TC)', tag)
        if m:
            db_by_prefix[m.group(1)].add(tag)
    for prefix, tags in sorted(db_by_prefix.items()):
        print(f'  {prefix}: {len(tags)} genes')

    # For each prefix family, find the best NCBI accession and parse coords
    coord_map = {}   # locus_tag → (start_bp, end_bp, strand)

    for prefix, candidates in GENOME_CANDIDATES.items():
        db_set = db_by_prefix.get(prefix, set())
        if not db_set:
            print(f'\nSkipping {prefix} — no genes in DB')
            continue

        print(f'\n=== {prefix} ({len(db_set)} genes in DB) ===')
        best_accession = None
        best_parsed    = {}
        best_matches   = 0

        for accession, desc in candidates:
            print(f'  Trying {accession} ({desc})...')
            time.sleep(0.4)   # NCBI rate limit
            try:
                gff3   = fetch_gff3(accession)
                parsed = parse_gff3(gff3)
                total  = len(parsed)
                matches = len(db_set & set(parsed.keys()))
                print(f'    Parsed {total} gene features, {matches}/{len(db_set)} match DB locus tags')
                if matches > best_matches:
                    best_matches   = matches
                    best_accession = accession
                    best_parsed    = parsed
            except Exception as e:
                print(f'    ERROR: {e}')

        if not best_parsed:
            print(f'  No usable data for {prefix} — skipping')
            continue

        print(f'\n  Using {best_accession} ({best_matches} matches)')

        # Patch the DB for each matching gene
        updated = 0
        missed  = 0
        for tag in sorted(db_set):
            if tag in best_parsed:
                start, end, strand = best_parsed[tag]
                if DRY_RUN:
                    print(f'    [DRY] {tag}: {start}..{end} {strand}')
                    updated += 1
                else:
                    status = sb_patch(tag, start, end, strand)
                    if status in (200, 204):
                        updated += 1
                    time.sleep(0.03)
            else:
                missed += 1

        print(f'  Updated: {updated} | No match: {missed}')
        coord_map.update({t: best_parsed[t] for t in db_set if t in best_parsed})

    print(f'\nDone. Total genes with coordinates: {len(coord_map)}')


if __name__ == '__main__':
    main()
