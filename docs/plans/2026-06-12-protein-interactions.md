# Protein Interactions Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete PPI module: DB table, three import scripts (Mirrashidi AP-MS, STRING, literature seed), and the accordion UI in the gene detail panel.

**Architecture:** A single `protein_interactions` Supabase table holds all PPI data. Import scripts run once to populate it. At runtime, `loadDetailAsync()` fires two Supabase queries (direct rows + ortholog-propagated strain-agnostic rows) and passes merged results to `renderDetailInteractions()`, which replaces the existing "Coming soon" placeholder with a collapsible accordion.

**Tech Stack:** Python 3 + openpyxl + urllib (import scripts, same pattern as existing `data/*.py`); vanilla JS + Supabase JS client (UI, same pattern as `renderDetailMutants`); Supabase SQL Editor for schema and seed.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `data/mirrashidi_bait_lookup.json` | Create | Maps Mirrashidi bait names → `{locus_tag, strain_specific}` |
| `data/import_mirrashidi_ppi.py` | Create | Imports Mirrashidi High.Confidence.PPIs into Supabase |
| `data/import_string_ppi.py` | Create | Imports STRING physical links (exp ≥ 700) into Supabase |
| `data/ppi_seed.sql` | Create | Literature-curated seed interactions (run in SQL Editor) |
| `web/js/views/genomes.js` | Modify | Add `renderDetailInteractions()`, update `loadDetailAsync()` |

---

## Task 1: Create the `protein_interactions` table

**Files:**
- Run SQL in Supabase SQL Editor (no file to create)

- [ ] **Step 1: Open Supabase SQL Editor**

Navigate to https://supabase.com/dashboard/project/ihobumwetoidqioifknt/sql/new

- [ ] **Step 2: Run the table creation SQL**

```sql
create table protein_interactions (
  id                  uuid primary key default gen_random_uuid(),
  gene_id             uuid references genes(id) not null,
  partner_ct_gene_id  uuid references genes(id),
  partner_external_id text,
  partner_name        text not null,
  partner_description text,
  partner_organism    text not null check (partner_organism in ('human', 'ct')),
  evidence_tier       text not null check (evidence_tier in ('experimental', 'inferred')),
  method              text not null check (method in ('ap_ms', 'bac2h', 'literature', 'string')),
  strain_specific     boolean not null default false,
  confidence_score    numeric,
  study_reference     text,
  pubmed_id           text,
  notes               text,
  created_at          timestamptz not null default now()
);

create index on protein_interactions(gene_id);
create index on protein_interactions(partner_ct_gene_id);
create index on protein_interactions(evidence_tier);
```

- [ ] **Step 3: Add RLS**

```sql
alter table protein_interactions enable row level security;

-- Public read
create policy "public can read protein_interactions"
  on protein_interactions for select
  using (true);

-- Admin write (matches existing pattern on other tables)
create policy "admin can insert protein_interactions"
  on protein_interactions for insert
  with check (
    exists (
      select 1 from users
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "admin can update protein_interactions"
  on protein_interactions for update
  using (
    exists (
      select 1 from users
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "admin can delete protein_interactions"
  on protein_interactions for delete
  using (
    exists (
      select 1 from users
      where id = auth.uid() and role = 'admin'
    )
  );
```

- [ ] **Step 4: Verify**

