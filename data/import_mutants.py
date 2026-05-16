#!/usr/bin/env python3
"""
Import mutants from CSV files into Supabase.

Sources:
  - ChlamDB - Mutants.csv     (primary: ~420 records, includes pipeline dates)
  - ChlamDB - Mutants_LR.csv  (LR KO mutants, one row per gene per mutant)

Run from repo root:
  python3 data/import_mutants.py [--dry-run]
"""

import csv
import json
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime
from collections import defaultdict

# ─── Config ───────────────────────────────────────────────

SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co'
SERVICE_KEY  = os.environ.get('SUPABASE_SERVICE_KEY', '')

if not SERVICE_KEY:
    # Try loading from .env
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith('SUPABASE_SERVICE_KEY='):
                    SERVICE_KEY = line.strip().split('=', 1)[1]

if not SERVICE_KEY:
    print('ERROR: SUPABASE_SERVICE_KEY not found in environment or .env')
    sys.exit(1)

DRY_RUN = '--dry-run' in sys.argv

DATA_DIR = os.path.join(os.path.dirname(__file__), 'csv')

HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
}

# ─── Supabase helpers ─────────────────────────────────────

def sb_get(path, params=''):
    url = f'{SUPABASE_URL}/rest/v1/{path}{"?" + params if params else ""}'
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def sb_post(path, data, upsert=False):
    url = f'{SUPABASE_URL}/rest/v1/{path}'
    headers = dict(HEADERS)
    if upsert:
        headers['Prefer'] = 'resolution=merge-duplicates,return=representation'
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f'  HTTP {e.code}: {e.read().decode()}')
        return None

# ─── Fetch reference data ─────────────────────────────────

def fetch_all_genes():
    """Return dict locus_tag → gene_id (fetches all pages)."""
    tags = {}
    page = 0
    page_size = 1000
    while True:
        rows = sb_get('genes', f'select=id,locus_tag&limit={page_size}&offset={page * page_size}')
        for r in rows:
            tags[r['locus_tag']] = r['id']
        if len(rows) < page_size:
            break
        page += 1
    print(f'  Loaded {len(tags)} genes from DB')
    return tags

def fetch_strains():
    rows = sb_get('strains', 'select=id,strain_name,common_name,species')
    return {r['common_name']: r['id'] for r in rows} | \
           {r['strain_name']: r['id'] for r in rows} | \
           {r['species']: r['id'] for r in rows}

def fetch_users():
    rows = sb_get('users', 'select=id,display_name,email')
    return {r['display_name']: r['id'] for r in rows}

# ─── Mapping helpers ──────────────────────────────────────

COLLECTION_MAP = {
    'C. trachomatis': 'CT_L2',
    'Chlamydia trachomatis': 'CT_L2',
    'C. muridarum': 'CM',
    'Chlamydia muridarum': 'CM',
    'Chimeras': 'Chimeras',
    'Lucky 17': 'Lucky17',
}

TYPE_MAP = {
    'Transposon': 'transposon',
    'Transposon mutant': 'transposon',
    'Chimera': 'chimera',
    'Deletion': 'deletion',
    'Knockout mutant': 'deletion',
    'Recombination': 'deletion',
}

STRAIN_COLLECTION_DEFAULTS = {
    'CT_L2': 'CT-L2',
    'CM': 'CM',
    'Chimeras': 'CT-L2',
    'Lucky17': 'CT-L2',
}

def map_collection(raw):
    return COLLECTION_MAP.get(raw.strip(), None)

def map_mutation_type(raw):
    return TYPE_MAP.get(raw.strip(), None)

def map_strain(raw_strain, collection, strains):
    """Resolve strain name to UUID."""
    s = raw_strain.strip()
    # Direct matches
    for key in [s, 'CT-L2' if s in ('L2', 'L2434', 'L2/434') else None,
                'CM' if s == 'CM' else None]:
        if key and key in strains:
            return strains[key]
    # Fall back to collection default
    default_key = STRAIN_COLLECTION_DEFAULTS.get(collection)
    return strains.get(default_key)

def parse_locus_tags(raw):
    """Split comma/space-separated locus tag string into list."""
    if not raw or not raw.strip():
        return []
    # Split on commas or 'and', clean up
    tags = re.split(r'[,;]\s*|\s+and\s+', raw.strip())
    return [t.strip().strip('"') for t in tags if t.strip()]

