#!/usr/bin/env python3
"""Backfill creator_name on existing mutant records from CSV."""

import csv, json, os, urllib.request, urllib.error

SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co'
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
SERVICE_KEY = ''
with open(env_path) as f:
    for line in f:
        if line.startswith('SUPABASE_SERVICE_KEY='):
            SERVICE_KEY = line.strip().split('=', 1)[1]

HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

DATA_DIR = os.path.join(os.path.dirname(__file__), 'csv')

def patch(path, params, data):
    url = f'{SUPABASE_URL}/rest/v1/{path}?{params}'
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=HEADERS, method='PATCH')
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f'  HTTP {e.code}: {e.read().decode()[:120]}')
        return e.code

updated = 0
with open(os.path.join(DATA_DIR, 'ChlamDB - Mutants.csv'), newline='', encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        mid = row.get('MutantID', '').strip()
        creator = row.get('Creator', '').strip()
        if not mid or not creator:
            continue
        status = patch('mutants', f'mutant_id=eq.{urllib.parse.quote(mid)}', {'creator_name': creator})
        if status in (200, 204):
            updated += 1

import urllib.parse
print(f'Updated {updated} mutants with creator_name')
