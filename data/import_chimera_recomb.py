#!/usr/bin/env python3
"""
Backfill recombination_start, recombination_end, ortholog_span_cm
for chimera mutants from the source CSV.

Run from repo root:
  python3 data/import_chimera_recomb.py [--dry-run]
"""

import csv
import json
import os
import sys
import urllib.request
import urllib.error

SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co'
SERVICE_KEY  = os.environ.get('SUPABASE_SERVICE_KEY', '')

if not SERVICE_KEY:
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith('SUPABASE_SERVICE_KEY='):
                    SERVICE_KEY = line.strip().split('=', 1)[1]

if not SERVICE_KEY:
    print('ERROR: SUPABASE_SERVICE_KEY not found in environment or .env')
    sys.exit(1)

DRY_RUN  = '--dry-run' in sys.argv
DATA_DIR = os.path.join(os.path.dirname(__file__), 'csv')

HEADERS = {
    'apikey':        SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal',
}


def sb_get(path, params=''):
    url = f'{SUPABASE_URL}/rest/v1/{path}{"?" + params if params else ""}'
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def sb_patch(path, filters, data):
    url = f'{SUPABASE_URL}/rest/v1/{path}?{filters}'
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=HEADERS, method='PATCH')
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f'  HTTP {e.code}: {e.read().decode()}')
        return None


def fetch_chimera_ids():
    """Return dict mutant_id (text) -> UUID for all chimera mutation_type rows."""
    rows = sb_get('mutants', 'select=id,mutant_id&mutation_type=eq.chimera&limit=2000')
    return {r['mutant_id']: r['id'] for r in rows}


def main():
    print(f'Mode: {"DRY RUN" if DRY_RUN else "LIVE"}')

    print('Fetching chimera mutant IDs from DB...')
    chimera_map = fetch_chimera_ids()
    print(f'  Found {len(chimera_map)} chimera mutants in DB')

    csv_path = os.path.join(DATA_DIR, 'ChlamDB - Mutants.csv')
    updated = skipped = not_found = 0

    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            mutant_id = row.get('MutantID', '').strip()
            start     = row.get('RecombinedStartGene', '').strip()
            end       = row.get('RecombinedEndGene',   '').strip()
            span      = row.get('OrthologSpan_CM',     '').strip()

            # Only process rows that have recombination data
            if not start and not end:
                continue

            uuid = chimera_map.get(mutant_id)
            if not uuid:
                print(f'  NOT FOUND in DB: {mutant_id}')
                not_found += 1
                continue

            payload = {}
            if start: payload['recombination_start'] = start
            if end:   payload['recombination_end']   = end
            if span:  payload['ortholog_span_cm']    = span

            print(f'  {"[DRY]" if DRY_RUN else "PATCH"} {mutant_id}: {start} -> {end}  CM: {span or "-"}')

            if not DRY_RUN:
                status = sb_patch('mutants', f'id=eq.{uuid}', payload)
                if status:
                    updated += 1
                else:
                    skipped += 1
            else:
                updated += 1

    print(f'\nDone. updated={updated}  skipped={skipped}  not_found={not_found}')


if __name__ == '__main__':
    main()
