# ChlamAtlas — Notes & Todo

## Up Next

- [ ] **Ortholog data validation** — CT119 (CT-D) does not show reciprocal orthologs when navigated to; likely a data pairing issue in the orthologs table; investigate and fix
- [ ] **Mutants tab — list view** — near-reskin of Genomes list; Collections: CT/L2, CM, Lucky 17, Chimeras; `is_published` RLS enforcement critical

## Backlog

- [ ] **Mutant detail page** — brainstorm + design + implement (genotyping, phenotypes, images, pipeline stage)
- [ ] **Pipeline tab** — multi-lab workflow view + per-mutant progress dots; needs brainstorm
- [ ] **SwissBioPics cell localization** — wire `<sib-swissbiopics-sl>` web component when `subcellular_location_sl` data available in proteins table; taxid 813 for C. trachomatis
- [ ] **Home page visual review** — some graphical elements are incomplete; review before showing publicly
- [ ] **Connect domain** — chlamatlas.org → Vercel
- [ ] **Icon / favicon branding**
- [ ] **Mobile tab bar for gene detail** — currently falls back to desktop layout on mobile; needs dedicated tab bar (Gene | Protein | Expression | Structure)
- [ ] **user_favorites DB table** — promote localStorage stopgap to Supabase `user_favorites` table with RLS (Phase 2, before sharing with lab members)

## Ideas / Maybe Later

- [ ] **Localization tag click-to-filter** — clicking a localization tag filters gene list by that term; requires joining proteins table into gene list query (architecture change, deferred)
- [ ] Full-text search (global nav bar) — genes, proteins, mutants
- [ ] Interactive expression chart cross-strain toggle (CT-D + CT-L2 ortholog comparison on same chart)
- [ ] Admin dashboard — user management, bug triage, feature requests
- [ ] Evidence-based annotation submission (PubMed ID required)
- [ ] Downloadable FASTA sequences per gene/protein
- [ ] API endpoints for programmatic access
- [ ] Additional strain support — C. pneumoniae, ocular CT, rectal CT

## Done

- [x] Schema — 17 tables, RLS policies, seed data, 3 test users
- [x] Nav chrome + app shell — dark green nav, Cormorant Garamond wordmark, mobile bottom nav, hash routing
- [x] Home tab — full-bleed hero, 5-stat bar, strain portal cards, updates feed, citation modal
- [x] Genomes tab — gene list with category color bars, filters, infinite scroll, favorites, sort, search autocomplete
- [x] Gene detail panel — full polish pass (2026-05-03): hero, gene info, orthologs 2-col grid, genomic context SVG map, protein section, transcriptomics, EB/RB proteomics, structure tabs + lazy Mol*, cell localization placeholder
- [x] Gene detail — aesthetic session (2026-05-03): structure thumbnails in list + hero, EB/RB icons, genomic map spacing + stagger, filter bar with promoted active filters, clickable hero badges, search autocomplete, brand-green section headers, product → protein panel, localization as pill tags, subunit structure field, organism field, auto-scroll gene list on navigation
- [x] Genes imported — 2,687 rows (CT-L2: 878, CT-D: 895, CM: 914) with product + sort_index
- [x] Data import — proteins (2687), alphafold_results (2688), expression_data (6885), orthologs (2516)
