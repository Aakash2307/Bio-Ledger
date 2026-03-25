from fastapi import APIRouter # type: ignore
from app.schemas.patient_schema import PatientCreate, PatientUpdate
from app.controllers.patient_controller import (
    get_all_patients,
    get_patient_by_id,
    create_patient,
    update_patient,
    delete_patient as delete_patient_controller
)

router = APIRouter(prefix="/patients", tags=["Patients"])


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
    