#!/usr/bin/env python3
"""
ChlamAtlas CSV → Supabase migration script.

Usage:
    pip install supabase pandas
    export SUPABASE_URL="https://your-project.supabase.co"
    export SUPABASE_SERVICE_KEY="your-service-role-key"   # NOT the anon key
    python scripts/migrate.py

The service role key bypasses RLS so we can insert everything regardless of
is_published status. Never expose the service key client-side.
"""

import os
import sys
import re
import pandas as pd
from supabase import create_client, Client

# ─── CONFIG ───────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")  # service role key
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "csv")

GITHUB_RAW = "https://raw.githubusercontent.com/khybiske/ChlamAtlas/refs/heads/main"

# mmCIF and thumbnail path templates per strain
STRAIN_CONFIG = {
    "CT-D": {
        "csv": "ChlamDB - Genes_D.csv",
        "af_image_dir": "AFmodels/DUW3",   # locus_tag.png
        "mmcif_dir": "models/CTDUW3",       # AF-{uniprot_id}-F1-model_v4.cif
    },
    "CT-L2": {
        "csv": "ChlamDB - Genes_L2.csv",
        "af_image_dir": "AFmodels/L2",
        "mmcif_dir": "models/CTL2",
    },
    "CM": {
        "csv": "ChlamDB - Genes_CM.csv",
        "af_image_dir": "AFmodels/CM",
        "mmcif_dir": "models/CM",
    },
}


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def to_float(val):
    """Convert expression values to float; NQ / ND / - / empty → None."""
    if pd.isna(val):
        return None
    s = str(val).strip()
    if s in ("NQ", "ND", "-", "", "N/A"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def to_bool(val):
    """Parse TRUE/FALSE/Yes/No/1/0 strings to Python bool."""
    if pd.isna(val):
        return False
    s = str(val).strip().upper()
    return s in ("TRUE", "YES", "1")


def to_int(val):
    if pd.isna(val):
        return None
    try:
        return int(float(str(val).strip()))
    except (ValueError, TypeError):
        return None


def to_str(val):
    if pd.isna(val):
        return None
    s = str(val).strip()
    return s if s else None


def to_date(val):
    """Parse M/D/YYYY or similar to ISO date string, or None."""
    if pd.isna(val):
        return None
    s = str(val).strip()
    if not s:
        return None
    try:
        return pd.to_datetime(s, dayfirst=False).strftime("%Y-%m-%d")
    except Exception:
        return None


def chunked(lst, size=500):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]


def upsert_batch(supabase: Client, table: str, rows: list):
    """Insert rows in chunks; print progress."""
    total = len(rows)
    inserted = 0
    for chunk in chunked(rows):
        supabase.table(table).upsert(chunk).execute()
        inserted += len(chunk)
        print(f"  {table}: {inserted}/{total}")


# ─── GENES ────────────────────────────────────────────────────────────────────

def build_gene_rows(strain_id: str, config: dict) -> list[dict]:
    csv_path = os.path.join(DATA_DIR, config["csv"])
    df = pd.read_csv(csv_path, dtype=str, na_values=[""])
    rows = []

    for _, r in df.iterrows():
        locus = to_str(r.get("GeneID"))
        if not locus:
            continue  # skip blank rows

        uniprot = to_str(r.get("Uniprot ID")) or to_str(r.get("UniprotID"))

        # Derive URLs from naming conventions
        af_image_url = (
            f"{GITHUB_RAW}/{config['af_image_dir']}/{locus}.png"
            if locus else None
        )
        mmcif_path = (
            f"{GITHUB_RAW}/{config['mmcif_dir']}/AF-{uniprot}-F1-model_v4.cif"
            if uniprot else None
        )
        # Prefer explicit URL from CSV if present (some may differ)
        if to_str(r.get("AFImageURL")):
            af_image_url = to_str(r["AFImageURL"])

        row = {
            "strain_id":                   strain_id,
            "locus_tag":                   locus,
            "sort_index":                  to_int(r.get("SortIndex")),
            "gene_name":                   to_str(r.get("GeneName")),
            "product":                     to_str(r.get("Product")),
            "uniprot_id":                  uniprot,
            "length_bp":                   to_int(r.get("Length (bp)")),
            "mass_kd":                     to_float(r.get("Mass (kD)")),
            "protein_family":              to_str(r.get("Protein Family")),
            "function":                    to_str(r.get("Function")),
            "pz":                          to_str(r.get("PZ")),
            "is_membrane":                 to_bool(r.get("Mem true")),
            "is_hypothetical":             to_bool(r.get("Hyp true")),
            "is_dna_binding":              to_bool(r.get("DNA true")),
            "is_secreted":                 to_bool(r.get("Secr true")),
            "is_inc":                      to_bool(r.get("Inc true")),
            # Expression (columns vary by strain — missing cols → None)
            "expr_eb":                     to_float(r.get("EB")),
            "expr_rb":                     to_float(r.get("RB")),
            "expr_1h":                     to_float(r.get("1h")),
            "expr_3h":                     to_float(r.get("3h")),
            "expr_8h":                     to_float(r.get("8h")),
            "expr_16h":                    to_float(r.get("16h")),
            "expr_24h":                    to_float(r.get("24h")),
            "expr_40h":                    to_float(r.get("40h")),
            "microarray_category":         to_str(r.get("Microarray")),
            # Structure
            "pdb_id":                      to_str(r.get("PDB ID")),
            "pdb_image_url":               to_str(r.get("PDBImageURL")),
            "alphafold_id":                to_str(r.get("AlphaFold ID")),
            "af_image_url":                af_image_url,
            "mmcif_path":                  mmcif_path,
            "af_version":                  to_str(r.get("Version")),
            "structural_homology_function": to_str(
                r.get("Structural homology inferred function")
                or r.get("Structural homology (Foldseek)")
            ),
            # GO / annotations
            "biological_process":          to_str(r.get("Biological Process")),
            "cellular_component":          to_str(r.get("Cellular Component")),
            "molecular_function":          to_str(r.get("Molecular Function")),
            "go_ids":                      to_str(r.get("GO_IDs_Extracted")),
            "subcellular_location":        to_str(r.get("Subcellular Location")),
            "subunit_structure":           to_str(r.get("Subunit Structure")),
            # Metadata
            "last_edited":                 to_str(r.get("LastEdited")),
            "edited_by_name":              to_str(r.get("EditedByName")),
        }
        rows.append(row)

    return rows


