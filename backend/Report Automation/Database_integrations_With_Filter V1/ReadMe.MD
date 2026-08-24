# 🧬 Germline + Somatic Variant Analysis Pipeline

A complete, modular bioinformatics pipeline for processing, integrating, filtering, and analyzing **germline** and **somatic** variant data from Excel files.

This pipeline is designed to be:

* ✅ Fully reproducible
* ✅ Config-driven (no hardcoding)
* ✅ Modular and scalable
* ✅ Easy to run with minimal setup

---

# 🚀 What This Pipeline Does

## 🔹 Germline Pipeline

* Reads variant data from Excel (`Variations` sheet)
* Performs classification using `CLIN_SIG`
* Matches variants against ClinGen database
* Highlights important hereditary genes
* Outputs categorized variant sheets

---

## 🔹 Somatic Pipeline

* Reads variant data from Excel (`Variations` sheet)
* Performs **liftover (hg38 → hg19)**
* Integrates multiple databases:

  * ClinGen
  * IntOGen
  * OncoKB
  * TCGA
  * Cancer Hotspot
  * CIVIC
* Applies **Somamut filtering**
* Highlights important somatic genes
* Generates summary and filtered outputs

---

# 📁 Project Structure

```
project_root/
│
├── config.py                     # Central configuration (ALL paths defined here)
├── requirements.txt              # Python dependencies
│
├── Input/
│   ├── germline/                 # Input files for germline pipeline
│   └── somatic/                  # Input files for somatic pipeline
│
├── Output/
│   ├── germline/                 # Germline results
│   └── somatic/                  # Somatic results
│
├── GERMLINE/
│   ├── germline.py               # Germline processing logic
│   └── Clingen Database_Germline.csv
│
├── SOMATIC/
│   ├── Master_Script_7.py        # Main somatic integration pipeline
│   ├── Somamut_Post_Filter.py    # Post-processing + filtering
│   │
│   ├── Modules/                 # Integration modules
│   │   ├── clingen.py
│   │   ├── intogen.py
│   │   ├── oncokb.py
│   │   ├── tcga.py
│   │   ├── cancer_hotspot.py
│   │   ├── civic.py
│   │   └── liftover_utils.py
│   │
│   └── Databases/               # All somatic databases
│       ├── Cingen_Somatic.csv
│       ├── OncoKB.csv
│       ├── Intogen 2023/
│       ├── TCGA/
│       ├── Cancer_hotspot/
│       ├── CIVIC/
│       └── Somamut/
│
├── germline_pipeline.py         # Runs germline pipeline
├── somatic_pipeline.py          # Runs somatic pipeline
├── run_all_pipeline.py          # Runs both pipelines
│
└── Somatic and germline important gene list.xlsx
```

---

# ⚙️ Installation

## 1. Create Virtual Environment

```bash
python -m venv venv
source venv/bin/activate
```

---

## 2. Install Dependencies

```bash
pip install -r requirements.txt
```

---

# ⚠️ System Requirements (IMPORTANT)

The following tools must be installed manually:

### 🔹 Required Tools

* `wget`
* UCSC `liftOver` tool

### 🔹 Setup Instructions

Download liftOver:

```bash
wget http://hgdownload.soe.ucsc.edu/admin/exe/linux.x86_64/liftOver
chmod +x liftOver
```

Ensure it is accessible:

```bash
export PATH=$PATH:/path/to/liftOver
```

---

# 📥 Input Format

## 📂 Location

Place files inside:

```
Input/germline/
Input/somatic/
```

---

## 📄 Excel Requirements

Each input file must contain:

### Required Sheet

```
Variations
```

---

## 🔹 Germline Required Column

* `CLIN_SIG`

---

## 🔹 Somatic Required Columns (expected)

* `HGVSc`
* `HGVSp`
* `Gene`
* `SYMBOL`
* `CHROM`
* `POS`
* `REF`
* `ALT`

---

# 🚀 How to Run

## ▶️ Run Germline Pipeline

```bash
python germline_pipeline.py
```

---

## ▶️ Run Somatic Pipeline

```bash
python somatic_pipeline.py
```

---

## ▶️ Run Full Pipeline

```bash
python run_all_pipeline.py
```

---

# 📤 Output

Results are saved in:

```
Output/germline/
Output/somatic/
```

---

## 🧾 Output Includes

* Original data
* Database integration results
* Filtered variants (Somamut)
* Highlighted important genes
* Run summary

---

# 🔬 Pipeline Flow

## Germline

```
Input → Variations → Classification → ClinGen → Gene Highlighting → Output
```

---

## Somatic

```
Input → Variations → Liftover → Database Integration → Filtering → Highlighting → Output
```

---

# ⚠️ Important Notes

* Linux paths are **case-sensitive**

  * `SOMATIC` ≠ `somatic`
* Do not modify folder structure unless updating `config.py`
* All database files must exist in `SOMATIC/Databases/`
* Sheet name is controlled via `config.py`

---

# 🧪 Validation (Recommended)

Before using results:

* Compare outputs with previous validated pipeline
* Check row counts and matches
* Verify critical sheets (ClinGen, OncoKB, etc.)

---

# 🧠 Design Principles

This pipeline follows:

* Centralized configuration (`config.py`)
* Modular architecture (each database isolated)
* Reproducible execution
* Clear separation of germline and somatic workflows

---

# 👨‍💻 Author

Developed as a structured, scalable pipeline for genomic variant analysis.

---

# ✅ Status

✔ Fully implemented
✔ Tested
✔ Ready for use
