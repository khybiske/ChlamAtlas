#!/usr/bin/env python3
"""
Import C. muridarum transposon mutants (Natalie Wagoner / Hefty Lab, KU) into
Supabase.

Source: data/csv/Cm Transposon Insertions.xlsx  (sheet "1-120", tab 1)

Column layout (0-indexed tuple positions), header row is row 0:
    0  transposon #            -> drives KUCM### id
    1  locus tag (TC_0002)     -> target gene(s); "IGR" = intergenic
    2  gene name               -> name (Tn::<gene>)
    3  product / IGR flank text
    4  insert position         -> notes
    5  gene length (bp)
    6  gene length (aa)
    7  nucleotides transcribed
    8  amino acids translated
    9  fraction translated     -> notes ("Translated: NN% of protein")
    10 stop codon
    11 date sent for sequencing (COL L) -> sequenced / wgs / genotyped dates
    12 transformation #        -> pipeline_notes
    13 sheet notes             -> appended to notes
    14 modified protein sequence

Decisions (confirmed with Kevin, 2026-09-02):
    - id scheme      : KUCM### from col-A number; unnumbered data rows -> KUCM123+
    - visibility     : is_published = False (lab-only)
    - show_in_pipeline: True
    - marker         : ['bla']   (penR / ampR)
    - plasmid_used   : null (unknown)
    - notes          : "Insert position: <E>. Translated: <NN>% of protein." + sheet note
    - pipeline row   : status=active, stocks_ku_hefty=True; col-L date fills
                       sequenced/sequenced_date, wgs_complete/wgs_completed_date,
                       genotyped_date/genotyping_completed_date, *_completed_by=Natalie Wagoner
    - creator_name   : "Natalie Wagoner" (+ users stub); contributed_by = Kevin (admin)

Run from repo root:
    python3 data/import_cm_transposon.py --dry-run
    python3 data/import_cm_transposon.py
"""

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

import openpyxl

# ─── Config ───────────────────────────────────────────────

SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co'
CM_STRAIN_ID = '2c52ffca-31eb-4bf4-8238-4b8b06018f6a'   # Chlamydia muridarum / Nigg
KEVIN_USER_ID = '46680e4c-b898-4134-af70-04250cd0c3de'  # admin, batch-import owner
CREATOR_NAME = 'Natalie Wagoner'
MARKER = ['bla']

DRY_RUN = '--dry-run' in sys.argv
XLSX_PATH = os.path.join(os.path.dirname(__file__), 'csv', 'Cm Transposon Insertions.xlsx')
SHEET_NAME = '1-120'

SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
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


def sb_post(path, data, prefer=None):
    url = f'{SUPABASE_URL}/rest/v1/{path}'
    headers = dict(HEADERS)
    if prefer:
        headers['Prefer'] = prefer
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else True  # True = 2xx with empty body
    except urllib.error.HTTPError as e:
        print(f'  HTTP {e.code}: {e.read().decode()[:300]}')
        return None


# ─── Reference data ───────────────────────────────────────

def fetch_cm_genes():
    """locus_tag -> gene uuid, for the CM strain only."""
    rows = sb_get('genes', f'select=id,locus_tag&strain_id=eq.{CM_STRAIN_ID}&limit=5000')
    return {r['locus_tag']: r['id'] for r in rows}


def ensure_creator():
    rows = sb_get('users', 'select=id,display_name')
    for r in rows:
        if r['display_name'] == CREATOR_NAME:
            return r['id']
    print(f'  Creating user stub: {CREATOR_NAME}')
    if DRY_RUN:
        return '<dry-run-natalie-uuid>'
    res = sb_post('users', {'display_name': CREATOR_NAME, 'email': '', 'role': 'lab_member'},
                  prefer='resolution=merge-duplicates,return=representation')
    return res[0]['id'] if res else None


# ─── Parsing helpers ──────────────────────────────────────

def norm_locus(raw):
    """'TC_0002'->'TC0002', 'TC_00822'->'TC0822', 'TC_A03'->'TCA03', 'TC_r01'->'TCr01'."""
    raw = str(raw).strip()
    m = re.match(r'^TC[_ ]?0*(\d+)$', raw)
    if m:
        return f'TC{int(m.group(1)):04d}'
    return raw.replace('_', '').replace(' ', '')


