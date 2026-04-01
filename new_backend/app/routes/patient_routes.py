from fastapi import APIRouter # type: ignore
from app.schemas.patient_schema import PatientCreate, PatientUpdate, PatientWithSampleCreate, PatientWithSampleUpdate
from app.controllers.patient_controller import (
    get_all_patients,
    get_patient_by_id,
    create_patient,
    create_patient_with_sample,
    update_patient,
    update_patient_with_sample,
    delete_patient as delete_patient_controller,
)

router = APIRouter(prefix="/patients", tags=["Patients"])


# ── Combined (used by Add Patient page) ───────────────────────────────────────
@router.post("/with-sample")
def add_patient_with_sample(data: PatientWithSampleCreate):
    return create_patient_with_sample(data)


@router.put("/{patient_id}/with-sample")
def edit_patient_with_sample(patient_id: int, data: PatientWithSampleUpdate):
    return update_patient_with_sample(patient_id, data)


# ── Patient only ──────────────────────────────────────────────────────────────
@router.get("/")
def list_patients():
    return get_all_patients()


@router.get("/{patient_id}")
def patient_details(patient_id: int):
    return get_patient_by_id(patient_id)


@router.post("/")
def add_patient(patient: PatientCreate):
    return create_patient(patient)


@router.put("/{patient_id}")
def edit_patient(patient_id: int, data: PatientUpdate):
    return update_patient(patient_id, data)


@router.delete("/{patient_id}")
def remove_patient(patient_id: int):
    return delete_patient_controller(patient_id)