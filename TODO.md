# ChlamAtlas — Notes & Todo

## Up Next (in order)

1. **Users** — auth UI polish + role request flow + admin user management (see plan below)
2. **Ortholog data validation** — CT119 (CT-D) does not show reciprocal orthologs when navigated to; likely a row direction issue in orthologs table (gene_id_a/gene_id_b pairing); investigate query and/or data
2. **Product field cleanup** — review all Product entries across 2,687 genes for repetition, redundancy, and clarity; some UniProt entries have verbose/duplicated text that should be simplified; this is a data editing task
3. **Cell Localization module** — wire `<sib-swissbiopics-sl>` web component; requires `subcellular_location_sl` data in proteins table; taxid 813 for C. trachomatis; complete gene detail before moving to other areas
4. **Structure module** — multiple components/sources (Crystal, AFv3, AFv2, Mol* viewer); full brainstorm + design needed; complete gene detail before moving to other areas
5. **Gene detail editing** — inline editing of gene/protein fields; will require auth-gated UI (lab member / admin only); brainstorm + design needed
6. **Home page visual review** — some graphical elements are incomplete; review before sharing publicly; do before Mutants because changes may have trickle-down effects across pages
7. **Mutants tab — list view** — near-reskin of Genomes list; Collections: CT/L2, CM, Lucky 17, Chimeras; `is_published` RLS enforcement critical
8. **Mutant detail page** — brainstorm + design + implement (genotyping, phenotypes, images, pipeline stage)
9. **Pipeline tab** — multi-lab workflow view + per-mutant progress dots; needs brainstorm

## Backlog

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

## Users — Plan

**Already built (no work needed):**
- Sign-in modal (email + password) ✅
- Session state (`state.user`, `state.userRole`) ✅
- Role loading from `users` table ✅
- Pipeline tab gated by `lab_member`/`admin` ✅
- RLS policies for all three tiers (public / lab_member / admin) ✅
- `role_request` column on `users` table exists ✅

**What needs to be built:**
1. **User dropdown** — clicking "Hello, [name]" in nav opens a small panel showing display name, role badge (Community / Lab Member / Admin), lab affiliation, and a Sign Out button
2. **Sign-up flow** — currently only sign-in exists; new users need a way to create an account (open registration is fine; role defaults to `community`)
3. **Role request** — community users see a "Request lab access" button in their dropdown; submitting sets `users.role_request = 'lab_member'`; Kevin gets notified (email or in-app)
4. **Admin user panel** — Kevin can see all users, their roles, pending role requests, approve/deny with one click; accessible via admin-only nav item or via the user dropdown

## Done

- [x] Schema — 17 tables, RLS policies, seed data, 3 test users
- [x] Nav chrome + app shell — dark green nav, Cormorant Garamond wordmark, mobile bottom nav, hash routing
- [x] Home tab — full-bleed hero, 5-stat bar, strain portal cards, updates feed, citation modal
- [x] Genomes tab — gene list with category color bars, filters, infinite scroll, favorites, sort, search autocomplete
- [x] Gene detail panel — full build + polish (2026-04-07 through 2026-05-03): hero, gene info + organism field, orthologs 2-col grid, genomic context SVG map, protein section with product/localization tags/subunit structure, transcriptomics, EB/RB proteomics with icons, structure tabs + lazy Mol*, cell localization placeholder, brand-green section headers, clickable hero badges, gene list auto-scroll
- [x] Genes imported — 2,687 rows (CT-L2: 878, CT-D: 895, CM: 914) with product + sort_index
- [x] Data import — proteins (2687), alphafold_results (2688), expression_data (6885), orthologs (2516)
