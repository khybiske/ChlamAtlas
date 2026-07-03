#!/usr/bin/env python3
"""Fetch the 10 real-genome ChlamAtlas Phylogeny demo strains from NCBI.

Source: Table S1, Suchland et al. 2022, "Genomic Analysis of MSM Rectal
Chlamydia trachomatis Isolates" (PMC9670952) — the Hybiske Lab's own
published genome collection. Only strains with already-assembled GenBank
accessions are included (the rest of the table's Seattle/Peru strains are
raw SRA reads only, not usable without running our own assembly).
"""
import csv
import time
import urllib.request

EFETCH_URL = (
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
    "?db=nuccore&id={accession}&rettype=fasta&retmode=text"
)

# strain, serovar, tissue_source, year, accession
STRAINS = [
    ("D/UW-3/CX",   "D", "Cervix", "",     "AE001273"),
    ("E/11023/cx",  "E", "Cervix", "2003", "CP001890"),
    ("E/150/rec",   "E", "Rectum", "2007", "CP001886"),
    ("E/Bour/cx",   "E", "Cervix", "1959", "HE601870"),
    ("G/11222/cx",  "G", "Cervix", "2003", "CP001888"),
    ("G/11074/rec", "G", "Rectum", "2003", "CP001889"),
    ("G/9768/rec",  "G", "Rectum", "2002", "CP001887"),
    ("H/SQ20/cx",   "H", "Cervix", "1991", "CP017732"),
    ("J/6276/cx",   "J", "Cervix", "1997", "ABYD01000001"),
    ("K/SQ15/cx",   "K", "Cervix", "1986", "CP017745"),
]


def fetch_fasta_body(accession):
    with urllib.request.urlopen(EFETCH_URL.format(accession=accession)) as resp:
        text = resp.read().decode("utf-8")
    lines = text.strip().splitlines()
    assert lines[0].startswith(">"), f"Unexpected FASTA response for {accession}: {lines[0]!r}"
    return "\n".join(lines[1:])


def main():
    with open("data/phylogeny/genomes.fasta", "w") as fasta_out, \
         open("data/phylogeny/metadata.tsv", "w", newline="") as meta_out:
        writer = csv.writer(meta_out, delimiter="\t")
        writer.writerow(["strain", "serovar", "tissue_source", "year", "accession"])
        for strain, serovar, tissue, year, accession in STRAINS:
            print(f"Fetching {strain} ({accession})...")
            body = fetch_fasta_body(accession)
            fasta_out.write(f">{strain}\n{body}\n")
            writer.writerow([strain, serovar, tissue, year, accession])
            time.sleep(0.4)  # be polite to NCBI eutils


if __name__ == "__main__":
    main()
