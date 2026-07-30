from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timezone
import base64

import models
from database import engine, get_db
from agent import analyze_screenshot

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Argus Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For Chrome extension, allow all or specific chrome-extension:// origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    print(f"Validation Error: {exc}")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

# Pydantic schemas for requests
class IngestRequest(BaseModel):
    user_id: str
    image_b64: str
    tab_title: Optional[str] = None
    domain: str
    window_focused: bool
    capture_trigger: Optional[str] = None
    captured_at: str

class ConsentUpdate(BaseModel):
    user_id: str
    consent_status: str # granted | revoked | pending
    screenshot_retention_days: Optional[int] = 0

class BlocklistAdd(BaseModel):
    user_id: str
    domain_pattern: str

def process_ingestion(request: IngestRequest, db: Session):
    # Check consent
    user = db.query(models.User).filter(models.User.id == request.user_id).first()
    if not user or user.consent_status != 'granted':
        return
    
    # Check blocklist
    blocklisted = db.query(models.BlocklistDomain).filter(
        models.BlocklistDomain.user_id == request.user_id,
        models.BlocklistDomain.domain_pattern == request.domain
    ).first()
    if blocklisted:
        return

    # Call Gemini Agent
    analysis, latency = analyze_screenshot(request.image_b64, request.tab_title, request.domain)
    
    if not analysis:
        return

    # Store ActivityEvent
    event = models.ActivityEvent(
        user_id=request.user_id,
        captured_at=datetime.fromisoformat(request.captured_at.replace('Z', '+00:00')),
        domain=request.domain,
        tab_title=request.tab_title,
        window_focused=request.window_focused,
        capture_trigger=request.capture_trigger
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    # Store AI Analysis
    ai_record = models.AiAnalysis(
        event_id=event.id,
        category=analysis['category'],
        application_or_site=analysis['application_or_site'],
        task_summary=analysis['task_summary'],
        contains_sensitive_content=analysis['contains_sensitive_content'],
        confidence=analysis['confidence'],
        latency_ms=latency
    )
    db.add(ai_record)
    
    # Optional screenshot retention (simplified - normally upload to S3/GCS here)
    if user.screenshot_retention_days > 0:
        # Just store as data URL for now in DB or local storage reference, ideally cloud storage
        # In a real app, don't store b64 in postgres if it's large, but for this PRD scope we simulate
        # avoiding large storage costs by keeping TTL.
        pass

    db.commit()


@app.post("/api/ingest", status_code=status.HTTP_202_ACCEPTED)
async def ingest_activity(request: IngestRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(process_ingestion, request, db)
    return {"status": "accepted"}

@app.post("/api/users/consent")
def update_consent(req: ConsentUpdate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == req.user_id).first()
    if not user:
        user = models.User(id=req.user_id, email=f"{req.user_id}@example.com")
        db.add(user)
    
    user.consent_status = req.consent_status
    if req.consent_status == 'granted':
        user.consent_granted_at = datetime.now(timezone.utc)
    user.screenshot_retention_days = req.screenshot_retention_days
    
    # Audit log
    audit = models.AuditLog(user_id=user.id, action=f"consent_{req.consent_status}")
    db.add(audit)
    db.commit()
    return {"status": "success"}

@app.get("/api/users/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        # auto-create for demo purposes
        user = models.User(id=user_id, email=f"{user_id}@example.com")
        db.add(user)
        db.commit()
        db.refresh(user)
    return {
        "id": user.id,
        "consent_status": user.consent_status,
        "screenshot_retention_days": user.screenshot_retention_days
    }

@app.post("/api/users/blocklist")
def add_blocklist(req: BlocklistAdd, db: Session = Depends(get_db)):
    record = models.BlocklistDomain(user_id=req.user_id, domain_pattern=req.domain_pattern)
    db.add(record)
    db.commit()
    return {"status": "added"}

@app.get("/api/users/{user_id}/activity")
def get_activity(user_id: str, db: Session = Depends(get_db)):
    events = db.query(models.ActivityEvent).filter(models.ActivityEvent.user_id == user_id).order_by(models.ActivityEvent.captured_at.desc()).limit(100).all()
    results = []
    for evt in events:
        analysis = db.query(models.AiAnalysis).filter(models.AiAnalysis.event_id == evt.id).first()
        results.append({
            "id": evt.id,
            "captured_at": evt.captured_at,
            "domain": evt.domain,
            "title": evt.tab_title,
            "analysis": {
                "category": analysis.category if analysis else None,
                "summary": analysis.task_summary if analysis else None,
            } if analysis else None
        })
    return results

@app.delete("/api/users/{user_id}")
def delete_user_data(user_id: str, db: Session = Depends(get_db)):
    db.query(models.ActivityEvent).filter(models.ActivityEvent.user_id == user_id).delete()
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user:
        user.consent_status = 'revoked'
        audit = models.AuditLog(user_id=user.id, action="data_deleted")
        db.add(audit)
    db.commit()
    return {"status": "deleted"}