```sql
select count(*) from protein_interactions;
-- Expected: 0
```

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "feat(ppi): create protein_interactions table in Supabase"
```

---

## Task 2: Create the Mirrashidi bait lookup

The Mirrashidi bait names use CT-D locus tag conventions. Named Inc proteins (INCA, INCE, etc.) are strain-ambiguous — they get `strain_specific: false`. Baits with explicit CT### locus tags default to CT-D and `strain_specific: true` pending paper supplemental verification.

**Files:**
- Create: `data/mirrashidi_bait_lookup.json`

- [ ] **Step 1: Create the lookup file**

```json
{
  "INCA":               { "locus_tag": "CT119", "strain_specific": false },
  "INCD_CHLTR_95-141_D":{ "locus_tag": "CT115", "strain_specific": true  },
  "INCD_CHLTR_MS":      { "locus_tag": "CT115", "strain_specific": false },
  "INCE_CHLTR_101-132": { "locus_tag": "CT224", "strain_specific": false },
  "INCE_CHLTR_MS":      { "locus_tag": "CT224", "strain_specific": false },
  "INCF_CHLTR_1-26":    { "locus_tag": "CT223", "strain_specific": false },
  "INCF_CHLTR_MS":      { "locus_tag": "CT223", "strain_specific": false },
  "INCG_CHLTR_MS":      { "locus_tag": "CT226", "strain_specific": false },
  "CT005":  { "locus_tag": "CT005", "strain_specific": true },
  "CT006":  { "locus_tag": "CT006", "strain_specific": true },
  "CT036_52-403":  { "locus_tag": "CT036", "strain_specific": true },
  "CT058_57-367":  { "locus_tag": "CT058", "strain_specific": true },
  "CT135_57-360":  { "locus_tag": "CT135", "strain_specific": true },
  "CT164":  { "locus_tag": "CT164", "strain_specific": true },
  "CT192":  { "locus_tag": "CT192", "strain_specific": true },
  "CT195_212-363": { "locus_tag": "CT195", "strain_specific": true },
  "CT222_89-129":  { "locus_tag": "CT222", "strain_specific": true },
  "CT223":  { "locus_tag": "CT223", "strain_specific": true },
  "CT223_84-270":  { "locus_tag": "CT223", "strain_specific": true },
  "CT224":  { "locus_tag": "CT224", "strain_specific": true },
  "CT224_84-147":  { "locus_tag": "CT224", "strain_specific": true },
  "CT226":  { "locus_tag": "CT226", "strain_specific": true },
  "CT227_87-132":  { "locus_tag": "CT227", "strain_specific": true },
  "CT228":  { "locus_tag": "CT228", "strain_specific": true },
  "CT228_88-196":  { "locus_tag": "CT228", "strain_specific": true },
  "CT229":  { "locus_tag": "CT229", "strain_specific": true },
  "CT229_93-215":  { "locus_tag": "CT229", "strain_specific": true },
  "CT249":  { "locus_tag": "CT249", "strain_specific": true },
  "CT324":  { "locus_tag": "CT324", "strain_specific": true },
  "CT324_184-303": { "locus_tag": "CT324", "strain_specific": true },
  "CT357":  { "locus_tag": "CT357", "strain_specific": true },
  "CT383B_156-243":{ "locus_tag": "CT383", "strain_specific": true },
  "CT440":  { "locus_tag": "CT440", "strain_specific": true },
  "CT442_71-150":  { "locus_tag": "CT442", "strain_specific": true },
  "CT449_17-110":  { "locus_tag": "CT449", "strain_specific": true },
  "CT556":  { "locus_tag": "CT556", "strain_specific": true },
  "CT565B_1-144":  { "locus_tag": "CT565", "strain_specific": true },
  "CT618":  { "locus_tag": "CT618", "strain_specific": true },
  "CT618_1-214":   { "locus_tag": "CT618", "strain_specific": true },
  "CT642":  { "locus_tag": "CT642", "strain_specific": true },
  "CT728":  { "locus_tag": "CT728", "strain_specific": true },
  "CT788_26-166":  { "locus_tag": "CT788", "strain_specific": true },
  "CT813":  { "locus_tag": "CT813", "strain_specific": true },
  "CT814":  { "locus_tag": "CT814", "strain_specific": true },
  "CT819":  { "locus_tag": "CT819", "strain_specific": true },
  "CT846":  { "locus_tag": "CT846", "strain_specific": true }
}
```

- [ ] **Step 2: Commit**

```bash
git add data/mirrashidi_bait_lookup.json
git commit -m "feat(ppi): add Mirrashidi bait-to-locus-tag lookup"
```

---

## Task 3: Write and run the Mirrashidi import script

**Files:**
- Create: `data/import_mirrashidi_ppi.py`

- [ ] **Step 1: Write the script**

```python
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
print('Fetching CT-D gene IDs...')
genes_raw = sb_get('genes?select=id,locus_tag,strain_id&locus_tag=like.CT*&limit=2000')
GENE_BY_LOCUS = {g['locus_tag']: g['id'] for g in genes_raw}
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
    partner_name = (prey_genes or '').split()[0] if prey_genes else prey_entry
    partner_desc = (prey_desc or '')[:200]

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
```

- [ ] **Step 2: Dry run to verify mapping**

```bash
cd /Users/khybiske/Developer/web/ChlamAtlas
python3 data/import_mirrashidi_ppi.py --dry-run
```

Expected output:
```
Fetching CT-D gene IDs...
  Loaded NNN CT-D genes
