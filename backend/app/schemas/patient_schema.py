from pydantic import BaseModel, field_validator
from typing import Optional, Union


# ── PATIENT ───────────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    patient_id: str
    name: Optional[str] = None
    gender: Optional[str] = None


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    gender: Optional[str] = None


# ── SAMPLE (SID level) ────────────────────────────────────────────────────────

class SampleCreate(BaseModel):
    sid: str


class SampleUpdate(BaseModel):
    sid: Optional[str] = None


# ── SAMPLE RECORD ─────────────────────────────────────────────────────────────

class SampleRecordCreate(BaseModel):
    aob_id: Optional[str] = None
    age: Optional[Union[int, str]] = None
    detail_disease: Optional[str] = None
    organ_type: Optional[str] = None
    comorbidity: Optional[str] = None
    family_history: Optional[str] = None
    metastasis: Optional[str] = None
    patient_status: Optional[str] = None
    consultation: Optional[str] = None
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
    tmr_e: Optional[Union[float, str]] = None
    old_gbp: Optional[Union[float, str]] = None
    gbp: Optional[Union[float, str]] = None
    data_analysed_som: Optional[str] = None
    data_analysed_germ: Optional[str] = None
    sample_labeling: Optional[str] = None
    analysis: Optional[str] = None
    report_status: Optional[str] = None
    report_release_date: Optional[str] = None
    comments: Optional[str] = None

    @field_validator("age", mode="before")
    @classmethod
    def parse_age(cls, v):
        if v == "" or v is None:
            return None
        try:
            return int(float(str(v)))
        except:
            return None

    @field_validator("tmr_e", "old_gbp", "gbp", mode="before")
    @classmethod
    def parse_float(cls, v):
        if v == "" or v is None:
            return None
        try:
            return float(str(v))
        except:
            return None


class SampleRecordUpdate(SampleRecordCreate):
    pass


# ── PATIENT WITH SAMPLE (bulk upload / add patient page) ─────────────────────

class PatientWithSampleCreate(BaseModel):
    # Patient fields
    patient_id: str
    name: Optional[str] = None
    gender: Optional[str] = None

    # Sample
    sid: Optional[str] = None

    # Sample Record (includes former patient fields)
    aob_id: Optional[str] = None
    age: Optional[Union[int, str]] = None
    detail_disease: Optional[str] = None
    organ_type: Optional[str] = None
    comorbidity: Optional[str] = None
    family_history: Optional[str] = None
    metastasis: Optional[str] = None
    patient_status: Optional[str] = None
    consultation: Optional[str] = None
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
    tmr_e: Optional[Union[float, str]] = None
    old_gbp: Optional[Union[float, str]] = None
    gbp: Optional[Union[float, str]] = None
    data_analysed_som: Optional[str] = None
    data_analysed_germ: Optional[str] = None
    sample_labeling: Optional[str] = None
    analysis: Optional[str] = None
    report_status: Optional[str] = None
    report_release_date: Optional[str] = None
    comments: Optional[str] = None

    @field_validator("age", mode="before")
    @classmethod
    def parse_age(cls, v):
        if v == "" or v is None:
            return None
        try:
            return int(float(str(v)))
        except:
            return None

    @field_validator("tmr_e", "old_gbp", "gbp", mode="before")
    @classmethod
    def parse_float(cls, v):
        if v == "" or v is None:
            return None
        try:
            return float(str(v))
        except:
            return None
        

    @field_validator(
        "aob_id", "detail_disease", "organ_type", "comorbidity",
        "family_history", "metastasis", "patient_status", "consultation",
        "new_case_label", "additional", "source", "sample_collection_date",
        "dna_availability", "sequencing", "din", "research_report",
        "sequencing_partner", "data_received", "data_analysed_som",
        "data_analysed_germ", "sample_labeling", "analysis",
        "report_status", "report_release_date", "comments",
        "name", "gender", "patient_id",
        mode="before"
    )
    @classmethod
    def coerce_to_str(cls, v):
        if v is None or v == "":
            return None
        return str(v)


class PatientWithSampleUpdate(BaseModel):
    # Which sample/record to update
    sample_id: Optional[int] = None
    record_id: Optional[int] = None

    # Patient fields
    name: Optional[str] = None
    gender: Optional[str] = None

    # Sample
    sid: Optional[str] = None

    # Sample Record (includes former patient fields)
    aob_id: Optional[str] = None
    age: Optional[Union[int, str]] = None
    detail_disease: Optional[str] = None
    organ_type: Optional[str] = None
    comorbidity: Optional[str] = None
    family_history: Optional[str] = None
    metastasis: Optional[str] = None
    patient_status: Optional[str] = None
    consultation: Optional[str] = None
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
    tmr_e: Optional[Union[float, str]] = None
    old_gbp: Optional[Union[float, str]] = None
    gbp: Optional[Union[float, str]] = None
    data_analysed_som: Optional[str] = None
    data_analysed_germ: Optional[str] = None
    sample_labeling: Optional[str] = None
    analysis: Optional[str] = None
    report_status: Optional[str] = None
    report_release_date: Optional[str] = None
    comments: Optional[str] = None

    @field_validator("age", mode="before")
    @classmethod
    def parse_age(cls, v):
        if v == "" or v is None:
            return None
        try:
            return int(float(str(v)))
        except:
            return None

    @field_validator("tmr_e", "old_gbp", "gbp", mode="before")
    @classmethod
    def parse_float(cls, v):
        if v == "" or v is None:
            return None
        try:
            return float(str(v))
        except:
            return None