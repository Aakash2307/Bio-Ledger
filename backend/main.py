from fastapi import FastAPI # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
from database import create_tables, add_report_automation_schema
from app.routes import patient_routes, sample_routes, dashboard_routes, report_routes
from app.services.report_worker import start_worker
from app.routes import variant_routes


app = FastAPI(title="Patient Portal API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB tables on startup
create_tables()
add_report_automation_schema()

# Register routers
app.include_router(patient_routes.router)
app.include_router(sample_routes.router)
app.include_router(dashboard_routes.router)
app.include_router(report_routes.router)
app.include_router(variant_routes.router)

# Start the single-worker report generation queue
start_worker()


@app.get("/")
def home():
    return {"message": "Patient Portal API Running"}