Records to insert: ~354
Skipped baits (not in lookup): []   ← must be empty
Sample record: { ... }
```

If any baits appear in "Skipped", add them to `mirrashidi_bait_lookup.json` before continuing.

- [ ] **Step 3: Run the import**

```bash
python3 data/import_mirrashidi_ppi.py
```

- [ ] **Step 4: Verify in Supabase SQL Editor**

```sql
-- Total rows
select count(*) from protein_interactions;
-- Expected: ~354

-- Check IncE hits (should have ~45 rows)
select count(*) from protein_interactions pi
join genes g on g.id = pi.gene_id
where g.locus_tag = 'CT224';

-- Spot-check: IncE → SNX1 should be present
select pi.partner_name, pi.confidence_score, pi.strain_specific
from protein_interactions pi
join genes g on g.id = pi.gene_id
where g.locus_tag = 'CT224' and pi.partner_name = 'SNX1';
-- Expected: 1 row, confidence_score ~ 0.978, strain_specific = false
```

- [ ] **Step 5: Commit**

```bash
git add data/import_mirrashidi_ppi.py
git commit -m "feat(ppi): add Mirrashidi AP-MS import script"
```

---

## Task 4: Write and run the STRING import script

STRING data is CT-CT only (the downloaded file covers the Ct D genome). All rows get `strain_specific = false` so they surface on CT-L2/CM gene pages via the ortholog join.

**Files:**
- Create: `data/import_string_ppi.py`

- [ ] **Step 1: Copy the STRING files to the data directory so they persist**

```bash
cp /tmp/ct_physical_links.txt.gz /Users/khybiske/Developer/web/ChlamAtlas/data/string_ct_physical_links_v12.txt.gz
cp /tmp/ct_protein_info.txt.gz   /Users/khybiske/Developer/web/ChlamAtlas/data/string_ct_protein_info_v12.txt.gz
```

- [ ] **Step 2: Write the script**

```python
#!/usr/bin/env python3
"""
Import STRING v12 physical network (experimental score ≥ 700) for C. trachomatis D
into protein_interactions table as inferred CT-CT interactions.

Usage:
  python3 data/import_string_ppi.py [--dry-run]

Source files (in data/):
  string_ct_physical_links_v12.txt.gz
  string_ct_protein_info_v12.txt.gz
"""

import gzip, json, os, sys, time, urllib.request, urllib.error

SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co'
SERVICE_KEY  = ''
DRY_RUN      = '--dry-run' in sys.argv
EXP_THRESH   = 700
DATA_DIR     = os.path.dirname(__file__)

env_path = os.path.join(DATA_DIR, '..', '.env')
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

# Load STRING protein info → locus_tag and description
print('Loading STRING protein info...')
info = {}  # string_id (e.g. "CT_002") → (preferred_name, annotation)
with gzip.open(os.path.join(DATA_DIR, 'string_ct_protein_info_v12.txt.gz'), 'rt') as f:
    for line in f:
        if line.startswith('#'): continue
        parts = line.strip().split('\t')
        string_id = parts[0].replace('272561.', '')  # e.g. CT_002
        name      = parts[1]                          # e.g. gatC
        annot     = parts[3][:120] if len(parts) > 3 else ''
        info[string_id] = (name, annot)
print(f'  Loaded info for {len(info)} STRING proteins')

# Load CT-D gene IDs from DB — STRING uses "CT_NNN" format (underscore, zero-padded to 3)
# Our DB uses "CT###" (no underscore, no leading zero beyond what NCBI uses)
# Build mapping: normalize both to compare
print('Fetching CT-D gene IDs from DB...')
genes_raw = sb_get('genes?select=id,locus_tag&locus_tag=like.CT*&limit=2000')
# DB has e.g. "CT005", "CT119". STRING has "CT_005", "CT_119".
# Normalize: strip underscore and leading zeros past 2 chars

def normalize_ct(s):
    """CT_005 → CT005, CT_100 → CT100"""
    s = s.replace('CT_', 'CT')
    # Remove leading zeros from the numeric part
    prefix = 'CT'
    num = s[len(prefix):]
    return prefix + str(int(num)) if num.isdigit() else s