# ─── ORTHOLOGS ────────────────────────────────────────────────────────────────

def build_orthologs(supabase: Client) -> list[dict]:
    """
    Fetch all genes, then resolve OrthologID columns to gene row IDs.
    We only need to look at one direction (D→L2, D→CM) to get all pairs
    without duplication, because the constraint is gene_id < ortholog_gene_id.
    """
    print("Fetching genes to resolve ortholog pairs...")

    # Build a lookup: (strain_id, locus_tag) → gene.id
    # Fetch all genes in pages (Supabase default limit is 1000)
    all_genes = []
    page_size = 1000
    offset = 0
    while True:
        page = supabase.table("genes").select("id,strain_id,locus_tag").range(offset, offset + page_size - 1).execute().data
        all_genes.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    print(f"  Fetched {len(all_genes)} genes for ortholog lookup")
    lookup = {(g["strain_id"], g["locus_tag"]): g["id"] for g in all_genes}

    # Read ortholog columns from CSVs
    pairs: set[tuple[int, int]] = set()

    for strain_id, config in STRAIN_CONFIG.items():
        csv_path = os.path.join(DATA_DIR, config["csv"])
        df = pd.read_csv(csv_path, dtype=str, na_values=[""])

        # Each CSV knows its own strain and the two other strains' columns
        # CT-D: OrthologID_L2, OrthologID_CM
        # CT-L2: OrthologID_D, OrthologID_CM
        # CM: OrthologID_D, OrthologID_L2
        ortholog_cols = {
            c: c.replace("OrthologID_", "")
            for c in df.columns
            if c.startswith("OrthologID_")
        }
        # Map suffix → strain_id
        suffix_to_strain = {"L2": "CT-L2", "D": "CT-D", "CM": "CM"}

        for _, row in df.iterrows():
            locus = to_str(row.get("GeneID"))
            if not locus:
                continue
            gene_pk = lookup.get((strain_id, locus))
            if gene_pk is None:
                continue

            for col, suffix in ortholog_cols.items():
                orth_strain = suffix_to_strain.get(suffix)
                orth_locus = to_str(row.get(col))
                if not orth_strain or not orth_locus:
                    continue
                orth_pk = lookup.get((orth_strain, orth_locus))
                if orth_pk is None:
                    continue
                # Store pair with lower id first to enforce uniqueness
                pair = (min(gene_pk, orth_pk), max(gene_pk, orth_pk))
                pairs.add(pair)

    rows = [{"gene_id": a, "ortholog_gene_id": b, "method": "reciprocal_blast"}
            for a, b in pairs]
    print(f"  Found {len(rows)} ortholog pairs")
    return rows


# ─── MUTANTS ──────────────────────────────────────────────────────────────────

# Map Mutants.csv "Strain" column to strains.id
STRAIN_MAP = {
    "CM": "CM",
    "L2434": "CT-L2",
    "L2/434": "CT-L2",
    "C. trachomatis": "CT-L2",   # most CT mutants are L2 background
    "C. muridarum": "CM",
    "DUW3": "CT-D",
    "D/UW-3": "CT-D",
}


