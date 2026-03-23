from fastapi import APIRouter # type: ignore
from app.controllers.dashboard_controller import get_dashboard_summary, get_patient_summary

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary")
def dashboard_summary(period: str = "all"):
    return get_dashboard_summary(period)


@router.get("/patient-summary")
def patient_summary():
    return get_patient_summary()