GENE_BY_NORM = {}
for g in genes_raw:
    norm = normalize_ct(g['locus_tag'])
    GENE_BY_NORM[norm] = g['id']

STRING_TO_GENE = {}  # string_id (e.g. "CT_005") → gene_id
for string_id in info:
    norm = normalize_ct(string_id)
    if norm in GENE_BY_NORM:
        STRING_TO_GENE[string_id] = GENE_BY_NORM[norm]

print(f'  Mapped {len(STRING_TO_GENE)}/{len(info)} STRING proteins to DB gene IDs')

# Load physical links, filter by experimental score
print(f'Loading STRING links (exp ≥ {EXP_THRESH})...')
links = []
seen_pairs = set()
with gzip.open(os.path.join(DATA_DIR, 'string_ct_physical_links_v12.txt.gz'), 'rt') as f:
    next(f)  # skip header
    for line in f:
        parts = line.strip().split()
        p1  = parts[0].replace('272561.', '')
        p2  = parts[1].replace('272561.', '')
        exp = int(parts[2])
        combined = int(parts[5])
        if exp < EXP_THRESH:
            continue
        pair_key = tuple(sorted([p1, p2]))
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)
        links.append((p1, p2, exp, combined))

print(f'  {len(links)} unique pairs above threshold')

# Build records — both directions for each pair
records = []
unmapped = set()
for p1, p2, exp, combined in links:
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

    # A → B
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
    # B → A
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

print(f'Records to insert: {len(records)} ({len(records)//2} unique pairs × 2 directions)')
if unmapped:
    print(f'Unmapped STRING proteins ({len(unmapped)}): {sorted(unmapped)[:10]}...')

if DRY_RUN:
    print('\n--dry-run: skipping insert')
    print('Sample record:', json.dumps(records[0], indent=2) if records else '(none)')
    sys.exit(0)

BATCH = 100
inserted = 0
for i in range(0, len(records), BATCH):
    batch = records[i:i+BATCH]
    sb_post('protein_interactions', batch)
    inserted += len(batch)
    print(f'  Inserted {inserted}/{len(records)}...')
    time.sleep(0.2)

print(f'\nDone. {inserted} rows inserted.')
```

- [ ] **Step 3: Dry run**

```bash
python3 data/import_string_ppi.py --dry-run
```

Expected:
```
Loading STRING protein info...
  Loaded 894 STRING proteins
Fetching CT-D gene IDs from DB...
  Mapped NNN/894 STRING proteins to DB gene IDs
Loading STRING links (exp ≥ 700)...
  1767 unique pairs above threshold
Records to insert: ~3534 (1767 unique pairs × 2 directions)
```

- [ ] **Step 4: Run the import**

```bash
python3 data/import_string_ppi.py
```

- [ ] **Step 5: Verify in Supabase SQL Editor**

```sql
-- Total inferred rows
select count(*) from protein_interactions where method = 'string';
-- Expected: ~3534

-- Check a known pair: trpB (CT170) ↔ trpA (CT171), exp=963
select pi.partner_name, pi.confidence_score
from protein_interactions pi
join genes g on g.id = pi.gene_id
where g.locus_tag = 'CT170' and pi.method = 'string'
order by pi.confidence_score desc limit 5;
-- Expected: trpA near the top with score 963
```

- [ ] **Step 6: Commit**

```bash
git add data/import_string_ppi.py data/string_ct_physical_links_v12.txt.gz data/string_ct_protein_info_v12.txt.gz
git commit -m "feat(ppi): add STRING import script and data files"
```

---

## Task 5: Insert literature seed interactions

**Files:**
- Create: `data/ppi_seed.sql`

- [ ] **Step 1: Write the seed SQL**

The seed uses locus_tag lookups so it doesn't hardcode UUIDs. Run in Supabase SQL Editor.

```sql
-- PPI literature seed — well-validated interactions from independent studies
-- Run in Supabase SQL Editor
-- TarP = CT456 in CT-D

