# main.py — MedChain AI Service (FastAPI)
# Receives prescription images, analyzes with Claude Vision, returns structured results

import os
import uuid
import asyncio
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from utils.image_utils import prepare_image_for_claude
from utils.analyzer import analyze_prescription

# ── Load environment variables ─────────────────────────────────
load_dotenv()

# ── Create upload directory ────────────────────────────────────
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(exist_ok=True)

MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "10"))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# ── In-memory job store (for async analysis status) ───────────
# In production, replace this with Redis or MongoDB
analysis_jobs: dict = {}


# ── FastAPI App ────────────────────────────────────────────────
app = FastAPI(
    title="MedChain AI Service",
    description="Prescription image analysis using Claude Vision API",
    version="1.0.0",
)

# ── CORS ───────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production: restrict to your backend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic Response Models ───────────────────────────────────

class MedicineItem(BaseModel):
    name: str
    generic_name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    route: Optional[str] = None


class AnalysisResult(BaseModel):
    success: bool
    prescription_id: Optional[str] = None
    job_id: Optional[str] = None
    medicines: list = []
    recommendations: list = []
    warnings: list = []
    diet_advice: list = []
    follow_up: Optional[str] = None
    diagnosis: Optional[str] = None
    doctor_name: Optional[str] = None
    patient_name: Optional[str] = None
    prescription_date: Optional[str] = None
    notes: Optional[str] = None
    confidence: Optional[str] = None
    warnings_disclaimer: Optional[str] = None
    analyzed_at: Optional[str] = None
    error: Optional[str] = None


class JobStatus(BaseModel):
    job_id: str
    status: str  # pending | processing | completed | failed
    prescription_id: Optional[str] = None
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


# ══════════════════════════════════════════════════════════════
# ROUTES
# ══════════════════════════════════════════════════════════════

# ── Health Check ───────────────────────────────────────────────
@app.get("/health")
async def health_check():
    api_key_set = bool(os.getenv("ANTHROPIC_API_KEY"))
    return {
        "status": "running",
        "service": "MedChain AI",
        "version": "1.0.0",
        "anthropic_key_configured": api_key_set,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ── MAIN: Analyze prescription (synchronous — waits for result) ─
@app.post("/analyze", response_model=AnalysisResult)
async def analyze(
    file: UploadFile = File(..., description="Prescription image (JPG, PNG) or PDF"),
    prescription_id: Optional[str] = Form(None, description="Prescription ID from backend"),
):
    """
    Analyze a prescription image synchronously.
    Uploads the file, sends to Claude Vision, returns structured JSON.
    Called by the Node.js backend after a patient uploads a prescription.
    """

    # ── Validate file type ─────────────────────────────────────
    allowed_types = {"image/jpeg", "image/jpg", "image/png", "application/pdf"}
    content_type = file.content_type or ""
    filename = file.filename or "prescription"

    # Also check by extension in case content_type is wrong
    ext = Path(filename).suffix.lower()
    allowed_exts = {".jpg", ".jpeg", ".png", ".pdf"}
    if content_type not in allowed_types and ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"File type not supported. Please upload JPG, PNG, or PDF. Got: {content_type}",
        )

    # ── Read file bytes ────────────────────────────────────────
    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size is {MAX_FILE_SIZE_MB}MB",
        )

    print(f"[AI] Received file: {filename} ({len(file_bytes)} bytes) | RX: {prescription_id}")

    # ── Prepare image for Claude ───────────────────────────────
    try:
        base64_data, media_type = prepare_image_for_claude(file_bytes, filename, content_type)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not process image: {str(e)}")

    # ── Call Claude Vision API ─────────────────────────────────
    try:
        result = await asyncio.to_thread(
            analyze_prescription,
            base64_data,
            media_type,
            prescription_id,
        )
        # analyze_prescription is sync, run in thread pool

        # Actually run the coroutine properly
        import inspect
        if inspect.iscoroutine(result):
            result = await result

    except ValueError as e:
        # API key not configured
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        error_msg = str(e)
        print(f"[AI] Error analyzing prescription: {error_msg}")

        # Return a meaningful error response
        return AnalysisResult(
            success=False,
            prescription_id=prescription_id,
            error=f"Analysis failed: {error_msg}",
            medicines=[],
            recommendations=[
                "Take all medicines as prescribed by your doctor",
                "Complete the full course of medication",
            ],
            warnings=[
                "Consult your doctor if unsure about dosage",
                "Do not self-medicate",
            ],
            warnings_disclaimer="AI analysis unavailable. Please consult your doctor directly.",
            analyzed_at=datetime.utcnow().isoformat(),
        )

    # ── Return structured result ───────────────────────────────
    return AnalysisResult(
        success=True,
        prescription_id=prescription_id,
        medicines=result.get("medicines", []),
        recommendations=result.get("recommendations", []),
        warnings=result.get("warnings", []),
        diet_advice=result.get("diet_advice", []),
        follow_up=result.get("follow_up"),
        diagnosis=result.get("diagnosis"),
        doctor_name=result.get("doctor_name"),
        patient_name=result.get("patient_name"),
        prescription_date=result.get("prescription_date"),
        notes=result.get("notes"),
        confidence=result.get("confidence"),
        warnings_disclaimer=result.get("warnings_disclaimer"),
        analyzed_at=datetime.utcnow().isoformat(),
    )