def parse_target_loci(raw):
    """Return list of normalized locus tags. Handles 'TC_0455-456' (shared prefix)."""
    raw = str(raw).strip()
    if not raw or raw.upper() == 'IGR':
        return []
    if '-' in raw and raw.upper().startswith('TC'):
        head, *rest = raw.split('-')
        out = [norm_locus(head)]
        prefix = re.match(r'^(TC[_ ]?)', head).group(1)
        for part in rest:
            part = part.strip()
            if re.match(r'^\d+$', part):
                out.append(norm_locus(prefix + part))
            else:
                out.append(norm_locus(part))
        return out
    return [norm_locus(raw)]


def make_name(locus_raw, gene_name, product):
    locus_raw = (str(locus_raw).strip() if locus_raw is not None else '')
    if locus_raw.upper() == 'IGR':
        flank = (str(product).strip() if product else '')
        flank = re.sub(r'TC[_ ]?0*(\d+)', lambda m: f'TC{int(m.group(1)):04d}', flank)
        return f'Tn::IGR ({flank})' if flank else 'Tn::IGR'
    gn = str(gene_name).strip() if gene_name else ''
    # Ignore "names" that are really locus tags / cross-species aliases (e.g. "CT_050")
    if gn and not re.match(r'^(CT|TC)[_ ]?\d', gn):
        return f'Tn::{gn.replace(", ", "-").replace(",", "-")}'
    tags = parse_target_loci(locus_raw)
    return f'Tn::{"-".join(tags)}' if tags else 'Tn::?'


def make_notes(insert_pos, frac_translated, aa_len, aa_translated, sheet_note):
    parts = []
    if insert_pos not in (None, ''):
        parts.append(f'Insert position: {str(insert_pos).strip()}.')
    frac = frac_translated
    if frac in (None, '') and aa_len and aa_translated:
        try:
            frac = float(aa_translated) / float(aa_len)
        except (ValueError, ZeroDivisionError):
            frac = None
    if frac not in (None, ''):
        try:
            parts.append(f'Translated: {round(float(frac) * 100)}% of protein.')
        except ValueError:
            pass
    if sheet_note not in (None, ''):
        parts.append(str(sheet_note).strip())
    return ' '.join(parts) or None


