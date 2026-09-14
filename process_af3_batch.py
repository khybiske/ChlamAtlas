"""
process_af3_batch.py — Loads a folder of AlphaFold3 predictions into ChlamAtlas.

For every protein subfolder in a strain folder (one folder per protein, as
AlphaFold Server exports them), this script:
  1. Works out the protein's locus tag from the folder name
  2. Reads the confidence score (PTM) for the top-ranked model
  3. Copies the top-ranked structure file into this repo and commits + pushes it
  4. Looks up the matching protein in the ChlamAtlas database
  5. Writes the score + structure link to the database

Usage:
    # Dry run — parses files and prints what WOULD happen. No git, no database.
    python3 process_af3_batch.py --dry-run "/path/to/AF3 models/DUW3"

    # Real run — needs SUPABASE_SERVICE_KEY in a .env file in this repo.
    python3 process_af3_batch.py "/path/to/AF3 models/DUW3"

    # Only process the first N proteins (good for a quick sanity check):
    python3 process_af3_batch.py --limit 5 "/path/to/AF3 models/DUW3"

Safety: this script refuses to run while your repo is checked out on `main`.
`main` is protected — GitHub will reject pushes to it directly. Do your work
on your own branch (see Phase 4) and this script pushes there instead.
"""

import os, json, shutil, subprocess, argparse
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# ── Config ──────────────────────────────────────────────────────────────────

# This script lives at the root of the ChlamAtlas repo, so its own folder
# location IS the repo — no need to hardcode a path that only works on one
# computer.
REPO_DIR = Path(__file__).resolve().parent
ENV_FILE = REPO_DIR / ".env"

SUPABASE_URL = "https://ihobumwetoidqioifknt.supabase.co"  # not secret

# ── Helpers: file parsing (no network needed) ────────────────────────────────

def get_locus_tag(folder_path: Path) -> str:
    """
    Derive the canonical locus tag ChlamAtlas uses in its database from an
    AF3 protein folder name.

    Examples:
        ct160        -> CT160
        CT412 pmpA   -> CT412     (strip a gene-name suffix after a space)
        ct326_1      -> CT326.1   (AlphaFold split a big protein into domain
                                    chunks; the database uses a dot, not an
                                    underscore, for these)
        ct398_cdsz   -> CT398     (an underscore followed by letters is a
                                    gene-name suffix, not a domain number —
                                    drop it, same as the space case above)
        ct357r       -> CT357R    (a real locus tag as-is; nothing to strip)
    """
    name = folder_path.name.split(" ")[0].upper()
    if "_" in name:
        prefix, suffix = name.split("_", 1)
        name = f"{prefix}.{suffix}" if suffix.isdigit() else prefix
    return name


def get_model0_cif(folder_path: Path) -> Optional[Path]:
    """Return the top-ranked (model_0) structure file inside a protein folder."""
    candidates = list(folder_path.glob("*_model_0.cif"))
    return candidates[0] if candidates else None


def get_ptm_score(folder_path: Path) -> Optional[float]:
    """Return the PTM confidence score for the top-ranked model."""
    candidates = list(folder_path.glob("*_summary_confidences_0.json"))
    if not candidates:
        return None
    with open(candidates[0]) as f:
        data = json.load(f)
    return data.get("ptm")


# ── Helpers: GitHub commit (requires git) ────────────────────────────────────

def get_current_branch() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=REPO_DIR, capture_output=True, text=True
    )
    return result.stdout.strip() or "main"


def copy_and_commit_cif(src_cif: Path, locus_tag: str, dry_run: bool) -> str:
    """
    Copy the structure file into structures/af3/{LOCUS_TAG}/ in this repo
    and commit + push it. Returns the raw GitHub URL Mol* will load it from.
    """
    dest_dir = REPO_DIR / "structures" / "af3" / locus_tag
    dest_file = dest_dir / f"{locus_tag}_af3.cif"
    branch = get_current_branch()

    if not dry_run:
        dest_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_cif, dest_file)
        subprocess.run(["git", "add", str(dest_file)], cwd=REPO_DIR, check=True)

        # If this exact file is already committed (e.g. someone already ran
        # this protein through the pipeline before), there's nothing staged
        # and `git commit` would exit with an error even though nothing is
        # actually wrong. Skip straight to done in that case.
        nothing_staged = subprocess.run(
            ["git", "diff", "--cached", "--quiet"], cwd=REPO_DIR
        ).returncode == 0

        if nothing_staged:
            print(f"    (already committed — no changes for {locus_tag})")
        else:
            subprocess.run(
                ["git", "commit", "-m", f"data(af3): add CIF structure for {locus_tag}"],
                cwd=REPO_DIR, check=True,
            )
            subprocess.run(["git", "push"], cwd=REPO_DIR, check=True)
    else:
        print(f"    [dry-run] would copy {src_cif.name} -> {dest_file}")
        print(f"    [dry-run] would git add / commit / push to branch '{branch}'")

    return (
        f"https://raw.githubusercontent.com/khybiske/ChlamAtlas/{branch}/"
        f"structures/af3/{locus_tag}/{locus_tag}_af3.cif"
    )