def resolve_gene_ids(locus_tags, gene_lookup, mutant_id):
    """Convert locus tags to UUIDs. Warn on misses."""
    ids = []
    for tag in locus_tags:
        if not tag:
            continue
        gid = gene_lookup.get(tag)
        if gid:
            ids.append(gid)
        else:
            print(f'    WARN [{mutant_id}] locus tag not found: {tag!r}')
    return ids

def parse_date(raw):
    """Parse M/D/YYYY or MM/DD/YYYY to ISO date string."""
    s = raw.strip()
    if not s:
        return None
    for fmt in ('%m/%d/%Y', '%Y-%m-%d', '%m/%d/%y'):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None

def parse_bool(raw):
    s = raw.strip().lower()
    if s in ('yes', 'true', '1', 'y'):
        return True
    if s in ('no', 'false', '0', 'n', ''):
        return False
    return None

# ─── Create user stubs ────────────────────────────────────

CREATOR_NAMES = ['Bob Suchland', 'Yibing Wang', 'Scott LaBrie', 'Srishti Baid']
# Rough affiliation guesses for notes; not stored in DB field currently
CREATOR_EMAILS = {
    'Bob Suchland':  'suchland@uw.edu',
    'Yibing Wang':   'ywang@uw.edu',
    'Scott LaBrie':  'slabrie@uw.edu',
    'Srishti Baid':  'sbaid@uw.edu',
}

def ensure_users(existing_users):
    """Insert user stubs for creators not yet in DB. Returns updated user map."""
    users = dict(existing_users)
    for name in CREATOR_NAMES:
        if name in users:
            continue
        print(f'  Creating user stub: {name}')
        if not DRY_RUN:
            row = sb_post('users', {
                'display_name': name,
                'email': CREATOR_EMAILS.get(name, ''),
                'role': 'lab_member',
            }, upsert=True)
            if row and isinstance(row, list) and row[0].get('id'):
                users[name] = row[0]['id']
                print(f'    → {row[0]["id"]}')
        else:
            users[name] = f'<dry-run-uuid-{name.replace(" ","_")}>'
    return users

# ─── Import Mutants.csv ───────────────────────────────────

def import_main_csv(gene_lookup, strains, users):
    path = os.path.join(DATA_DIR, 'ChlamDB - Mutants.csv')
    print(f'\n=== Importing {os.path.basename(path)} ===')

    mutants_inserted = 0
    pipeline_inserted = 0
    skipped = 0

    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    for row in rows:
        mid = row.get('MutantID', '').strip()
        if not mid or mid == 'MutantID':
            continue

        # Collection
        collection = map_collection(row.get('Category', ''))
        if not collection:
            print(f'  SKIP [{mid}] unknown category: {row.get("Category")!r}')
            skipped += 1
            continue

        # Strain
        strain_id = map_strain(row.get('Strain', ''), collection, strains)
        if not strain_id:
            print(f'  WARN [{mid}] could not resolve strain, defaulting to CT-L2')
            strain_id = strains.get('CT-L2')

        # Mutation type
        raw_type = row.get('Type', '').strip()
        mutation_type = map_mutation_type(raw_type)
        if not mutation_type:
            print(f'  WARN [{mid}] unknown type {raw_type!r}, skipping type')

        # Target genes
        raw_genes = row.get('TargetGene(s)', '')
        locus_tags = parse_locus_tags(raw_genes)
        target_gene_ids = resolve_gene_ids(locus_tags, gene_lookup, mid)

        # Creator
        creator_name = row.get('Creator', '').strip()
        creator_id = users.get(creator_name)

        # Markers
        raw_markers = row.get('SelectionMarkers', '').strip()
        markers = [m.strip() for m in raw_markers.split() if m.strip()] if raw_markers else []

        # Published
        is_published = parse_bool(row.get('Public', ''))
        if is_published is None:
            is_published = False

        mutant_record = {
            'mutant_id':            mid,
            'name':                 row.get('MutantName', '').strip() or None,
            'collection':           collection,
            'background_strain_id': strain_id,
            'target_gene_ids':      target_gene_ids if target_gene_ids else None,
            'mutation_type':        mutation_type,
            'plasmid_used':         row.get('Plasmid Used', '').strip() or None,
            'marker':               markers if markers else None,
            'creator':              creator_id,
            'is_published':         is_published,
            'notes':                row.get('Notes', '').strip() or None,
        }

        print(f'  [{mid}] {row.get("MutantName","")[:40]} | {collection} | {mutation_type} | genes:{len(target_gene_ids)}')

        if not DRY_RUN:
            result = sb_post('mutants', mutant_record, upsert=True)
            if not result:
                print(f'    ERROR inserting {mid}')
                continue
            inserted_id = result[0]['id'] if isinstance(result, list) else result.get('id')
        else:
            inserted_id = f'<dry-run-{mid}>'

        mutants_inserted += 1

        # Pipeline record
        transformed   = parse_date(row.get('Transformation_Complete', ''))
        cloned        = parse_date(row.get('Cloning_Complete', ''))
        genotyped     = parse_date(row.get('Genotyping_Complete', ''))
        in_vitro      = parse_date(row.get('InVitro_Test_Complete', ''))
        in_vivo       = parse_date(row.get('InVivo_Test_Complete', ''))
        sequenced_val = parse_bool(row.get('Sequenced?', ''))
        genotyping_m  = row.get('SequencingType', '').strip() or None
        is_archived   = parse_bool(row.get('Archived', ''))

        has_pipeline = any([transformed, cloned, genotyped, in_vitro, in_vivo, sequenced_val])

        if has_pipeline:
            pipeline_record = {
                'mutant_id':        inserted_id,
                'status':           'archived' if is_archived else 'active',
                'transformed_date': transformed,
                'plaque_cloned_date': cloned,
                'genotyped_date':   genotyped,
                'in_vitro_date':    in_vitro,
                'in_vivo_date':     in_vivo,
                'sequenced':        sequenced_val or False,
                'genotyping_method': genotyping_m,
            }
            if not DRY_RUN:
                sb_post('mutant_pipeline', pipeline_record)
            pipeline_inserted += 1

    print(f'\n  Mutants: {mutants_inserted} inserted, {skipped} skipped')
    print(f'  Pipeline records: {pipeline_inserted}')

