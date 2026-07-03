#!/usr/bin/env bash
# Runs reciprocal BLASTP between Cpn and each of CT-D, CT-L2, CM.
# Prerequisite: brew install blast (blastp, makeblastdb on PATH)
# Prerequisite: node data/export_strain_fasta.js already run (FASTA files present)
set -euo pipefail

cd "$(dirname "$0")"  # data/blast/
FASTA_DIR="fasta"
DB_DIR="db"
OUT_DIR="hits"

mkdir -p "$DB_DIR" "$OUT_DIR"

STRAINS=("Cpn" "CT-D" "CT-L2" "CM")

echo "Building BLAST databases..."
for strain in "${STRAINS[@]}"; do
  makeblastdb -in "$FASTA_DIR/${strain}.fasta" -dbtype prot -out "$DB_DIR/${strain}" -logfile "$DB_DIR/${strain}.log"
  echo "  ${strain} db built"
done

OTHER_STRAINS=("CT-D" "CT-L2" "CM")
OUTFMT="6 qseqid sseqid pident length qlen slen qstart qend bitscore"

echo "Running BLASTP searches..."
for strain in "${OTHER_STRAINS[@]}"; do
  echo "  Cpn -> ${strain}"
  blastp -query "$FASTA_DIR/Cpn.fasta" -db "$DB_DIR/${strain}" -evalue 1e-5 -outfmt "$OUTFMT" -out "$OUT_DIR/Cpn_vs_${strain}.tsv" -max_target_seqs 5
  echo "  ${strain} -> Cpn"
  blastp -query "$FASTA_DIR/${strain}.fasta" -db "$DB_DIR/Cpn" -evalue 1e-5 -outfmt "$OUTFMT" -out "$OUT_DIR/${strain}_vs_Cpn.tsv" -max_target_seqs 5
done

echo "Done. Hit files in $OUT_DIR/"
wc -l "$OUT_DIR"/*.tsv
