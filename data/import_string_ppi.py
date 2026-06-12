#!/usr/bin/env python3
"""
Import STRING v12 physical network (experimental score >= 700) for C. trachomatis D
into protein_interactions table as inferred CT-CT interactions.

Usage:
  python3 data/import_string_ppi.py [--dry-run]

Source files (in data/):
  string_ct_physical_links_v12.txt.gz   -- columns: protein1 protein2 experimental database textmining combined_score
  string_ct_protein_info_v12.txt.gz     -- columns: #string_protein_id preferred_name protein_size annotation
"""

import gzip, json, os, sys, time, urllib.request, urllib.error

SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co'
SERVICE_KEY  = ''
DRY_RUN      = '--dry-run' in sys.argv
EXP_THRESH   = 700
DATA_DIR     = os.path.dirname(os.path.abspath(__file__))

# Load service key from .env
env_path = os.path.join(DATA_DIR, '..', '.env')
with open(env_path) as f:
    for line in f:
        if line.startswith('SUPABASE_SERVICE_KEY='):
            SERVICE_KEY = line.strip().split('=', 1)[1].strip()
if not SERVICE_KEY:
    print('ERROR: SUPABASE_SERVICE_KEY not found in .env')
    sys.exit(1)

HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}


def sb_get(path):
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{path}',
        headers={**HEADERS, 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def sb_post(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{path}',
        data=data, headers=HEADERS, method='POST'
    )
    with urllib.request.urlopen(req) as r:
        return r.status


# ---------------------------------------------------------------------------
# Step 1: Load STRING protein info
# ---------------------------------------------------------------------------
print('Loading STRING protein info...')
info = {}  # string_id (e.g. "CT_002") -> (preferred_name, annotation)
info_file = os.path.join(DATA_DIR, 'string_ct_protein_info_v12.txt.gz')
with gzip.open(info_file, 'rt') as f:
    for line in f:
        if line.startswith('#'):
            continue
        parts = line.strip().split('\t')
        string_id = parts[0].replace('272561.', '')  # e.g. CT_002
        name      = parts[1]                          # e.g. gatC
        annot     = parts[3][:120] if len(parts) > 3 else ''
        info[string_id] = (name, annot)
print(f'  Loaded info for {len(info)} STRING proteins')


# ---------------------------------------------------------------------------
# Step 2: Fetch CT-D gene IDs from DB (paginated)
# ---------------------------------------------------------------------------
print('Fetching CT-D gene IDs from DB...')
genes_raw = []
offset = 0
while True:
    batch = sb_get(f'genes?select=id,locus_tag&locus_tag=like.CT*&limit=1000&offset={offset}')
    if not batch:
        break
    genes_raw.extend(batch)
    if len(batch) < 1000:
        break
    offset += 1000


def normalize_ct(s):
    """Normalize locus tag to match DB format.

    STRING format: CT_005  -> strip underscore -> CT005 -> int -> CT5
    DB format:     CT5, CT119, CT1234 (no leading zeros)
    """
    s = s.replace('CT_', 'CT')
    prefix = 'CT'
    num = s[len(prefix):]
    return prefix + str(int(num)) if num.isdigit() else s


GENE_BY_NORM = {}
for g in genes_raw:
    norm = normalize_ct(g['locus_tag'])
    GENE_BY_NORM[norm] = g['id']

STRING_TO_GENE = {}  # string_id (e.g. "CT_005") -> gene_id
for string_id in info:
    norm = normalize_ct(string_id)
    if norm in GENE_BY_NORM:
        STRING_TO_GENE[string_id] = GENE_BY_NORM[norm]

print(f'  Loaded {len(genes_raw)} CT-D genes, mapped {len(STRING_TO_GENE)}/{len(info)} STRING proteins')


# ---------------------------------------------------------------------------
# Step 3: Load physical links, filter by experimental score
# ---------------------------------------------------------------------------
print(f'Loading STRING links (experimental >= {EXP_THRESH})...')
links = []
seen_pairs = set()
links_file = os.path.join(DATA_DIR, 'string_ct_physical_links_v12.txt.gz')
with gzip.open(links_file, 'rt') as f:
    next(f)  # skip header
    for line in f:
        parts = line.strip().split()
        p1  = parts[0].replace('272561.', '')
        p2  = parts[1].replace('272561.', '')
        exp = int(parts[2])   # column index 2 = experimental score
        if exp < EXP_THRESH:
            continue
        pair_key = tuple(sorted([p1, p2]))
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)
        links.append((p1, p2, exp))

print(f'  {len(links)} unique pairs above threshold')


# ---------------------------------------------------------------------------
# Step 4: Build insert records (both directions per pair)
# ---------------------------------------------------------------------------
records = []
unmapped = set()
for p1, p2, exp in links:
    g1 = STRING_TO_GENE.get(p1)
    g2 = STRING_TO_GENE.get(p2)
    if not g1:
        unmapped.add(p1)
        continue
    if not g2:
        unmapped.add(p2)
        continue

    name1, desc1 = info.get(p1, (p1, ''))
    name2, desc2 = info.get(p2, (p2, ''))

    # A -> B
    records.append({
        'gene_id':             g1,
        'partner_ct_gene_id':  g2,
        'partner_name':        name2 or p2,
        'partner_description': desc2,
        'partner_organism':    'ct',
        'evidence_tier':       'inferred',
        'method':              'string',
        'strain_specific':     False,
        'confidence_score':    float(exp),
        'study_reference':     'STRING v12',
    })
    # B -> A
    records.append({
        'gene_id':             g2,
        'partner_ct_gene_id':  g1,
        'partner_name':        name1 or p1,
        'partner_description': desc1,
        'partner_organism':    'ct',
        'evidence_tier':       'inferred',
        'method':              'string',
        'strain_specific':     False,
        'confidence_score':    float(exp),
        'study_reference':     'STRING v12',
    })

print(f'Records to insert: {len(records)} ({len(records) // 2} unique pairs x 2 directions)')
if unmapped:
    print(f'Unmapped STRING proteins ({len(unmapped)}): {sorted(unmapped)[:10]}{"..." if len(unmapped) > 10 else ""}')

if DRY_RUN:
    print('\n--dry-run: skipping insert')
    if records:
        print('Sample record:', json.dumps(records[0], indent=2))
    sys.exit(0)


# ---------------------------------------------------------------------------
# Step 5: Batch insert
# ---------------------------------------------------------------------------
BATCH = 100
inserted = 0
for i in range(0, len(records), BATCH):
    batch = records[i:i + BATCH]
    sb_post('protein_interactions', batch)
    inserted += len(batch)
    if inserted % 500 == 0 or inserted == len(records):
        print(f'  Inserted {inserted}/{len(records)}...')
    time.sleep(0.2)

print(f'\nDone. {inserted} rows inserted.')
