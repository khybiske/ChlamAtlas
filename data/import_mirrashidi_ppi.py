#!/usr/bin/env python3
"""
Import Mirrashidi et al. 2015 AP-MS data (High.Confidence.PPIs sheet)
into protein_interactions table.

Usage:
  python3 data/import_mirrashidi_ppi.py [--dry-run]

Requires: pip install openpyxl
Source:   /Users/khybiske/Library/CloudStorage/Dropbox/Kevin/Tim db project/mason/Mirrashidi S1.xlsx
"""

import json, os, sys, time, urllib.request, urllib.error
import openpyxl

XLSX_PATH = os.path.expanduser(
    '~/Library/CloudStorage/Dropbox/Kevin/Tim db project/mason/Mirrashidi S1.xlsx'
)
LOOKUP_PATH = os.path.join(os.path.dirname(__file__), 'mirrashidi_bait_lookup.json')
SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co'
SERVICE_KEY  = ''
DRY_RUN      = '--dry-run' in sys.argv

env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
with open(env_path) as f:
    for line in f:
        if line.startswith('SUPABASE_SERVICE_KEY='):
            SERVICE_KEY = line.strip().split('=', 1)[1].strip()
if not SERVICE_KEY:
    print('ERROR: SUPABASE_SERVICE_KEY not found in .env'); sys.exit(1)

HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

def sb_get(path):
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/{path}',
                                  headers={**HEADERS, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def sb_post(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/{path}',
                                  data=data, headers=HEADERS, method='POST')
    with urllib.request.urlopen(req) as r:
        return r.status

# Load bait lookup
with open(LOOKUP_PATH) as f:
    BAIT_LOOKUP = json.load(f)

# Load locus_tag → gene_id map from DB (CT-D only for Mirrashidi)
# Paginate to handle >1000 rows (Supabase default max is 1000)
print('Fetching CT-D gene IDs...')
GENE_BY_LOCUS = {}
offset = 0
PAGE = 1000
while True:
    page = sb_get(f'genes?select=id,locus_tag,strain_id&locus_tag=like.CT*&limit={PAGE}&offset={offset}')
    for g in page:
        GENE_BY_LOCUS[g['locus_tag']] = g['id']
    if len(page) < PAGE:
        break
    offset += PAGE
print(f'  Loaded {len(GENE_BY_LOCUS)} CT-D genes')

# Load xlsx
wb = openpyxl.load_workbook(XLSX_PATH, read_only=True)
ws = wb['High.Confidence.PPIs']
rows = list(ws.rows)

records = []
skipped_baits = set()

for row in rows[1:]:  # skip header
    bait_raw   = row[0].value
    prey_up    = row[1].value   # UniProt ID
    mist_score = row[2].value   # MIST score (float 0-1)
    prey_entry = row[7].value   # e.g. KTN1_HUMAN
    prey_desc  = row[8].value   # full protein name
    prey_genes = row[9].value   # gene symbols space-separated

    if not bait_raw or not prey_up:
        continue

    bait_key = bait_raw.strip().upper()
    if bait_key not in BAIT_LOOKUP:
        skipped_baits.add(bait_key)
        continue

    lookup      = BAIT_LOOKUP[bait_key]
    locus_tag   = lookup['locus_tag']
    strain_spec = lookup['strain_specific']

    gene_id = GENE_BY_LOCUS.get(locus_tag)
    if not gene_id:
        print(f'  WARNING: locus_tag {locus_tag} not found in DB (bait: {bait_raw})')
        continue

    # Use first gene symbol as partner_name; fall back to UniProt entry name
    # prey_genes can occasionally be a datetime object (Excel date cell) — guard against it
    if prey_genes and isinstance(prey_genes, str):
        partner_name = prey_genes.split()[0]
    else:
        partner_name = prey_entry
    partner_desc = (str(prey_desc) if prey_desc else '')[:200]

    records.append({
        'gene_id':             gene_id,
        'partner_external_id': prey_up,
        'partner_name':        partner_name,
        'partner_description': partner_desc,
        'partner_organism':    'human',
        'evidence_tier':       'experimental',
        'method':              'ap_ms',
        'strain_specific':     strain_spec,
        'confidence_score':    float(mist_score) if mist_score is not None else None,
        'study_reference':     'Mirrashidi et al. 2015',
        'pubmed_id':           '26118995',
    })

print(f'\nRecords to insert: {len(records)}')
if skipped_baits:
    print(f'Skipped baits (not in lookup): {sorted(skipped_baits)}')

if DRY_RUN:
    print('\n--dry-run: skipping insert')
    print('Sample record:')
    print(json.dumps(records[0], indent=2) if records else '(none)')
    sys.exit(0)

# Insert in batches of 100
BATCH = 100
inserted = 0
for i in range(0, len(records), BATCH):
    batch = records[i:i+BATCH]
    status = sb_post('protein_interactions', batch)
    inserted += len(batch)
    print(f'  Inserted {inserted}/{len(records)}...')
    time.sleep(0.2)

print(f'\nDone. {inserted} rows inserted.')