# ── Helpers: Supabase ─────────────────────────────────────────────────────────

def get_protein_id(sb, locus_tag: str) -> Optional[str]:
    try:
        r = (
            sb.table("genes")
            .select("id, proteins(id)")
            .eq("locus_tag", locus_tag)
            .single()
            .execute()
        )
        proteins = r.data.get("proteins")
        if proteins is None:
            return None
        # Supabase returns a one-to-one relationship as a dict, not a list
        if isinstance(proteins, dict):
            return proteins["id"]
        if isinstance(proteins, list) and proteins:
            return proteins[0]["id"]
        return None
    except Exception as e:
        print(f"    lookup error: {e}")
        return None


def write_to_database(sb, protein_id: str, ptm_score: float, cif_url: str):
    sb.table("alphafold_results").upsert(
        {
            "protein_id": protein_id,
            "af_version": "AF3",
            "ptm_score": ptm_score,
            "mmcif_path": cif_url,
        },
        on_conflict="protein_id,af_version",
    ).execute()

    sb.table("proteins").update({"has_af3_structure": True}).eq("id", protein_id).execute()


# ── Main batch processor ──────────────────────────────────────────────────────

def process_batch(af3_dir: str, dry_run: bool = False, limit: Optional[int] = None):
    af3_path = Path(af3_dir)
    if not af3_path.is_dir():
        print(f"Not a directory: {af3_path}")
        return

    if not dry_run and get_current_branch() == "main":
        print("You're on the 'main' branch. GitHub blocks direct pushes to main.")
        print("Checkout your own branch first, e.g.:")
        print("    git checkout dev && git pull && git checkout -b your-branch-name")
        return

    folders = sorted(
        p for p in af3_path.iterdir()
        if p.is_dir() and not p.name.startswith(".")
    )
    if limit:
        folders = folders[:limit]

    print(f"Found {len(folders)} protein folder(s) in {af3_path.name}\n")

    sb = None
    if not dry_run:
        load_dotenv(ENV_FILE)
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not key:
            print(f"SUPABASE_SERVICE_KEY not found in {ENV_FILE}")
            print("   Create that file or run with --dry-run to skip DB writes.")
            return
        from supabase import create_client
        sb = create_client(SUPABASE_URL, key)
        print("Connected to Supabase\n")

    success, skipped, errors = 0, 0, 0

    for i, folder in enumerate(folders, 1):
        print(f"[{i}/{len(folders)}] {folder.name}")
        try:
            locus_tag = get_locus_tag(folder)
            ptm_score = get_ptm_score(folder)
            cif_file  = get_model0_cif(folder)

            print(f"  locus_tag : {locus_tag}")
            print(f"  ptm_score : {ptm_score}")
            print(f"  cif_file  : {cif_file.name if cif_file else 'NOT FOUND'}")

            if cif_file is None:
                print("  skipped: no model_0 structure file found")
                skipped += 1
                continue
            if ptm_score is None:
                print("  skipped: no PTM score found")
                skipped += 1
                continue

            if dry_run:
                print("  [dry-run] skipping DB lookup and GitHub push")
                success += 1
                continue

            protein_id = get_protein_id(sb, locus_tag)
            if protein_id is None:
                print(f"  skipped: {locus_tag} not found in the database")
                skipped += 1
                continue

            print(f"  protein_id: {protein_id}")
            cif_url = copy_and_commit_cif(cif_file, locus_tag, dry_run=False)
            write_to_database(sb, protein_id, ptm_score, cif_url)
            print(f"  done  PTM={ptm_score:.3f}")
            success += 1

        except Exception as e:
            print(f"  ERROR: {e}")
            errors += 1

        print()

    print("-" * 50)
    print(f"Done.  {success} succeeded  {skipped} skipped  {errors} errored")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load a folder of AF3 predictions into ChlamAtlas.")
    parser.add_argument("af3_dir", help="Path to a strain folder, e.g. '.../AF3 models/DUW3'")
    parser.add_argument("--dry-run", action="store_true", help="Parse files only; skip DB and GitHub")
    parser.add_argument("--limit", type=int, default=None, help="Process only the first N folders")
    args = parser.parse_args()

    process_batch(args.af3_dir, dry_run=args.dry_run, limit=args.limit)