do $$
declare
  tarp_d   uuid := (select id from genes where locus_tag = 'CT456' limit 1);
  htra_d   uuid := (select id from genes where locus_tag = 'CT823' limit 1);
  flia_d   uuid := (select id from genes where locus_tag = 'CT080' limit 1);
  rpob_d   uuid := (select id from genes where locus_tag = 'CT429' limit 1);
  lpxd_d   uuid := (select id from genes where locus_tag = 'CT615' limit 1);
  inca_d   uuid := (select id from genes where locus_tag = 'CT119' limit 1);
  ince_d   uuid := (select id from genes where locus_tag = 'CT224' limit 1);
begin

  -- TarP self-interaction (oligomerization)
  insert into protein_interactions
    (gene_id, partner_ct_gene_id, partner_name, partner_description,
     partner_organism, evidence_tier, method, strain_specific,
     study_reference, pubmed_id)
  values
    (tarp_d, tarp_d, 'TarP', 'TarP self-interaction (oligomerization)',
     'ct', 'experimental', 'literature', false,
     'Clifton et al. 2004', '15128720');

  -- TarP → ACTA1 (actin)
  insert into protein_interactions
    (gene_id, partner_external_id, partner_name, partner_description,
     partner_organism, evidence_tier, method, strain_specific,
     study_reference, pubmed_id)
  values
    (tarp_d, 'P60709', 'ACTB', 'Actin — TarP nucleates actin polymerization on entry',
     'human', 'experimental', 'literature', false,
     'Clifton et al. 2004', '15128720');

  -- HtrA → CSN2 (casein beta / COP9 subunit)
  insert into protein_interactions
    (gene_id, partner_external_id, partner_name, partner_description,
     partner_organism, evidence_tier, method, strain_specific,
     study_reference, pubmed_id)
  values
    (htra_d, 'P78344', 'CSN2', 'COP9 signalosome subunit 2',
     'human', 'experimental', 'literature', false,
     'Hale et al. 2009 (IntAct curated)', null);

  -- FliA (σ28) ↔ RpoB (bidirectional)
  insert into protein_interactions
    (gene_id, partner_ct_gene_id, partner_name, partner_description,
     partner_organism, evidence_tier, method, strain_specific,
     study_reference, pubmed_id)
  values
    (flia_d, rpob_d, 'rpoB', 'RNA polymerase β subunit — σ28 binds core RNAP',
     'ct', 'experimental', 'literature', false,
     'IntAct curated (bacterial two-hybrid)', null),
    (rpob_d, flia_d, 'fliA', 'σ28 — binds RNA polymerase β subunit',
     'ct', 'experimental', 'literature', false,
     'IntAct curated (bacterial two-hybrid)', null);

  -- LpxD self-interaction
  insert into protein_interactions
    (gene_id, partner_ct_gene_id, partner_name, partner_description,
     partner_organism, evidence_tier, method, strain_specific,
     study_reference, pubmed_id)
  values
    (lpxd_d, lpxd_d, 'lpxD', 'LpxD self-interaction (LPS biosynthesis enzyme)',
     'ct', 'experimental', 'literature', false,
     'IntAct curated', null);

  -- IncA ↔ IncE (CT-CT, Mirrashidi AP-MS confirmed, also in IntAct)
  insert into protein_interactions
    (gene_id, partner_ct_gene_id, partner_name, partner_description,
     partner_organism, evidence_tier, method, strain_specific,
     study_reference, pubmed_id)
  values
    (inca_d, ince_d, 'IncE', 'IncA–IncE co-IP interaction',
     'ct', 'experimental', 'literature', false,
     'Mirrashidi et al. 2015', '26118995'),
    (ince_d, inca_d, 'IncA', 'IncA–IncE co-IP interaction',
     'ct', 'experimental', 'literature', false,
     'Mirrashidi et al. 2015', '26118995');

  raise notice 'Seed complete.';