# ── Async Job: Submit for background analysis ──────────────────
@app.post("/analyze/async")
async def analyze_async(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    prescription_id: Optional[str] = Form(None),
):
    """
    Submit a prescription for background analysis.
    Returns a job_id immediately. Poll /status/{job_id} for results.
    Useful for large files or when you don't want to wait.
    """
    file_bytes = await file.read()
    filename = file.filename or "prescription"
    content_type = file.content_type or ""

    job_id = str(uuid.uuid4())

    # Store job as pending
    analysis_jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "prescription_id": prescription_id,
        "result": None,
        "error": None,
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None,
    }

    # Run analysis in background
    background_tasks.add_task(
        run_background_analysis,
        job_id,
        file_bytes,
        filename,
        content_type,
        prescription_id,
    )

    return {
        "success": True,
        "job_id": job_id,
        "message": "Analysis started. Poll /status/{job_id} for results.",
        "poll_url": f"/status/{job_id}",
    }


async def run_background_analysis(
    job_id: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    prescription_id: Optional[str],
):
    """Background task: runs analysis and updates job store."""
    analysis_jobs[job_id]["status"] = "processing"
    try:
        base64_data, media_type = prepare_image_for_claude(file_bytes, filename, content_type)

        import asyncio
        result = await asyncio.to_thread(
            analyze_prescription_sync,
            base64_data,
            media_type,
            prescription_id,
        )

        analysis_jobs[job_id]["status"] = "completed"
        analysis_jobs[job_id]["result"] = result
        analysis_jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()
        print(f"[AI] Background job {job_id} completed")

    except Exception as e:
        analysis_jobs[job_id]["status"] = "failed"
        analysis_jobs[job_id]["error"] = str(e)
        analysis_jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()
        print(f"[AI] Background job {job_id} failed: {e}")


def analyze_prescription_sync(base64_data, media_type, prescription_id):
    """Synchronous wrapper for asyncio.to_thread."""
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(
            analyze_prescription(base64_data, media_type, prescription_id)
        )
    finally:
        loop.close()


# ── Poll job status ────────────────────────────────────────────
@app.get("/status/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    """Check the status of an async analysis job."""
    if job_id not in analysis_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    job = analysis_jobs[job_id]
    return JobStatus(**job)


# ── Direct text analysis (no image — for testing) ─────────────
@app.post("/analyze/text")
async def analyze_text(
    medicine_text: str = Form(..., description="Paste prescription text manually"),
    prescription_id: Optional[str] = Form(None),
):
    """
    Analyze a prescription from typed/pasted text instead of image.
    Useful for testing or when image upload isn't available.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    import anthropic
    import json

    client = anthropic.Anthropic(api_key=api_key)

    prompt = f"""Analyze this prescription text and respond with ONLY a JSON object:

Prescription Text:
{medicine_text}

JSON structure required:
{{
  "medicines": [{{"name":"","dosage":"","frequency":"","duration":""}}],
  "recommendations": ["..."],
  "warnings": ["..."],
  "diet_advice": ["..."],
  "follow_up": null,
  "diagnosis": null,
  "notes": "...",
  "confidence": "high/medium/low"
}}"""

    try:
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text
        from utils.analyzer import clean_json_response
        result = json.loads(clean_json_response(raw))
        result["success"] = True
        result["prescription_id"] = prescription_id
        result["analyzed_at"] = datetime.utcnow().isoformat()
        result["warnings_disclaimer"] = (
            "This analysis is AI-generated. Always consult your doctor."
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


# ── List recent jobs (for debugging) ──────────────────────────
@app.get("/jobs")
async def list_jobs():
    """List all analysis jobs (last 20)."""
    jobs = list(analysis_jobs.values())
    jobs.sort(key=lambda x: x["created_at"], reverse=True)
    return {"jobs": jobs[:20], "total": len(jobs)}


# ══════════════════════════════════════════════════════════════
# STARTUP
# ══════════════════════════════════════════════════════════════
@app.on_event("startup")
async def startup_event():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    print("\n" + "═" * 50)
    print("  🤖 MedChain AI Service Starting...")
    print(f"  📡 Port: {os.getenv('PORT', 8000)}")
    print(f"  🔑 Anthropic API Key: {'✅ Configured' if api_key else '❌ NOT SET — add to .env'}")
    print(f"  📁 Upload dir: {UPLOAD_DIR.absolute()}")
    print("═" * 50 + "\n")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=True,  # Auto-reload on file changes (dev mode)
    )
