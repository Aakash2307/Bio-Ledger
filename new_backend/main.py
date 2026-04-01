from fastapi import FastAPI # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
from database import create_tables
from app.routes import patient_routes, sample_routes, dashboard_routes

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

# Register routers
app.include_router(patient_routes.router)
app.include_router(sample_routes.router)
app.include_router(dashboard_routes.router)


@app.get("/")
def home():
    return {"message": "Patient Portal API Running"}