# data

Scripts that build and maintain the ChlamAtlas database. Most of them read from public sources (NCBI, UniProt, AlphaFold DB, PDB, STRING) or curated lab spreadsheets and write to Supabase. Scripts that write to the database need a `SUPABASE_SERVICE_KEY` in a local `.env` file, which is never committed.

| Area | Scripts |
|---|---|
| Genes and annotations | `import_genes.js`, `import_gene_coords.py`, `import_from_uniprot.js`, `import_detail_data.js`, `fetch_localization.js`, `fetch_sequences.js`, `apply_product_cleanup.js` |
| Expression | `compute_expression_pattern.js`, `compute_eb_rb_enriched.js` |
| Orthologs | `blast/run_blast.sh`, `export_strain_fasta.js`, `import_cpn_orthologs.js`, `fix_orthologs.py` |
| Structures | `generate_thumbnails.py`, `update_thumbnail_db.py`, `process_af3_batch.py`, `import_crystal_structures.js`, `import_cpn_alphafold_results.js` |
| Protein interactions | `import_string_ppi.py`, `import_mirrashidi_ppi.py`, `ppi_seed.sql` |
| Mutants | `import_mutants.py`, `import_cm_transposon.py`, `import_chimera_recomb.py` |
| Surveillance | `surveillance/` |
| Phylogeny (in development) | `phylogeny/` |
| Initial migration | `migrate.py` |
| One-off backfills and checks | `backfill_*`, `preview_product_cleanup.js`, `search_cpn_crystal_structures.js` |

The `*_invitro.png` images in this folder are mutant phenotype images. The database may link to them by URL, so their paths must not change.
