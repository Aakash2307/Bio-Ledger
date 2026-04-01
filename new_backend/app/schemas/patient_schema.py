from pydantic import BaseModel
from typing import Optional


# ── PATIENT ───────────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    patient_id: str
    aob_id: Optional[str] = None
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    detail_disease: Optional[str] = None
    organ_type: Optional[str] = None
    comorbidity: Optional[str] = None
    family_history: Optional[str] = None
    metastasis: Optional[str] = None
    patient_status: Optional[str] = None
    consultation: Optional[str] = None


class PatientUpdate(BaseModel):
    aob_id: Optional[str] = None
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    detail_disease: Optional[str] = None
    organ_type: Optional[str] = None
    comorbidity: Optional[str] = None
    family_history: Optional[str] = None
    metastasis: Optional[str] = None
    patient_status: Optional[str] = None
    consultation: Optional[str] = None


# ── SAMPLE (SID level) ────────────────────────────────────────────────────────

class SampleCreate(BaseModel):
    sid: str  # required — SID is the unique identifier for a sample


class SampleUpdate(BaseModel):
    sid: Optional[str] = None


# ── SAMPLE RECORD (all test/sequencing data) ──────────────────────────────────

class SampleRecordCreate(BaseModel):
    new_case_label: Optional[str] = None
    additional: Optional[str] = None
    source: Optional[str] = None
    sample_collection_date: Optional[str] = None
    dna_availability: Optional[str] = None
    sequencing: Optional[str] = None
    din: Optional[str] = None
    research_report: Optional[str] = None
    sequencing_partner: Optional[str] = None
    data_received: Optional[str] = None
    tmr_e: Optional[float] = None
    old_gbp: Optional[float] = None
    gbp: Optional[float] = None
    data_analysed_som: Optional[str] = None
    data_analysed_germ: Optional[str] = None
    sample_labeling: Optional[str] = None
    analysis: Optional[str] = None
    report_status: Optional[str] = None
    report_release_date: Optional[str] = None
    comments: Optional[str] = None


class SampleRecordUpdate(SampleRecordCreate):
    pass

class PatientWithSampleCreate(BaseModel):
    # ── Patient fields ────────────────────────────────────────────────────────
    patient_id: str
    aob_id: Optional[str] = None
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    detail_disease: Optional[str] = None
    organ_type: Optional[str] = None
    comorbidity: Optional[str] = None
    family_history: Optional[str] = None
    metastasis: Optional[str] = None
    patient_status: Optional[str] = None
    consultation: Optional[str] = None

    # ── Sample (SID) ──────────────────────────────────────────────────────────
    sid: Optional[str] = None

    # ── Sample Record fields ──────────────────────────────────────────────────
    new_case_label: Optional[str] = None
    additional: Optional[str] = None
    source: Optional[str] = None
    sample_collection_date: Optional[str] = None
    dna_availability: Optional[str] = None
    sequencing: Optional[str] = None
    din: Optional[str] = None
    research_report: Optional[str] = None
    sequencing_partner: Optional[str] = None
    data_received: Optional[str] = None
    tmr_e: Optional[float] = None
    old_gbp: Optional[float] = None
    gbp: Optional[float] = None
    data_analysed_som: Optional[str] = None
    data_analysed_germ: Optional[str] = None
    sample_labeling: Optional[str] = None
    analysis: Optional[str] = None
    report_status: Optional[str] = None
    report_release_date: Optional[str] = None
    comments: Optional[str] = None


class PatientWithSampleUpdate(BaseModel):
    # ── Which sample/record to update ─────────────────────────────────────────
    sample_id: Optional[int] = None   # which SID row to update
    record_id: Optional[int] = None   # which sample_record row to update

    # ── Patient fields ────────────────────────────────────────────────────────
    aob_id: Optional[str] = None
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    detail_disease: Optional[str] = None
    organ_type: Optional[str] = None
    comorbidity: Optional[str] = None
    family_history: Optional[str] = None
    metastasis: Optional[str] = None
    patient_status: Optional[str] = None
    consultation: Optional[str] = None

    # ── Sample (SID) ──────────────────────────────────────────────────────────
    sid: Optional[str] = None

    # ── Sample Record ─────────────────────────────────────────────────────────
    new_case_label: Optional[str] = None
    additional: Optional[str] = None
    source: Optional[str] = None
    sample_collection_date: Optional[str] = None
    dna_availability: Optional[str] = None
    sequencing: Optional[str] = None
    din: Optional[str] = None
    research_report: Optional[str] = None
    sequencing_partner: Optional[str] = None
    data_received: Optional[str] = None
    tmr_e: Optional[float] = None
    old_gbp: Optional[float] = None
    gbp: Optional[float] = None
    data_analysed_som: Optional[str] = None
    data_analysed_germ: Optional[str] = None
    sample_labeling: Optional[str] = None
    analysis: Optional[str] = None
    report_status: Optional[str] = None
    report_release_date: Optional[str] = None
    comments: Optional[str] = None