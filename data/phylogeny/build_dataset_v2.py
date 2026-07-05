#!/usr/bin/env python3
"""Build the combined 21-genome FASTA + metadata for the expanded ChlamAtlas
Phylogeny preview (10 existing Seattle strains + 11 new genomes spanning
Ocular, Male rectal, LGV, VO clade, and Non-Prevalent urogenital lineages,
cherry-picked from the lab's 2026 GWAS circular tree figure). See
docs/superpowers/specs/2026-07-04-phylogeny-expansion-design.md for the
full sourcing rationale.

5 of the 11 new genomes are fetched fresh from NCBI (same as the original
10). The other 6 are lab isolates not yet public — read from local FASTA
exports Kevin dropped in /genomes (repo-root-level, gitignored).
"""
import csv
import time
import urllib.request

EFETCH_URL = (
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
    "?db=nuccore&id={accession}&rettype=fasta&retmode=text"
)

# strain, serovar, tissue_source, year, clade, accession
NCBI_STRAINS = [
    ("D/UW-3/CX",   "D",  "Cervix",       "",     "",     "AE001273"),
    ("E/11023/cx",  "E",  "Cervix",       "2003", "",     "CP001890"),
    ("E/150/rec",   "E",  "Rectum",       "2007", "",     "CP001886"),
    ("E/Bour/cx",   "E",  "Cervix",       "1959", "",     "HE601870"),
    ("G/11222/cx",  "G",  "Cervix",       "2003", "",     "CP001888"),
    ("G/11074/rec", "G",  "Rectum",       "2003", "",     "CP001889"),
    ("G/9768/rec",  "G",  "Rectum",       "2002", "",     "CP001887"),
    ("H/SQ20/cx",   "H",  "Cervix",       "1991", "",     "CP017732"),
    ("J/6276/cx",   "J",  "Cervix",       "1997", "",     "ABYD01000001"),
    ("K/SQ15/cx",   "K",  "Cervix",       "1986", "",     "CP017745"),
    ("A/HAR-13/OC", "A",  "Ocular",       "",     "Ocular",                   "CP000051"),
    ("C/TW-3/OC",   "C",  "Ocular",       "",     "Ocular",                   "CP006945"),
    ("L2/434/Bu",   "L2", "Bubo",         "",     "LGV",                      "NC_010287"),
    ("L1/440/LN",   "L1", "Lymph node",   "",     "LGV",                      "HE601950"),
    ("Cm_Nigg",     "",   "",             "",     "Outgroup",                 "NC_002620"),
]

# strain, serovar, tissue_source, clade, source fasta file, source header prefix to replace (or None)
LOCAL_STRAINS = [
    ("Ga/300/MR",       "Ga", "Male rectal",   "Male rectal",               "genomes/Ga_300_MR.fasta",       None),
    ("Ga/Peru-1243/MR", "Ga", "Male rectal",   "Male rectal",               "genomes/G_Peru-1243_MR.fasta",  "G/Peru-1243/MR"),
    ("D/Su105/FR",      "D",  "Female rectal", "VO clade",                  "genomes/D_Su105_FR.fasta",      None),
    ("Da/199/CX",       "Da", "Cervix",        "VO clade",                  "genomes/Da_199_CX.fasta",       None),
    ("I/2097/CX",       "I",  "Cervix",        "Non-Prevalent urogenital",  "genomes/I_2097_CX.fasta",       None),
    ("K/61/MU",         "K",  "Male urethral", "Non-Prevalent urogenital",  "genomes/K_61_MU.fasta",         None),
]


def fetch_fasta_body(accession):
    with urllib.request.urlopen(EFETCH_URL.format(accession=accession)) as resp:
        text = resp.read().decode("utf-8")
    lines = text.strip().splitlines()
    assert lines[0].startswith(">"), f"Unexpected FASTA response for {accession}: {lines[0]!r}"
    return "\n".join(lines[1:])


def read_local_body(path, expected_header_prefix):
    with open(path) as fh:
        lines = fh.read().strip().splitlines()
    header = lines[0]
    assert header.startswith(">"), f"Unexpected FASTA header in {path}: {header!r}"
    if expected_header_prefix is not None:
        assert header[1:].startswith(expected_header_prefix), (
            f"{path}: expected header to start with {expected_header_prefix!r}, got {header!r}"
        )
    return "\n".join(lines[1:])


def main():
    with open("data/phylogeny/genomes_v2.fasta", "w") as fasta_out, \
         open("data/phylogeny/metadata_v2.tsv", "w", newline="") as meta_out:
        writer = csv.writer(meta_out, delimiter="\t")
        writer.writerow(["strain", "serovar", "tissue_source", "year", "clade", "accession"])

        for strain, serovar, tissue, year, clade, accession in NCBI_STRAINS:
            print(f"Fetching {strain} ({accession})...")
            body = fetch_fasta_body(accession)
            fasta_out.write(f">{strain}\n{body}\n")
            writer.writerow([strain, serovar, tissue, year, clade, accession])
            time.sleep(0.4)  # be polite to NCBI eutils

        for strain, serovar, tissue, clade, path, header_prefix in LOCAL_STRAINS:
            print(f"Reading {strain} from {path}...")
            body = read_local_body(path, header_prefix)
            fasta_out.write(f">{strain}\n{body}\n")
            writer.writerow([strain, serovar, tissue, "", clade, ""])


if __name__ == "__main__":
    main()