def parse_mutant_number(raw):
    """col-A value -> int or None. Handles 13, '13*', '  15* ', None."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return int(raw)
    digits = re.sub(r'\D', '', str(raw))
    return int(digits) if digits else None


def seq_date_iso(val):
    if val is None:
        return None
    if hasattr(val, 'date'):
        return val.date().isoformat()
    s = str(val).strip()
    return s or None


# ─── Main ─────────────────────────────────────────────────

def main():
    print(f'ChlamAtlas — CM transposon import   [{"DRY RUN" if DRY_RUN else "LIVE"}]\n')

    if not os.path.exists(XLSX_PATH):
        print(f'ERROR: source not found: {XLSX_PATH}')
        print('Copy the file there first:')
        print(f'  mkdir -p data/csv && cp "/Users/khybiske/Downloads/Cm Transposon Insertions.xlsx" data/csv/')
        sys.exit(1)

    print('Fetching reference data...')
    genes = fetch_cm_genes()
    print(f'  CM genes: {len(genes)}')
    creator_id = ensure_creator()
    print(f'  creator id: {creator_id}')

    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb[SHEET_NAME]
    rows = list(ws.iter_rows(values_only=True))[1:]  # drop header

    records = []
    seen_numbers = []
    next_unnumbered = 123
    warnings = []

    for i, row in enumerate(rows, start=2):  # start=2 -> spreadsheet row number
        row = list(row) + [None] * (15 - len(row))
        locus_raw = row[1]
        if locus_raw is None or str(locus_raw).strip() == '':
            continue  # empty / placeholder row (#123-130)

        num = parse_mutant_number(row[0])
        if num is None:
            num = next_unnumbered
            next_unnumbered += 1
            warnings.append(f'row {i}: no transposon # -> assigned KUCM{num:03d} ({locus_raw})')
        seen_numbers.append(num)
        mutant_id = f'KUCM{num:03d}'

        name = make_name(locus_raw, row[2], row[3])
        loci = parse_target_loci(locus_raw)
        gene_ids, missing = [], []
        for tag in loci:
            if tag in genes:
                gene_ids.append(genes[tag])
            else:
                missing.append(tag)
        if missing:
            warnings.append(f'{mutant_id}: locus not in CM genes table: {", ".join(missing)}')

        notes = make_notes(row[4], row[9], row[6], row[8], row[13])
        sdate = seq_date_iso(row[11])
        trans_no = str(row[12]).strip() if row[12] not in (None, '') else None

        records.append({
            'mutant': {
                'mutant_id': mutant_id,
                'name': name,
                'collection': 'CM',
                'background_strain_id': CM_STRAIN_ID,
                'target_gene_ids': gene_ids or None,
                'mutation_type': 'transposon',
                'plasmid_used': None,
                'marker': MARKER,
                'creator': creator_id,
                'creator_name': CREATOR_NAME,
                'contributed_by': KEVIN_USER_ID,
                'is_published': False,
                'show_in_pipeline': True,
                'notes': notes,
            },
            'seq_date': sdate,
            'trans_no': trans_no,
            'loci': loci,
        })

    # ── numbering report ──
    dupes = sorted({n for n in seen_numbers if seen_numbers.count(n) > 1})
    numbered = sorted(n for n in seen_numbers if n < 123)
    gaps = [n for n in range(1, (max(numbered) if numbered else 0) + 1) if n not in numbered]

    print(f'\nParsed {len(records)} mutants  (KUCM{min(seen_numbers):03d}–KUCM{max(seen_numbers):03d})')
    if gaps:
        print(f'  numbering gaps in 1–{max(numbered)}: {gaps}')
    if dupes:
        print(f'  DUPLICATE transposon #s: {dupes}  (later row overwrites earlier on upsert!)')

    print('\n── Sample (first 8 + last 4) ──')
    for r in records[:8] + records[-4:]:
        m = r['mutant']
        print(f'  {m["mutant_id"]}  {m["name"]:<28}  genes={len(m["target_gene_ids"] or [])}  '
              f'seq={r["seq_date"] or "-":<10}  notes={ (m["notes"] or "")[:70] }')

    if warnings:
        print(f'\n── Warnings ({len(warnings)}) ──')
        for w in warnings:
            print(f'  {w}')

    if DRY_RUN:
        print('\nDRY RUN — nothing written. Re-run without --dry-run to apply.')
        return

    # ── write ──
    print('\nWriting mutants + pipeline rows...')
    n_mut = n_pipe = 0
    for r in records:
        m = r['mutant']
        res = sb_post('mutants?on_conflict=mutant_id', m,
                      prefer='resolution=merge-duplicates,return=representation')
        if not res:
            print(f'  ERROR mutant {m["mutant_id"]}')
            continue
        uuid = res[0]['id']
        n_mut += 1

        pipe = {
            'mutant_id': uuid,
            'status': 'active',
            'stocks_ku_hefty': True,
            'genotyping_method': 'WGS' if r['seq_date'] else None,
            'pipeline_notes': f'Transformation: {r["trans_no"]}' if r['trans_no'] else None,
        }
        if r['seq_date']:
            pipe.update({
                'sequenced': True,
                'sequenced_date': r['seq_date'],
                'wgs_complete': True,
                'wgs_completed_date': r['seq_date'],
                'wgs_completed_by': CREATOR_NAME,
                'genotyped_date': r['seq_date'],
                'genotyping_completed_date': r['seq_date'],
                'genotyping_completed_by': CREATOR_NAME,
            })
        # mutant_pipeline.mutant_id has no unique constraint in the live DB, so
        # on_conflict upsert 400s here. These mutants are new -> plain insert,
        # but guard against re-runs by checking first.
        existing = sb_get('mutant_pipeline', f'select=id&mutant_id=eq.{uuid}')
        if existing:
            print(f'  pipeline row already exists for {m["mutant_id"]}, skipping')
        elif sb_post('mutant_pipeline', pipe, prefer='return=minimal'):
            n_pipe += 1
        else:
            print(f'  ERROR pipeline row for {m["mutant_id"]}')

    print(f'\nDone. mutants upserted: {n_mut}   pipeline rows inserted: {n_pipe}')


if __name__ == '__main__':
    main()
