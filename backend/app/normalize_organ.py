"""
app/utils/normalize_organ.py

Normalizes free-text organ_type values into canonical organ names (no "cancer" suffix).
Apply on every write path — manual save and bulk upload — to keep the DB clean.
"""

# Irregular mappings that can't be handled by simple suffix stripping
_SYNONYM_MAP = {
    "Lung":             ["Lung  cancer", "Lung cancer"],
    "Bladder":          ["Bladder cancer", "Bladder Cancer"],
    "Cervical":         ["Cervical cancer", "Cervical Cancer"],
    "Breast":           ["Breast cancer"],
    "Prostate":         ["Prostate cancer", "Prostate Cancer"],
    "Kidney":           ["Kidney cancer"],
    "Liver":            ["Liver cancer"],
    "Pancreas":         ["Pancreas cancer"],
    "Endometrium":      ["Endometrial cancer"],
    "Ovary":            ["Ovarian cancer"],
    "Head & Neck":      ["Head & Neck cancer", "Head", "Neck"],
    "Eye":              ["Eye cancer"],
    "Colon":            ["Colon cancer", "CRC"],
    "Salivary gland":   ["Salivary gland cancer"],
    "Uterus":           ["Uterus cancer"],
    "Gastroesophageal": ["Gastroesophageal cancer"],
    "Gastrointestinal": ["Gastrointestinal cancer"],
    "Stomach":          ["Stomach cancer"],
    "Thyroid":          ["Thyroid cancer"],
    "Testicular":       ["Testicular cancer"],
    "Brain":            ["Brain cancer"],
    "Blood":            ["Blood cancer"],
    "Gall Bladder":     ["Gall Bladder cancer"],
    "Neuroendocrine gland": ["Neuroendocrine gland cancer"],
    "Duodenum":         ["Duodenum cancer"],
    "Esophagus":        ["Esophagus cancer"],
    "Anal Canal":       ["Anal Canal cancer"],
    "Adnexael":         ["Adnexael cancer"],
    "Perianal":         ["Perianal cancer"],
}

# Build flat lookup: raw → canonical
_LOOKUP = {}
for canonical, variants in _SYNONYM_MAP.items():
    for variant in variants:
        _LOOKUP[variant] = canonical


def normalize_organ_type(raw: str | None) -> str | None:
    """
    Normalize a raw organ_type string to its canonical form.

    Steps:
      1. Strip leading/trailing whitespace, collapse internal spaces.
      2. Strip trailing '?' characters.
      3. Look up in synonym map (exact match).
      4. Return cleaned value as-is if no match found.
    """
    if not raw:
        return raw

    # Step 1 — clean whitespace
    cleaned = " ".join(raw.strip().split())

    # Step 2 — strip trailing question marks
    cleaned = cleaned.rstrip("?").strip()

    if not cleaned:
        return None

    # Step 3 — synonym lookup
    if cleaned in _LOOKUP:
        return _LOOKUP[cleaned]

    # Step 4 — return as-is
    return cleaned