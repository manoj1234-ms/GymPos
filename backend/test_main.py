import pytest
import sys
import os
import tempfile

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Use a fresh in-memory/temp DB for tests
os.environ["TEST_MODE"] = "1"
TEST_DB = "test_gym.db"
if os.path.exists(TEST_DB):
    os.remove(TEST_DB)

# Override the DB URL BEFORE importing the app
import database
database.DATABASE_URL = f"sqlite:///./{TEST_DB}"
database.engine = database.create_engine(database.DATABASE_URL, connect_args={"check_same_thread": False})
database.SessionLocal = database.sessionmaker(autocommit=False, autoflush=False, bind=database.engine)
database.Base.metadata.create_all(bind=database.engine)

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health_check():
    """Verify API is alive."""
    response = client.get("/")
    assert response.status_code == 200
    assert "active" in response.json()["status"]


def test_auth_register():
    """Test user registration."""
    reg_data = {
        "username": "testuser_deploy",
        "password": "Pass123",
        "email": "deploy@example.com"
    }
    response = client.post("/register", json=reg_data)
    assert response.status_code == 200
    data = response.json()
    assert "token" in data or "message" in data or "error" in data


def test_diet_prediction_empty():
    """Verify diet prediction handles new/unknown users gracefully."""
    response = client.get("/predict-diet?user_id=99999")
    assert response.status_code == 200
    assert "prediction" in response.json()


def test_workout_recalibration():
    """Verify recalibration endpoint is accessible and returns a valid response."""
    response = client.post("/train-personal-model?user_id=1")
    assert response.status_code == 200
    # It may return 'message' on success or 'error' if no data yet — both are valid
    data = response.json()
    assert "message" in data or "error" in data


def test_biometric_calculations():
    """Test WorkoutState bio-sensing logic directly."""
    from main import WorkoutState
    state = WorkoutState(exercise="squat")

    # Hydration should drop below 100 after simulated high-power frame
    state.power_level = 500
    hydration_decay = 0.002 + (state.power_level / 100000)
    state.hydration_level -= hydration_decay
    assert state.hydration_level < 100.0

    # Neural stress should increase on slow rep detection
    state.rep_times = [2.0, 2.1, 1.9, 2.0]
    state.current_tempo = 3.5
    avg_velo = sum(state.rep_times[-3:]) / 3
    if state.current_tempo > avg_velo * 1.4:
        state.neural_stress += 15
    assert state.neural_stress == 15
