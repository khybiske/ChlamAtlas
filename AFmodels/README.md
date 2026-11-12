# AFmodels

Rendered AlphaFold structure thumbnails (PNG), one per protein, named by locus tag. ChlamAtlas uses these as the structure icons in gene lists and on gene pages.

| Folder | Strain |
|---|---|
| `DUW3/` | *C. trachomatis* D/UW-3 |
| `L2/` | *C. trachomatis* L2/434 |
| `CM/` | *C. muridarum* Nigg |
| `Cpn/` | *C. pneumoniae* TW-183 |

The site loads these files by URL, so file paths must not change. Thumbnails are generated with `data/generate_thumbnails.py`.