end $$;
```

**Note:** Verify that the locus tags for TarP (CT456), HtrA (CT823), FliA (CT080), RpoB (CT429), LpxD (CT615) are correct in the DB before running. Use:
```sql
select locus_tag, gene_name from genes where gene_name ilike '%tarP%' or locus_tag in ('CT456','CT823','CT080','CT429','CT615');
```
Adjust locus tags in the seed SQL as needed.

- [ ] **Step 2: Verify locus tags, adjust if needed, then run the seed SQL in Supabase SQL Editor**

- [ ] **Step 3: Verify**

```sql
select method, count(*) from protein_interactions group by method order by method;
-- Expected: ap_ms ~354, literature ~8, string ~3534
```

- [ ] **Step 4: Commit**

```bash
git add data/ppi_seed.sql
git commit -m "feat(ppi): add literature seed interactions (TarP, HtrA, FliA, LpxD, IncA-IncE)"
```

---

## Task 6: Add `renderDetailInteractions()` to genomes.js

**Files:**
- Modify: `web/js/views/genomes.js`

Add the rendering function after `renderDetailMutants` (around line 1542).

- [ ] **Step 1: Add the render function**

Insert after the closing `}` of `renderDetailMutants` (line ~1541):

```javascript
function renderDetailInteractions(detail, gene, ppiRows) {
  const el = detail.querySelector('#d-interactions');
  if (!el) return;

  if (!ppiRows.length) {
    el.innerHTML = `
      <div style="padding:14px 16px;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#1a6b4a;margin-bottom:6px;">Protein Interactions</div>
        <div style="font-size:10px;color:#bbb;font-style:italic;">No interaction data available</div>
      </div>`;
    return;
  }

  const experimental = ppiRows.filter(r => r.evidence_tier === 'experimental');
  const inferred     = ppiRows.filter(r => r.evidence_tier === 'inferred');

  // Max scores per tier for bar scaling
  const maxExp = Math.max(...experimental.map(r => r.confidence_score ?? 0), 1);
  const maxInf = Math.max(...inferred.map(r => r.confidence_score ?? 0), 1);

  const METHOD_LABEL = { ap_ms: 'AP-MS', bac2h: 'Bac2H', literature: 'Lit', string: 'STRING' };

  function orgTag(row) {
    if (row.partner_organism === 'human') {
      return `<span style="font-size:8px;font-weight:700;color:#d97706;margin-left:3px;">Human</span>`;
    }
    return `<span style="font-size:8px;font-weight:700;color:#60a5fa;margin-left:3px;">CT</span>`;
  }

  function scoreBar(row, maxScore, isInferred) {
    if (row.confidence_score == null) return '';
    const pct = Math.min(row.confidence_score / maxScore, 1);
    const w   = Math.round(10 + pct * 32);  // 10–42px
    const col = isInferred ? '#d1d5db' : '#10b981';
    const val = isInferred
      ? Math.round(row.confidence_score)
      : row.confidence_score.toFixed(2);
    return `<div style="display:flex;align-items:center;gap:3px;margin-top:2px;">
      <div style="width:${w}px;height:3px;border-radius:2px;background:${col};flex-shrink:0;"></div>
      <span style="font-size:8px;color:#bbb;">${val}</span>
    </div>`;
  }

  const methodTooltip = (row) => {
    const label = METHOD_LABEL[row.method] ?? row.method;
    const ref   = row.study_reference ?? '';
    const pmid  = row.pubmed_id ? ` · PMID ${row.pubmed_id}` : '';
    return `title="${label}${ref ? ' · ' + ref : ''}${pmid}"`;
  };

  function makeRow(row, isInferred) {
    const opacity  = isInferred ? 'opacity:0.72;' : '';
    const nameCol  = isInferred ? '#9ca3af' : '#1a1a1a';
    const descCol  = isInferred ? '#bbb' : '#777';
    const methCol  = isInferred ? '#d1d5db' : '#10b981';
    const methLabel = METHOD_LABEL[row.method] ?? row.method;
    const desc = row.partner_description
      ? `<div style="font-size:9.5px;color:${descCol};line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(row.partner_description)}</div>`
      : '';
    const dataAttrs = row.partner_organism === 'ct' && row.partner_ct_gene_id
      ? `data-partner-gene-id="${esc(row.partner_ct_gene_id)}"`
      : row.partner_external_id
        ? `data-uniprot="${esc(row.partner_external_id)}"`
        : '';
    return `
      <div class="ppi-row" ${dataAttrs} style="display:flex;align-items:flex-start;padding:6px 14px;
           border-top:1px solid #f5f5f5;cursor:pointer;${opacity}transition:opacity 0.1s,background 0.1s;"
           onmouseenter="this.style.opacity='1';this.style.background='#f9fffe'"
           onmouseleave="this.style.opacity='${isInferred ? '0.72' : '1'}';this.style.background=''"
           ${methodTooltip(row)}>
        <div style="flex:1;min-width:0;overflow:hidden;">
          <div style="font-size:11px;font-weight:700;color:${nameCol};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${esc(row.partner_name)}${orgTag(row)}
          </div>
          ${desc}
        </div>
        <div style="flex-shrink:0;margin-left:6px;text-align:right;">
          <div style="font-size:8px;font-weight:600;text-transform:uppercase;color:${methCol};">${methLabel}</div>
          ${scoreBar(row, isInferred ? maxInf : maxExp, isInferred)}
        </div>
      </div>`;
  }

  function accordionGroup(rows, id, dotColor, titleText, titleClass, countClass, isInferred, footnote) {
    if (rows.length === 0) return '';
    const open = !isInferred;
    const chevRot = open ? 'rotate(90deg)' : '';
    const bodyDisplay = open ? 'block' : 'none';
    const rowsHtml = rows.map(r => makeRow(r, isInferred)).join('');
    const foot = footnote && isInferred
      ? `<div style="font-size:8.5px;color:#bbb;font-style:italic;padding:4px 14px 8px;line-height:1.4;">${footnote}</div>`
      : '';
    return `
      <div class="ppi-acc-header" data-target="ppi-body-${id}"
           style="display:flex;align-items:center;justify-content:space-between;
                  padding:6px 14px;cursor:pointer;border-top:1px solid #f0f0f0;
                  user-select:none;"
           onmouseenter="this.style.background='#f9f9f9'"
           onmouseleave="this.style.background=''">
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:7px;height:7px;border-radius:50%;background:${dotColor};flex-shrink:0;"></div>
          <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;${titleClass}">${titleText}</span>
          <span style="font-size:8.5px;font-weight:600;padding:1px 5px;border-radius:10px;${countClass}">${rows.length}</span>
        </div>
        <span class="ppi-chevron" style="font-size:8px;color:#bbb;transform:${chevRot};transition:transform 0.2s;">▶</span>
      </div>
      <div id="ppi-body-${id}" style="display:${bodyDisplay};">
        ${rowsHtml}
        ${foot}
      </div>`;
  }

  const totalCount = experimental.length + inferred.length;
  const expGroup = accordionGroup(
    experimental, `exp-${gene.id}`,
    '#10b981', 'Experimental', 'color:#065f46;',
    'background:#d1fae5;color:#065f46;',
    false, ''
  );
  const infGroup = accordionGroup(
    inferred, `inf-${gene.id}`,
    '#d1d5db', 'Inferred (STRING)', 'color:#9ca3af;',
    'background:#f3f4f6;color:#9ca3af;',
    true, 'Inferred from orthologous experiments in other bacteria'
  );

  el.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;gap:7px;padding:10px 14px 6px;">
        <div style="width:3px;height:13px;background:#1a6b4a;border-radius:2px;flex-shrink:0;"></div>
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#1a6b4a;">
          Protein Interactions (${totalCount})
        </div>
      </div>
      ${expGroup}
      ${infGroup}
    </div>`;

  // Accordion toggle
  el.querySelectorAll('.ppi-acc-header').forEach(header => {
    header.addEventListener('click', () => {
      const body    = el.querySelector(`#${header.dataset.target}`);
      const chevron = header.querySelector('.ppi-chevron');
      if (!body) return;
      const isOpen = body.style.display !== 'none';
      body.style.display    = isOpen ? 'none' : 'block';
      chevron.style.transform = isOpen ? '' : 'rotate(90deg)';
    });
  });

  // Row navigation
  el.querySelectorAll('.ppi-row').forEach(row => {
    row.addEventListener('click', () => {
      const geneId   = row.dataset.partnerGeneId;
      const uniprotId = row.dataset.uniprot;
      if (geneId) {
        openGeneById(geneId, _container);
      } else if (uniprotId) {
        window.open(`https://www.uniprot.org/uniprotkb/${uniprotId}`, '_blank');
      }
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat(ppi): add renderDetailInteractions accordion component"
```

---

## Task 7: Wire up `loadDetailAsync()` to fetch and render PPI data

**Files:**
- Modify: `web/js/views/genomes.js` — `loadDetailAsync` function (~line 1368)

- [ ] **Step 1: Add the PPI query to `loadDetailAsync`**

Add a new query to the existing `Promise.all` block. Replace the closing `]);` of the Promise.all with an additional entry:

```javascript
// In loadDetailAsync — add to the Promise.all array before the closing ]);
sb.from('protein_interactions')
  .select('*')
  .eq('gene_id', gene.id)
  .order('confidence_score', { ascending: false, nullsFirst: false }),
```

Destructure the result by adding `ppiDirectResult` to the array:

```javascript
const [protResult, orthoFwdResult, orthoRevResult, neighborResult, mutantsResult, ppiDirectResult] = await Promise.all([
  // ... existing queries unchanged ...
  sb.from('protein_interactions')
    .select('*')
    .eq('gene_id', gene.id)
    .order('confidence_score', { ascending: false, nullsFirst: false }),
]);
```

- [ ] **Step 2: Add the ortholog-propagated query after the Promise.all**

Insert after the `orthoRows` merge block (~line 1418), before `renderDetailOrthologs`:

```javascript
// Fetch strain-agnostic interactions from orthologous genes (STRING data propagation)
const orthoGeneIds = orthoRows.map(o => o.gene_b?.id).filter(Boolean);
let ppiOrthoRows = [];
if (orthoGeneIds.length > 0) {
  const { data: ppiOrthoData } = await sb.from('protein_interactions')
    .select('*')
    .in('gene_id', orthoGeneIds)
    .eq('strain_specific', false)
    .order('confidence_score', { ascending: false, nullsFirst: false });
  ppiOrthoRows = ppiOrthoData ?? [];
}

// Merge direct + ortholog-propagated, deduplicate by partner identity
const ppiDirect = ppiDirectResult.data ?? [];
const seenPartners = new Set(ppiDirect.map(r => r.partner_ct_gene_id ?? r.partner_external_id));
const ppiMerged = [
  ...ppiDirect,
  ...ppiOrthoRows.filter(r => !seenPartners.has(r.partner_ct_gene_id ?? r.partner_external_id)),
];
// Sort: experimental first, then by confidence desc
ppiMerged.sort((a, b) => {
  if (a.evidence_tier !== b.evidence_tier)
    return a.evidence_tier === 'experimental' ? -1 : 1;
  return (b.confidence_score ?? 0) - (a.confidence_score ?? 0);
});
```

- [ ] **Step 3: Add the render call**

Append to the bottom of `loadDetailAsync` alongside the other `renderDetail*` calls:

```javascript
renderDetailInteractions(detail, gene, ppiMerged);
```

- [ ] **Step 4: Test manually**

Start the dev server and open a gene that has Mirrashidi data — CT224 (IncE) is a good one:
1. Navigate to Genomes → CT-D → search "CT224"
2. Open the gene detail panel
3. Scroll to Protein Interactions section
4. Expected: "Experimental (N)" group open with SNX1, SNX2, SNX5, SNX6, DPP9, etc.; hovering a row shows tooltip with "AP-MS · Mirrashidi et al. 2015 · PMID 26118995"
5. Click SNX1 row → should open UniProt in new tab
6. Navigate to CT119 (IncA) → verify CT-CT interaction with IncE shows in Protein Interactions
7. Navigate to a CT-D gene that has STRING data (e.g. CT170 / trpB) → "Inferred (STRING)" group should appear collapsed

- [ ] **Step 5: Test ortholog propagation**

Navigate to a CT-L2 gene that is orthologous to a CT-D gene with STRING data:
1. Switch to CT-L2 strain
2. Find CTL0170 (trpB ortholog)
3. Protein Interactions section should show STRING inferred rows from CT170 (CT-D ortholog) because `strain_specific = false`

- [ ] **Step 6: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat(ppi): wire loadDetailAsync to fetch and render protein interactions"
```

---

## Task 8: Push and verify on Vercel preview

- [ ] **Step 1: Push to origin/dev**

```bash
git push origin dev
```

- [ ] **Step 2: Open the Vercel preview URL and repeat the manual checks from Task 7 Step 4**

Pay attention to:
- Mobile layout: Protein Interactions section should be full-width and accordion should collapse/expand correctly
- A gene with no interactions (e.g. a hypothetical protein without any PPI data) should show "No interaction data available"
- Inferred group starts collapsed; clicking the header expands it

- [ ] **Step 3: If all looks good, note Vercel preview URL for Kevin's review**
