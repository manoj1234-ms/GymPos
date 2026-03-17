from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
import datetime
import os

# ─── Database URL ──────────────────────────────────────────────────────────────
# Priority: DATABASE_URL env var (PostgreSQL on cloud) → fallback to SQLite (local dev)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./gym_trainer.db"  # Local fallback for development only
)

# PostgreSQL uses psycopg2; SQLite needs check_same_thread=False
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # PostgreSQL - handle Render.com's postgres:// → postgresql:// prefix
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    weight = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    fitness_level = Column(String, default="beginner")
    is_verified = Column(Boolean, default=False)
    otp_code = Column(String, nullable=True)
    otp_expiry = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    sessions = relationship("WorkoutSession", back_populates="user")


class WorkoutSession(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    start_time = Column(DateTime, default=datetime.datetime.utcnow)
    end_time = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="sessions")
    logs = relationship("ExerciseLog", back_populates="session")


class ExerciseLog(Base):
    __tablename__ = "exercise_logs"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    exercise_name = Column(String)
    reps = Column(Integer)
    avg_quality = Column(Float)  # 0.0 to 1.0 form score
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("WorkoutSession", back_populates="logs")


# Auto-create all tables on startup
Base.metadata.create_all(bind=engine)
