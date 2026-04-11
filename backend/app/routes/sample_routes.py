from fastapi import APIRouter  # type: ignore
from app.schemas.patient_schema import SampleCreate, SampleRecordCreate, SampleRecordUpdate, PatientWithSampleCreate
from app.controllers.patient_controller import add_sample_to_patient as add_sample_full
from app.controllers.sample_controller import (
    get_samples_by_patient,
    delete_sample,
    create_sample_record,
    update_sample_record,
    delete_sample_record,
)

router = APIRouter(tags=["Samples"])


# SAMPLES (SID level)
@router.post("/patients/{patient_id}/samples")
def add_sample(patient_id: int, sample: PatientWithSampleCreate):
    return add_sample_full(patient_id, sample)


@router.get("/patients/{patient_id}/samples")
def list_samples(patient_id: int):
    return get_samples_by_patient(patient_id)


@router.delete("/samples/{sample_id}")
def remove_sample(sample_id: int):
    return delete_sample(sample_id)


# SAMPLE RECORDS
@router.post("/samples/{sample_id}/records")
def add_record(sample_id: int, record: SampleRecordCreate):
    return create_sample_record(sample_id, record)


@router.put("/records/{record_id}")
def edit_record(record_id: int, record: SampleRecordUpdate):
    return update_sample_record(record_id, record)


@router.delete("/records/{record_id}")
def remove_record(record_id: int):
    return delete_sample_record(record_id)
