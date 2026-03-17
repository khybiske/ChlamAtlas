#!/usr/bin/env python3
"""Re-runs just the ortholog import with pagination fix."""

import os, sys, re
import pandas as pd
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "csv")

STRAIN_CONFIG = {
    "CT-D":  "ChlamDB - Genes_D.csv",
    "CT-L2": "ChlamDB - Genes_L2.csv",
    "CM":    "ChlamDB - Genes_CM.csv",
}

def to_str(val):
    if pd.isna(val): return None
    s = str(val).strip()
    return s if s else None

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# Fetch all genes with pagination
print("Fetching all genes...")
all_genes, offset, page_size = [], 0, 1000
while True:
    page = sb.table("genes").select("id,strain_id,locus_tag").range(offset, offset + page_size - 1).execute().data
    all_genes.extend(page)
    if len(page) < page_size:
        break
    offset += page_size
print(f"  {len(all_genes)} genes loaded")

lookup = {(g["strain_id"], g["locus_tag"]): g["id"] for g in all_genes}
suffix_to_strain = {"L2": "CT-L2", "D": "CT-D", "CM": "CM"}

pairs = set()
for strain_id, csv_file in STRAIN_CONFIG.items():
    df = pd.read_csv(os.path.join(DATA_DIR, csv_file), dtype=str, na_values=[""])
    orth_cols = {c: c.replace("OrthologID_", "") for c in df.columns if c.startswith("OrthologID_")}
    for _, row in df.iterrows():
        locus = to_str(row.get("GeneID"))
        if not locus: continue
        gene_pk = lookup.get((strain_id, locus))
        if gene_pk is None: continue
        for col, suffix in orth_cols.items():
            orth_strain = suffix_to_strain.get(suffix)
            orth_locus = to_str(row.get(col))
            if not orth_strain or not orth_locus: continue
            orth_pk = lookup.get((orth_strain, orth_locus))
            if orth_pk is None: continue
            pairs.add((min(gene_pk, orth_pk), max(gene_pk, orth_pk)))

print(f"  {len(pairs)} ortholog pairs found")

# Clear old orthologs and re-insert
print("Clearing old orthologs...")
sb.table("orthologs").delete().neq("id", 0).execute()

rows = [{"gene_id": a, "ortholog_gene_id": b, "method": "reciprocal_blast"} for a, b in pairs]
print("Inserting...")
for i in range(0, len(rows), 500):
    chunk = rows[i:i+500]
    sb.table("orthologs").upsert(chunk).execute()
    print(f"  {min(i+500, len(rows))}/{len(rows)}")

print("Done.")