# ─── Import Mutants_LR.csv ────────────────────────────────

def import_lr_csv(gene_lookup, strains, users):
    path = os.path.join(DATA_DIR, 'ChlamDB - Mutants_LR.csv')
    print(f'\n=== Importing {os.path.basename(path)} ===')

    # Group rows by Mutant ID (one row per gene per mutant)
    grouped = defaultdict(list)
    organism_map = {}

    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        header = None
        for row in reader:
            # Skip title/sub-header rows
            if not row or not row[0].strip() or row[0].strip().startswith(','):
                continue
            if row[0].strip() in ('Mutant ID', 'MutantID', ''):
                header = row
                continue
            if header is None:
                continue
            mid = row[0].strip()
            if not mid:
                continue
            organism = row[1].strip() if len(row) > 1 else ''
            locus    = row[2].strip() if len(row) > 2 else ''
            if mid not in organism_map:
                organism_map[mid] = organism
            if locus:
                grouped[mid].append(locus)

    mutants_inserted = 0
    for mid, locus_tags in grouped.items():
        organism = organism_map.get(mid, '')

        # Determine collection/strain
        if 'muridarum' in organism.lower() or mid.startswith('CM'):
            collection = 'CM'
            strain_id = strains.get('CM')
        else:
            collection = 'CT_L2'
            strain_id = strains.get('CT-L2')

        target_gene_ids = resolve_gene_ids(locus_tags, gene_lookup, mid)

        mutant_record = {
            'mutant_id':            mid,
            'name':                 mid,  # name same as ID for LR mutants
            'collection':           collection,
            'background_strain_id': strain_id,
            'target_gene_ids':      target_gene_ids if target_gene_ids else None,
            'mutation_type':        'deletion',
            'mutation_method':      'lambda_red',
            'is_published':         False,
        }

        print(f'  [{mid}] genes:{len(target_gene_ids)} ({", ".join(locus_tags)})')

        if not DRY_RUN:
            result = sb_post('mutants', mutant_record, upsert=True)
            if not result:
                print(f'    ERROR inserting {mid}')
                continue

        mutants_inserted += 1

    print(f'\n  LR mutants: {mutants_inserted} inserted')

# ─── Main ─────────────────────────────────────────────────

def main():
    print('ChlamAtlas — Mutant Import')
    if DRY_RUN:
        print('DRY RUN — no data will be written\n')

    print('Fetching reference data...')
    gene_lookup = fetch_all_genes()
    strains     = fetch_strains()
    users       = fetch_users()
    print(f'  Strains: {list(strains.keys())[:6]}')
    print(f'  Users:   {list(users.keys())}')

    print('\nEnsuring creator user stubs...')
    users = ensure_users(users)

    import_main_csv(gene_lookup, strains, users)
    import_lr_csv(gene_lookup, strains, users)

    print('\nDone.')

if __name__ == '__main__':
    main()
