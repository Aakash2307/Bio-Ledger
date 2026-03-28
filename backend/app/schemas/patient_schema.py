from pydantic import BaseModel
from typing import Optional


class PatientCreate(BaseModel):
    # ── patients table ────────────────────────────────────────────────────────
    patient_id: str
    aob_id: Optional[str] = None
    sid: Optional[str] = None
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
    # ── samples table (created together with the patient) ─────────────────────
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
    data_analysed_som: Optional[str] = None
    data_analysed_germ: Optional[str] = None
    sample_labeling: Optional[str] = None
    analysis: Optional[str] = None
    report_status: Optional[str] = None
    report_release_date: Optional[str] = None
    comments: Optional[str] = None


class PatientUpdate(BaseModel):
    # ── patients table ────────────────────────────────────────────────────────
    aob_id: Optional[str] = None
    sid: Optional[str] = None
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
    
    # ── samples table ─────────────────────────────────────────────────────────
    sample_id: Optional[int] = None  # <--- ADD THIS LINE
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
    data_analysed_som: Optional[str] = None
    data_analysed_germ: Optional[str] = None
    sample_labeling: Optional[str] = None
    analysis: Optional[str] = None
    report_status: Optional[str] = None
    report_release_date: Optional[str] = None
    comments: Optional[str] = None


# class PatientUpdate(BaseModel):
#     # ── patients table ────────────────────────────────────────────────────────
#     aob_id: Optional[str] = None
#     sid: Optional[str] = None
#     name: Optional[str] = None
#     age: Optional[int] = None
#     gender: Optional[str] = None
#     detail_disease: Optional[str] = None
#     organ_type: Optional[str] = None
#     comorbidity: Optional[str] = None
#     family_history: Optional[str] = None
#     metastasis: Optional[str] = None
#     patient_status: Optional[str] = None
#     consultation: Optional[str] = None
#     # ── samples table ─────────────────────────────────────────────────────────
#     new_case_label: Optional[str] = None
#     additional: Optional[str] = None
#     source: Optional[str] = None
#     sample_collection_date: Optional[str] = None
#     dna_availability: Optional[str] = None
#     sequencing: Optional[str] = None
#     din: Optional[str] = None
#     research_report: Optional[str] = None
#     sequencing_partner: Optional[str] = None
#     data_received: Optional[str] = None
#     tmr_e: Optional[float] = None
#     data_analysed_som: Optional[str] = None
#     data_analysed_germ: Optional[str] = None
#     sample_labeling: Optional[str] = None
#     analysis: Optional[str] = None
#     report_status: Optional[str] = None
#     report_release_date: Optional[str] = None
#     comments: Optional[str] = None


class SampleCreate(BaseModel):
    sid: Optional[str] = None
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
    data_analysed_som: Optional[str] = None
    data_analysed_germ: Optional[str] = None
    sample_labeling: Optional[str] = None
    analysis: Optional[str] = None
    report_status: Optional[str] = None
    report_release_date: Optional[str] = None
    comments: Optional[str] = None