def build_mutant_rows(csv_path: str) -> tuple[list[dict], list[dict]]:
    df = pd.read_csv(csv_path, dtype=str, na_values=[""])
    mutant_rows = []
    pipeline_rows = []

    for _, r in df.iterrows():
        mid = to_str(r.get("MutantID"))
        if not mid:
            continue

        # Target genes: "TC0031, TC0610" → ["TC0031", "TC0610"]
        tg_raw = to_str(r.get("TargetGene(s)")) or ""
        target_genes = [g.strip() for g in re.split(r"[,;]+", tg_raw) if g.strip()]

        # Map strain
        strain_raw = to_str(r.get("Strain")) or ""
        strain_id = STRAIN_MAP.get(strain_raw) or STRAIN_MAP.get(
            to_str(r.get("Category")) or "", None
        )

        mutant_rows.append({
            "mutant_id":               mid,
            "mutant_name":             to_str(r.get("MutantName")),
            "category":                to_str(r.get("Category")),
            "strain_id":               strain_id,
            "target_genes":            target_genes if target_genes else None,
            "mutation_type":           to_str(r.get("Type")),
            "description":             to_str(r.get("Description")),
            "status":                  to_str(r.get("Status")),
            "creator":                 to_str(r.get("Creator")),
            "created_at":              to_date(r.get("Timestamp")),
            "notes":                   to_str(r.get("Notes")),
            "priority":                to_str(r.get("Priority")),
            "plasmid_used":            to_str(r.get("Plasmid Used")),
            "tn_insert_positions":     to_str(r.get("Tn Insert Position(s)")),
            "recombined_start_gene":   to_str(r.get("RecombinedStartGene")),
            "recombined_end_gene":     to_str(r.get("RecombinedEndGene")),
            "ortholog_span_cm":        to_str(r.get("OrthologSpan_CM")),
            "recombined_region_notes": to_str(r.get("RecombinedRegionNotes")),
            "selection_markers":       to_str(r.get("SelectionMarkers")),
            "sequenced":               to_bool(r.get("Sequenced?")),
            "sequencing_type":         to_str(r.get("SequencingType")),
            "invitro_phenotype":       to_bool(r.get("In vitro Phenotype?")) if to_str(r.get("In vitro Phenotype?")) else None,
            "invitro_notes":           to_str(r.get("In vitro Notes")),
            "invitro_data":            to_str(r.get("In vitro Data")),
            "invivo_phenotype":        to_bool(r.get("In vivo Phenotype?")) if to_str(r.get("In vivo Phenotype?")) else None,
            "invivo_notes":            to_str(r.get("In vivo Notes")),
            "invivo_data":             to_str(r.get("In vivo Data")),
            "is_archived":             to_bool(r.get("Archived")),
            "stuck_stage":             to_str(r.get("StuckStage")),
            "assigned_to":             to_str(r.get("AssignedTo")),
            "show_in_pipeline":        to_bool(r.get("ShowInPipeline")),
            "stock_locations":         to_str(r.get("StockLocations")),
            "shared_with":             to_str(r.get("SharedWith")),
            "is_published":            to_bool(r.get("Public")),
            "last_edited":             to_str(r.get("LastEdited")),
            "last_edited_by":          to_str(r.get("LastEditedBy")),
        })

        pipeline_rows.append({
            "mutant_id":                             mid,
            "plasmid_complete":                      to_bool(r.get("Plasmid_Complete")),
            "transformation_complete":               to_bool(r.get("Transformation_Complete")),
            "cloning_complete":                      to_bool(r.get("Cloning_Complete")),
            "genotyping_complete":                   to_bool(r.get("Genotyping_Complete")),
            "invitro_test_complete":                 to_bool(r.get("InVitro_Test_Complete")),
            "invivo_test_complete":                  to_bool(r.get("InVivo_Test_Complete")),
            "include_in_pipeline_after_genotyping":  to_bool(r.get("IncludeInPipelineAfterGenotyping")),
        })

    return mutant_rows, pipeline_rows


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.")
        sys.exit(1)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"Connected to {SUPABASE_URL}\n")

    # 1. Genes
    print("── Importing genes ──")
    for strain_id, config in STRAIN_CONFIG.items():
        print(f"  Building rows for {strain_id}...")
        rows = build_gene_rows(strain_id, config)
        print(f"  Uploading {len(rows)} genes for {strain_id}...")
        upsert_batch(supabase, "genes", rows)

    # 2. Orthologs (derived from gene data now in DB)
    print("\n── Building orthologs ──")
    orth_rows = build_orthologs(supabase)
    if orth_rows:
        upsert_batch(supabase, "orthologs", orth_rows)

    # 3. Mutants
    print("\n── Importing mutants ──")
    mutants_csv = os.path.join(DATA_DIR, "ChlamDB - Mutants.csv")
    mutant_rows, pipeline_rows = build_mutant_rows(mutants_csv)
    print(f"  Uploading {len(mutant_rows)} mutants...")
    upsert_batch(supabase, "mutants", mutant_rows)

    print(f"  Uploading {len(pipeline_rows)} pipeline records...")
    upsert_batch(supabase, "mutant_pipeline", pipeline_rows)

    print("\n✓ Migration complete.")


if __name__ == "__main__":
    main()
