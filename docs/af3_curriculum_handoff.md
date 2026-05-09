# AF3 Data Workflow — Summer Curriculum Handoff

**For:** Claude (claude.ai), to guide a high school student through learning terminal, Python, and git in order to complete a real bioinformatics data pipeline.

**Prepared by:** Kevin Hybiske (Hybiske Lab, University of Washington), with assistance from Claude Code.

---

## Context

The Hybiske Lab studies *Chlamydia* — an intracellular bacterial pathogen. We are building **ChlamAtlas** (chlamatlas.org), a model organism database for the Chlamydia research community. The database stores genomic, proteomic, structural, and mutant data for three *Chlamydia* strains.

Kevin's son (high school junior, no prior coding or terminal experience) will spend part of his summer contributing to ChlamAtlas as a hands-on research experience. The project: writing Python scripts that process AlphaFold v3 protein structure prediction files and upload them to the database.

This document provides everything Claude needs to:
1. Design a structured curriculum
2. Understand the technical end goal precisely
3. Guide the student through each phase with appropriate exercises

---

## The End Goal

AlphaFold v3 (AF3) is a deep learning model from Google DeepMind that predicts the 3D structure of proteins from their amino acid sequence. Kevin generates AF3 predictions for all ~1,000 *Chlamydia* proteins using the [AlphaFold server](https://alphafoldserver.com).

**The student's task is to write Python scripts that:**

1. **Unzip** AF3 output ZIP files downloaded from the AlphaFold server
2. **Extract** the CIF file (the 3D structure file) and the JSON file (which contains confidence scores)
3. **Parse** key metrics from the JSON: the `ptm` score (predicted TM-score, overall model quality) and per-residue `plddt` values
4. **Move** the CIF file to the correct location in the GitHub repository
5. **Commit and push** the CIF file to GitHub via the terminal (or via a subprocess call in Python)
6. **Upsert** a row into the Supabase database with the CIF file's GitHub URL and the parsed scores

When complete, ChlamAtlas will display these structures in its interactive 3D viewer (Mol*) for researchers worldwide.

---

## Technical Details: ChlamAtlas Infrastructure

### The database (Supabase/PostgreSQL)

ChlamAtlas uses Supabase (a hosted PostgreSQL database with a REST API). The student will interact with it via the Supabase Python library.

**Supabase project:**
- URL: `https://ihobumwetoidqioifknt.supabase.co`
- The service role key (needed for upserts) will be provided by Kevin separately — do not include in any scripts committed to GitHub.

**Relevant tables:**

`genes` — one row per gene (e.g., CTL0001, CTL0002...)
- `id` (UUID) — primary key
- `locus_tag` (text) — e.g., `CTL0001`, `CT633`, `TC0001`
- `strain_id` (UUID FK → strains)

`proteins` — one row per protein (not all genes have protein rows)
- `id` (UUID) — primary key
- `gene_id` (UUID FK → genes)
- `uniprot_id` (text) — e.g., `Q3KLB1`
- `has_af3_structure` (boolean) — should be set to true after uploading

`alphafold_results` — one row per structure prediction (a protein can have multiple: AF2, AF3, crystal)
- `id` (UUID)
- `protein_id` (UUID FK → proteins)
- `af_version` (text) — always `'AF3'` for our purposes
- `mmcif_path` (text) — GitHub raw URL to the CIF file
- `thumbnail_path` (text) — GitHub raw URL to a thumbnail image (optional)
- `top_homolog_pdb_id` (text) — e.g., `7ABC` (from AF3 JSON, if present)
- `top_homolog_description` (text)
- `homology_score` (numeric)
- `homology_method` (text) — e.g., `'alphafold3'`
- `inferred_function` (text)
- `ptm_score` (numeric) — the overall model confidence (0–1 scale; >0.8 = high confidence)

### The GitHub repository

CIF files are stored in the GitHub repo and served as static files via raw.githubusercontent.com URLs.

**Repository:** `https://github.com/khybiske/ChlamAtlas`

**Convention for CIF file paths** (to be decided and standardized with Kevin):
```
structures/af3/<locus_tag>/<locus_tag>_af3.cif
```
Example: `structures/af3/CTL0001/CTL0001_af3.cif`

**Raw URL format:**
```
https://raw.githubusercontent.com/khybiske/ChlamAtlas/main/structures/af3/CTL0001/CTL0001_af3.cif
```

### AlphaFold v3 ZIP file contents

When you download a prediction from the AlphaFold server, you get a ZIP file. Inside it:
```
fold_ctl0001_<jobid>/
  fold_ctl0001_<jobid>_model.cif          ← the 3D structure (what we want)
  fold_ctl0001_<jobid>_summary_confidences.json  ← contains ptm score
  fold_ctl0001_<jobid>_full_data.json     ← per-residue plddt (very large)
  fold_ctl0001_<jobid>_job_request.json   ← job metadata
```

**Parsing the summary_confidences JSON:**
```json
{
  "ptm": 0.847,
  "iptm": null,
  "ranking_score": 0.847,
  "fraction_disordered": 0.12,
  ...
}
```
The `ptm` field is the key metric — it is a number between 0 and 1. Values above 0.8 indicate a high-confidence prediction.

---

## The Scripts to Build (in order)

The student will build these incrementally:

### Script 1: `explore_zip.py`
Just unzip a file and print what's inside. Learn: `zipfile` module, `os.path`, `print`.

### Script 2: `parse_af3_scores.py`
Open the summary JSON and extract the `ptm` score. Learn: `json` module, dictionary access, `float`.

### Script 3: `extract_cif.py`
Given a ZIP file and a locus tag, extract the CIF to the correct output folder. Learn: file paths, `shutil`, string formatting, function definitions.

### Script 4: `git_push.py` (optional / stretch)
Use `subprocess` to call `git add`, `git commit`, `git push` from Python. Or the student does this manually from the terminal — either works.

### Script 5: `upsert_to_supabase.py`
Connect to Supabase, look up the `protein_id` for a given locus_tag, and upsert an `alphafold_results` row. Learn: `pip install supabase`, API calls, dictionaries, error handling.

### Script 6: `process_af3_batch.py` (the full pipeline)
Loop over a folder of ZIP files, call the above functions for each one, and report a summary. Learn: `os.listdir`, loops, error handling, logging.

---

## Curriculum Structure

### Phase 0: Setup (Day 1)
**Goal:** Get the tools installed and working.

Topics:
- What is the Terminal / why do programmers use it
- Opening Terminal on Mac
- Basic navigation: `pwd`, `ls`, `cd`, `mkdir`
- What is a text editor — install VS Code
- Install Python via Homebrew: `brew install python3`
- Verify: `python3 --version`
- What is `pip` — install the supabase library: `pip3 install supabase`

Milestone: Student can open Terminal, navigate to a folder, and run `python3 --version` successfully.

---

### Phase 1: Terminal Fundamentals (Days 2–4)
**Goal:** Be comfortable navigating the file system and running commands.

Topics:
- File system as a tree (directories and files)
- `ls -la`, `cd ..`, `cd ~`, tab completion
- Creating and moving files: `touch`, `mv`, `cp`, `rm` (with caution!)
- Reading files: `cat`, `less`
- Running a Python script: `python3 myscript.py`
- What is a path (absolute vs relative)

Exercises:
1. Create a folder called `summer_project` in your home directory
2. Inside it, create `data/`, `scripts/`, `output/` folders
3. Create a file called `hello.py` with `print("Hello, Chlamydia!")` and run it
4. Use `ls -la` to inspect the folder structure

Milestone: Student can create a Python script, run it, and navigate around the file system confidently.

---

### Phase 2: Python Fundamentals (Days 5–10)
**Goal:** Write simple Python programs that manipulate data.

Topics (build each as a small exercise):
- Variables and types: `str`, `int`, `float`, `bool`
- `print()` with f-strings: `f"The ptm score is {score}"`
- `input()` — get data from the user
- `if` / `elif` / `else`
- Lists: `[1, 2, 3]`, indexing, `append`, `len`
- Dictionaries: `{"key": "value"}`, accessing keys, `.get()`
- `for` loops: iterating over a list
- Functions: `def`, parameters, `return`
- Reading a text file: `open()`, `.read()`, `.readlines()`

Science connection (keep it motivated!):
- Every time a new concept is introduced, frame it in terms of proteins/genes
- Example for dictionaries: "A dictionary is like a database row — each key is a column name"
- Example for loops: "We have 878 CTL genes. We'll loop over all of them"

Exercises:
1. Write a function `classify_ptm(score)` that returns "high confidence", "medium", or "low" based on thresholds (>0.8, >0.5, else)
2. Given a list of locus tags, loop through and print each one with its index number
3. Read a text file line by line and count how many lines it has

Milestone: Student can write a multi-function Python script that reads a file and processes data.

---

### Phase 3: Working with Files and JSON (Days 11–14)
**Goal:** Unzip AF3 files and parse the JSON scores.

Topics:
- What is a ZIP file — the `zipfile` module
- `zipfile.ZipFile`, `.namelist()`, `.extract()`, `.read()`
- What is JSON — the `json` module
- `json.loads()`, `json.load()`, accessing nested keys
- `os` and `pathlib` for file paths
- `os.path.join()`, `Path()`, `.stem`, `.suffix`

Exercises:
1. Write a script that unzips a test ZIP file and prints the names of all files inside
2. Open the `summary_confidences.json` and print the `ptm` value
3. Write a function `get_ptm_from_zip(zip_path)` that does both steps and returns the score

Science connection: "This is exactly what bioinformaticians do — parse output files from computational tools and extract the numbers that matter."

Milestone: Given a real AF3 ZIP, the student's script prints the locus tag and ptm score.

---

### Phase 4: Git and GitHub (Days 15–17)
**Goal:** Understand version control enough to commit and push the CIF files.

Topics:
- What is version control and why scientists use it
- `git init`, `git clone`
- `git status`, `git add`, `git commit -m "message"`, `git push`
- What is a branch (conceptual — don't need to use it)
- `.gitignore` — what to never commit (passwords, huge files)
- GitHub as a file host — raw URL format

Important: Emphasize that the API key / Supabase service role key must NEVER be committed. Use a `.env` file and `.gitignore`.

Exercises:
1. Clone the ChlamAtlas repo: `git clone https://github.com/khybiske/ChlamAtlas`
2. Create a test file inside `structures/af3/test/`, commit it, push it
3. Verify the raw URL works in a browser

Milestone: Student can add a file to the repo and push it to GitHub.

---

### Phase 5: API Calls and Supabase (Days 18–21)
**Goal:** Connect to the database and upsert a row.

Topics:
- What is an API (the restaurant analogy: you order, the kitchen responds)
- What is a REST API, what is JSON
- Installing the `supabase` Python library
- Environment variables: `os.environ.get()`, `python-dotenv`
- The `.env` file pattern (and why it's in `.gitignore`)
- Basic Supabase queries: `.select()`, `.eq()`, `.upsert()`

Database context (give Claude this so it can explain accurately):
```python
from supabase import create_client

# Connect
sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Look up a protein by locus tag
result = sb.table('genes').select('id, proteins(id)').eq('locus_tag', 'CTL0001').single().execute()
gene_id = result.data['id']
protein_id = result.data['proteins']['id']

# Upsert an alphafold_results row
sb.table('alphafold_results').upsert({
    'protein_id': protein_id,
    'af_version': 'AF3',
    'mmcif_path': 'https://raw.githubusercontent.com/khybiske/ChlamAtlas/main/structures/af3/CTL0001/CTL0001_af3.cif',
    'ptm_score': 0.847,
    'homology_method': 'alphafold3',
}, on_conflict='protein_id,af_version').execute()

# Update has_af3_structure flag on proteins table
sb.table('proteins').update({'has_af3_structure': True}).eq('id', protein_id).execute()
```

Exercises:
1. Create a `.env` file with the Supabase URL and key; write a script that connects and prints the count of genes
2. Look up a protein by locus tag and print its UniProt ID
3. Upsert a test alphafold_results row for a single gene; verify in the Supabase dashboard

Milestone: Student can successfully upsert a row to the database.

---

### Phase 5.5: these are thoughts from **Kevin**, inserted after claude code wrote this md for me
**Goal:** Introduce what ChlamAtlas is and how this project fits into things

Give overview of the central dogma: DNA, RNA, protein
Present examples for why protein sequences (historically) gives us no insight into function by itself
Protein structure *does* inform function
X-ray crystallography as true structure, how it is done, what the end product is
Introduce protein tertiary structural models and general features (backbone, domains, helices, etc)
Monomers often interact (hetero/homo-mers, multiprotein complexes)
Why structure knowledge is important -- why we care
The computational structure prediction revolution
Google’s alphafold and why we use it; has recently been the best algorithm
Then explain the project overview and goal


### Phase 6: The Full Pipeline (Days 22–28)
**Goal:** Process a batch of AF3 ZIP files end-to-end.

Combine all previous scripts into `process_af3_batch.py`:

```python
# Pseudocode for the full pipeline
for zip_file in os.listdir(input_folder):
    locus_tag = extract_locus_tag_from_filename(zip_file)
    ptm_score = parse_ptm_from_zip(zip_file)
    cif_destination = copy_cif_to_repo(zip_file, locus_tag)
    github_url = build_github_url(locus_tag)
    upsert_to_supabase(locus_tag, github_url, ptm_score)
    print(f"✅ {locus_tag}: ptm={ptm_score:.3f}")
```

Topics:
- Error handling: `try` / `except` — what happens when a file is malformed?
- Logging: write a summary CSV of what was processed
- `argparse` for command-line arguments (stretch goal)

Milestone: Run the script on 10 real AF3 ZIPs. Verify the structures appear on chlamatlas.org.

---

## Instructional Guidance for Claude

### About the student
- High school junior, no prior terminal, coding, or git experience
- Strong science background (research family environment)
- Motivated by the real-world application — emphasize that this is real science code
- May get frustrated with abstract concepts; always anchor to the biological context

### Pacing recommendations
- Don't rush Phase 2 (Python fundamentals). A solid foundation here makes everything downstream easier.
- It's fine to spend extra time on any phase. The curriculum is a guide, not a deadline.
- Short sessions (45–60 min) are better than marathon sessions
- Each session should end with something that runs and produces output

### How to handle errors
- When the student hits an error, ask them to paste the full error message
- Teach them to read error messages (they're designed to be helpful)
- Celebrate errors — "This is exactly what debugging is. Every professional programmer spends most of their time doing this."

### Common pitfalls to warn about
- Indentation in Python (tabs vs spaces) — VS Code will help
- Forgetting to save the file before running it
- `print()` vs just typing the expression — in a script, you need `print()`
- File paths with spaces in folder names
- Never commit the `.env` file or API keys

### Motivational context to share
- This script will be used to populate a database used by Chlamydia researchers worldwide
- The structures the student uploads will be visible to other scientists on chlamatlas.org
- This is a real contribution to published science — Kevin's lab is writing a paper about ChlamAtlas
- The student is doing the same type of work as a bioinformatics research assistant

---

## Reference: ChlamAtlas Gene Naming Conventions

| Strain | Locus tag format | Example |
|--------|-----------------|---------|
| CT L2/434 | CTL0001–CTL0878 | CTL0001 |
| CT D/UW-3 | CT001–CT875 | CT633 |
| CM Nigg | TC0001–TC0756 | TC0001 |

AF3 predictions currently exist only for the CT L2/434 strain (the primary experimental strain).

---

## Sample AF3 File Naming

AF3 job names on the server follow the convention Kevin uses when submitting:
- Job name: `ctl0001` (lowercase locus tag)
- ZIP filename from server: `fold_ctl0001_<jobid>.zip`
- CIF filename inside ZIP: `fold_ctl0001_<jobid>_model.cif`
- JSON filename inside ZIP: `fold_ctl0001_<jobid>_summary_confidences.json`

The script should extract the locus tag from the ZIP filename (everything between `fold_` and the next `_`).

---

## Environment Setup Checklist

Before the student begins, Kevin should ensure:
- [ ] Mac has Homebrew installed (`brew --version`)
- [ ] Python 3 installed (`python3 --version`)
- [ ] VS Code installed (code.visualstudio.com)
- [ ] GitHub account exists (or use Kevin's under supervision)
- [ ] Git configured: `git config --global user.name "..."` and `git config --global user.email "..."`
- [ ] ChlamAtlas repo cloned locally
- [ ] Supabase service role key provided (written down, not emailed — it's sensitive)
- [ ] A folder of ~10 test AF3 ZIPs ready for the student to process

---

*This document was prepared 2026-05-09. Contact Kevin Hybiske (khybiske@uw.edu) with questions about the ChlamAtlas data model or project goals.*
