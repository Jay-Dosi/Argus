from sqlalchemy import Column, String, Boolean, Float, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime, timezone
from database import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True)
    consent_status = Column(String, nullable=False, default='pending') # pending | granted | revoked
    consent_granted_at = Column(DateTime(timezone=True), nullable=True)
    screenshot_retention_days = Column(Integer, default=0) # 0 = never retain raw images
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class BlocklistDomain(Base):
    __tablename__ = "blocklist_domains"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"))
    domain_pattern = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ActivityEvent(Base):
    __tablename__ = "activity_events"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"))
    captured_at = Column(DateTime(timezone=True), nullable=False)
    domain = Column(String, nullable=False)
    tab_title = Column(String, nullable=True)
    window_focused = Column(Boolean, nullable=True)
    capture_trigger = Column(String, nullable=True) # 'interval' | 'tab_switch' | 'manual'
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    ai_analysis = relationship("AiAnalysis", back_populates="event", uselist=False, cascade="all, delete")
    screenshots = relationship("Screenshot", back_populates="event", cascade="all, delete")

class AiAnalysis(Base):
    __tablename__ = "ai_analysis"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    event_id = Column(String, ForeignKey("activity_events.id", ondelete="CASCADE"))
    category = Column(String, nullable=False)
    application_or_site = Column(String, nullable=True)
    task_summary = Column(String, nullable=True)
    contains_sensitive_content = Column(Boolean, default=False)
    confidence = Column(Float, nullable=True)
    model_version = Column(String, default="gemini-3.1-flash-lite")
    latency_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    event = relationship("ActivityEvent", back_populates="ai_analysis")

class Screenshot(Base):
    __tablename__ = "screenshots"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    event_id = Column(String, ForeignKey("activity_events.id", ondelete="CASCADE"))
    storage_url = Column(String, nullable=False)
    retention_expires_at = Column(DateTime(timezone=True), nullable=False)
    
    event = relationship("ActivityEvent", back_populates="screenshots")

class AuditLog(Base):
    __tablename__ = "audit_log"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"))
    action = Column(String, nullable=False) # consent_granted | consent_revoked | paused | resumed | data_deleted
    ts = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
