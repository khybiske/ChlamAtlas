#!/usr/bin/env python3
"""
Populate target_gene_ids for chimera mutants based on their recombination span.

For each chimera with recombination_start + recombination_end set, resolves the
backbone genes between those locus tags (by sort_index) and writes their UUIDs
into target_gene_ids. This allows the gene detail mutant panel to find chimeras.

Handles circular chromosomes (end sort_index < start sort_index).

Run from repo root:
  python3 data/backfill_chimera_target_genes.py [--dry-run]
"""

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

DRY_RUN = '--dry-run' in sys.argv

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


def fetch_chimeras():
    """Fetch all chimeras that have recombination_start and recombination_end."""
    rows = sb_get(
        'mutants',
        'select=id,mutant_id,background_strain_id,recombination_start,recombination_end'
        '&mutation_type=eq.chimera'
        '&recombination_start=not.is.null'
        '&recombination_end=not.is.null'
        '&limit=2000'
    )
    return rows


def fetch_sort_index(locus_tag, strain_id):
    """Return sort_index for a given locus_tag + strain_id, or None."""
    rows = sb_get(
        'genes',
        f'select=sort_index&locus_tag=eq.{locus_tag}&strain_id=eq.{strain_id}&limit=1'
    )
    return rows[0]['sort_index'] if rows else None


def fetch_genes_in_range(strain_id, si, ei):
    """Return list of gene UUIDs with sort_index between si and ei (inclusive)."""
    rows = sb_get(
        'genes',
        f'select=id&strain_id=eq.{strain_id}'
        f'&sort_index=gte.{si}&sort_index=lte.{ei}&limit=2000'
    )
    return [r['id'] for r in rows]


def fetch_max_sort_index(strain_id):
    rows = sb_get(
        'genes',
        f'select=sort_index&strain_id=eq.{strain_id}'
        f'&sort_index=lte.870'           # chromosome only (pL2 plasmid starts at 871)
        f'&order=sort_index.desc&limit=1'
    )
    return rows[0]['sort_index'] if rows else 870


def main():
    print(f'Mode: {"DRY RUN" if DRY_RUN else "LIVE"}')

    print('Fetching chimeras with recombination span...')
    chimeras = fetch_chimeras()
    print(f'  Found {len(chimeras)} chimeras with recombination_start/end')

    updated = skipped = errors = 0

    for m in chimeras:
        mid        = m['mutant_id']
        strain_id  = m['background_strain_id']
        start_tag  = m['recombination_start']
        end_tag    = m['recombination_end']

        si = fetch_sort_index(start_tag, strain_id)
        ei = fetch_sort_index(end_tag,   strain_id)

        if si is None or ei is None:
            print(f'  SKIP {mid}: could not resolve sort_index for {start_tag} or {end_tag}')
            skipped += 1
            continue

        is_circular = ei < si

        if is_circular:
            max_idx  = fetch_max_sort_index(strain_id)
            gene_ids = (
                fetch_genes_in_range(strain_id, si, max_idx) +
                fetch_genes_in_range(strain_id, 0, ei)
            )
        else:
            gene_ids = fetch_genes_in_range(strain_id, si, ei)

        if not gene_ids:
            print(f'  SKIP {mid}: no genes found in span {start_tag}→{end_tag}')
            skipped += 1
            continue

        print(f'  {"[DRY]" if DRY_RUN else "PATCH"} {mid}: {start_tag}→{end_tag} '
              f'({len(gene_ids)} genes{"  [circular]" if is_circular else ""})')

        if not DRY_RUN:
            status = sb_patch('mutants', f'id=eq.{m["id"]}', {'target_gene_ids': gene_ids})
            if status:
                updated += 1
            else:
                errors += 1
        else:
            updated += 1

    print(f'\nDone. updated={updated}  skipped={skipped}  errors={errors}')


if __name__ == '__main__':
    main()
