from fastapi import APIRouter
from app.schemas.patient_schema import SampleCreate
from app.controllers.sample_controller import create_sample

router = APIRouter(prefix="/patients", tags=["Samples"])


@router.post("/{patient_id}/samples")
def add_sample(patient_id: int, sample: SampleCreate):
    return create_sample(patient_id, sample)