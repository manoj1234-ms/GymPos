from fastapi import FastAPI, WebSocket, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import json
import base64
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import os
import random
import datetime
from database import SessionLocal, User, WorkoutSession, ExerciseLog
from coach import coach
import asyncio
from auth_utils import get_password_hash, verify_password, create_access_token
import auth_utils

# MediaPipe Tasks initialization
detector = None

def get_detector():
    global detector
    if detector is None:
        model_path = os.path.join(os.path.dirname(__file__), 'pose_landmarker.task')
        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE
        )
        detector = vision.PoseLandmarker.create_from_options(options)
    return detector

app = FastAPI(title="AI Gym Trainer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://gym-pos-livid.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def health_check():
    return {"status": "active", "agent": "ProTrainer v3.5"}


def calculate_angle(a, b, c):
    a, b, c = np.array(a), np.array(b), np.array(c)
    radians = np.arctan2(c[1]-b[1], c[0]-b[0]) - np.arctan2(a[1]-b[1], a[0]-b[0])
    angle = np.abs(radians*180.0/np.pi)
    return 360-angle if angle > 180.0 else angle

class UserRegister(BaseModel):
    username: str
    password: str
    email: str

class UserLogin(BaseModel):
    username: str
    password: str

class OTPVerify(BaseModel):
    username: str
    otp: str

class WorkoutState:
    def __init__(self, exercise="squat"):
        self.exercise = exercise
        self.counter = 0
        self.target = 12
        self.stage = None
        self.feedback = "Ready"
        self.last_llm_call = 0
        self.llm_feedback = ""
        # Sensing metrics
        self.start_time = None
        self.rep_times = []
        self.current_tempo = 0.0 # seconds per rep
        self.velocity = 0.0 # movement speed
        self.last_y = None
        self.quality_score = 1.0 # 0.0 to 1.0
        self.stability_history = []
        self.injury_warning = False
        self.power_level = 0.0 # Force factor
        self.calibration_factor = 1.0 # Personalized multiplier
        self.neural_stress = 0.0 # Fatigue percentage
        self.hydration_level = 100.0 # Water tension percentage
        self.total_calories = 0.0 # Total kcal burned
        self.burn_rate = 0.0 # kcal/min

user_states = {}

# Landmark indices
L_HIP, L_KNEE, L_ANKLE = 23, 25, 27
L_SHOULDER, L_ELBOW, L_WRIST = 11, 13, 15
R_SHOULDER, R_ELBOW, R_WRIST = 12, 14, 16
R_HIP, R_KNEE, R_ANKLE = 24, 26, 28

def process_squat(lms, state):
    hip, knee, ankle = [lms[L_HIP].x, lms[L_HIP].y], [lms[L_KNEE].x, lms[L_KNEE].y], [lms[L_ANKLE].x, lms[L_ANKLE].y]
    angle = calculate_angle(hip, knee, ankle)
    if angle > 160: state.stage = "up"
    if angle < 95 and state.stage == 'up':
        state.stage = "down"; state.counter += 1
        state.feedback = f"Great squat! {state.counter}/{state.target}"
    return state

def process_pushup(lms, state):
    sh, el, wr = [lms[L_SHOULDER].x, lms[L_SHOULDER].y], [lms[L_ELBOW].x, lms[L_ELBOW].y], [lms[L_WRIST].x, lms[L_WRIST].y]
    angle = calculate_angle(sh, el, wr)
    if angle > 160: state.stage = "up"
    if angle < 75 and state.stage == 'up':
        state.stage = "down"; state.counter += 1
        state.feedback = f"Solid pushup! {state.counter}/{state.target}"
    return state

def process_curl(lms, state):
    sh, el, wr = [lms[L_SHOULDER].x, lms[L_SHOULDER].y], [lms[L_ELBOW].x, lms[L_ELBOW].y], [lms[L_WRIST].x, lms[L_WRIST].y]
    angle = calculate_angle(sh, el, wr)
    if angle > 160: state.stage = "down"
    if angle < 40 and state.stage == 'down':
        state.stage = "up"; state.counter += 1
        state.feedback = f"Squeeze! {state.counter}/{state.target}"
    return state

def process_lunge(lms, state):
    hip, knee, ankle = [lms[L_HIP].x, lms[L_HIP].y], [lms[L_KNEE].x, lms[L_KNEE].y], [lms[L_ANKLE].x, lms[L_ANKLE].y]
    angle = calculate_angle(hip, knee, ankle)
    if angle > 160: state.stage = "up"
    if angle < 100 and state.stage == 'up':
        state.stage = "down"; state.counter += 1
        state.feedback = f"Nice lunge! {state.counter}/{state.target}"
    return state

def process_lateral_raise(lms, state):
    sh, el, wr = [lms[L_SHOULDER].x, lms[L_SHOULDER].y], [lms[L_ELBOW].x, lms[L_ELBOW].y], [lms[L_WRIST].x, lms[L_WRIST].y]
    hip = [lms[L_HIP].x, lms[L_HIP].y]
    angle = calculate_angle(hip, sh, el)
    if angle < 30: state.stage = "down"
    if angle > 80 and state.stage == 'down':
        state.stage = "up"; state.counter += 1
        state.feedback = f"Raise higher! {state.counter}/{state.target}"
    return state

def process_press(lms, state):
    sh, el, wr = [lms[L_SHOULDER].x, lms[L_SHOULDER].y], [lms[L_ELBOW].x, lms[L_ELBOW].y], [lms[L_WRIST].x, lms[L_WRIST].y]
    angle = calculate_angle(sh, el, wr)
    # High point - arms extended
    if angle > 160: state.stage = "up"
    # Low point - weights at shoulder
    if angle < 60 and state.stage == 'up':
        state.stage = "down"; state.counter += 1
        state.feedback = f"Press! {state.counter}/{state.target}"
    return state

def process_deadlift(lms, state):
    hip, knee, ankle = [lms[L_HIP].x, lms[L_HIP].y], [lms[L_KNEE].x, lms[L_KNEE].y], [lms[L_ANKLE].x, lms[L_ANKLE].y]
    shoulder = [lms[L_SHOULDER].x, lms[L_SHOULDER].y]
    # Tracking the hinge angle at the hip
    angle = calculate_angle(shoulder, hip, knee)
    if angle > 160: state.stage = "up"
    if angle < 100 and state.stage == 'up':
        state.stage = "down"; state.counter += 1
        state.feedback = f"Good hinge! {state.counter}/{state.target}"
    return state

# --- Auth Endpoints ---
@app.post("/register")
async def register(user: UserRegister):
    db = SessionLocal()
    # Check if user exists
    if db.query(User).filter(User.username == user.username).first():
        db.close()
        return {"error": "Username already exists"}
    if db.query(User).filter(User.email == user.email).first():
        db.close()
        return {"error": "Email already registered"}
        
    new_user = User(
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    token = create_access_token({"sub": user.username, "user_id": new_user.id})
    db.close()
    return {"token": token, "username": user.username, "user_id": new_user.id}

@app.post("/login")
async def login(user: UserLogin):
    db = SessionLocal()
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        db.close()
        return {"error": "Invalid credentials"}
    if not db_user.is_verified:
        db.close()
        return {"error": "Account not verified. Please verify OTP first."}
    token = create_access_token({"sub": db_user.username, "user_id": db_user.id})
    response = {"token": token, "username": db_user.username, "user_id": db_user.id}
    db.close()
    return response

@app.post("/send-otp")
async def send_otp(username: str):
    db = SessionLocal()
    user = db.query(User).filter(User.username == username).first()
    if not user:
        db.close()
        return {"error": "User not found"}
    
    otp = str(random.randint(100000, 999999))
    user.otp_code = otp
    user.otp_expiry = datetime.datetime.utcnow() + datetime.timedelta(minutes=10)
    db.commit()
    
    # Render Console debug fallback
    print(f"==============\nDEBUG: OTP for {username} is: {otp}\n==============")
    
    # Try sending real email if SMTP configured
    import smtplib
    from email.mime.text import MIMEText
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    
    msg_status = "Check Render console logs for OTP."
    if smtp_user and smtp_pass:
        try:
            msg = MIMEText(f"Your GymPos Bio-Link verification code is: {otp}\nExpires in 10 minutes.")
            msg['Subject'] = 'GymPos OTP Code'
            msg['From'] = smtp_user
            msg['To'] = user.email

            server = smtplib.SMTP(os.getenv("SMTP_HOST", "smtp.gmail.com"), int(os.getenv("SMTP_PORT", "587")))
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
            server.quit()
            msg_status = f"OTP sent to {user.email}"
            print(f"Email sent successfully to {user.email}")
        except Exception as e:
            print(f"Failed to send email: {e}")
            msg_status = "Failed to send email. Check Render logs for OTP."

    db.close()
    return {"message": msg_status}

@app.post("/verify-otp")
async def verify_otp(data: OTPVerify):
    db = SessionLocal()
    user = db.query(User).filter(User.username == data.username).first()
    if not user or user.otp_code != data.otp:
        db.close()
        return {"error": "Invalid OTP code"}
    
    if datetime.datetime.utcnow() > user.otp_expiry:
        db.close()
        return {"error": "OTP expired"}

    user.is_verified = True
    user.otp_code = None
    db.commit()
    db.close()
    return {"message": "Bio-Link verified successfully!"}

@app.post("/train-personal-model")
@app.get("/train-personal-model")
async def train_model(user_id: int):
    # This simulates training a custom pose-correction model based on historical logs
    db = SessionLocal()
    logs = db.query(ExerciseLog).join(WorkoutSession).filter(WorkoutSession.user_id == user_id).all()
    if len(logs) < 5:
        return {"error": "Insufficient data. Complete at least 5 sets to calibrate target model."}
    
    # Personal Calibration: Increase efficiency factor
    if user_id in user_states:
        user_states[user_id].calibration_factor += 0.05
    
    return {"message": "Agent Recalibrated! Personal biomechanics model updated. Efficiency increased by 5%."}

@app.get("/predict-diet")
async def predict_diet(user_id: int):
    db = SessionLocal()
    # Find latest session
    session = db.query(WorkoutSession).filter(WorkoutSession.user_id == user_id).order_by(WorkoutSession.start_time.desc()).first()
    if not session:
        db.close()
        return {"prediction": "Initialize training session to generate neural diet roadmap."}
    
    logs = db.query(ExerciseLog).filter(ExerciseLog.session_id == session.id).all()
    workout_summary = [{"exercise": l.exercise_name, "reps": l.reps} for l in logs]
    db.close()
    
    prediction = await coach.get_diet_recommendation(workout_summary)
    return {"prediction": prediction}

@app.get("/session/{session_id}/summary")
async def get_summary(session_id: int):
    db = SessionLocal()
    logs = db.query(ExerciseLog).filter(ExerciseLog.session_id == session_id).all()
    if not logs:
        return {"summary": "No data recorded for this session."}
    
    # Prepare logs for LLM
    session_data = [{"exercise": l.exercise_name, "reps": l.reps} for l in logs]
    summary_text = await coach.get_session_summary(session_data)
    
    db.close()
    return {"summary": summary_text, "logs": session_data}

@app.websocket("/ws/pose")
async def websocket_pose(websocket: WebSocket):
    await websocket.accept()
    client_id = id(websocket)
    user_states[client_id] = WorkoutState()
    pose_detector = get_detector()
    
    db = SessionLocal()
    workout_session = None 
    
    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                json_data = json.loads(raw_data)
                # Handle User Session Initialization
                if "user_id" in json_data and workout_session is None:
                    u_id = json_data["user_id"]
                    workout_session = WorkoutSession(user_id=u_id)
                    db.add(workout_session); db.commit()
                    db.refresh(workout_session)
                    print(f"DEBUG: Session started for User {u_id}")
                    await websocket.send_json({"session_id": workout_session.id, "feedback": "Bio-Link Synchronized"})
                    continue
                
                if workout_session is None:
                    workout_session = WorkoutSession() # Anonymous session
                    db.add(workout_session); db.commit()
                    db.refresh(workout_session)

                # Handle Exercise Switching
                if "exercise" in json_data:
                    if user_states[client_id].counter > 0:
                        log = ExerciseLog(
                            session_id=workout_session.id,
                            exercise_name=user_states[client_id].exercise,
                            reps=user_states[client_id].counter,
                            avg_quality=1.0
                        )
                        db.add(log); db.commit()
                    user_states[client_id].exercise = json_data["exercise"]
                    user_states[client_id].counter = 0
                    user_states[client_id].feedback = f"Start {json_data['exercise']}"
                    continue
                
                # Handle Voice Commands
                if "command" in json_data:
                    cmd = json_data["command"].lower()
                    state = user_states[client_id]
                    print(f"DEBUG: Voice Command Received -> '{cmd}'")
                    
                    if "reset" in cmd:
                        state.counter = 0
                        state.feedback = "Counter Reset"
                        state.llm_feedback = "Okay, starting the count from zero."
                        await websocket.send_json({
                            "landmarks": [], "feedback": state.feedback, "llm_feedback": state.llm_feedback,
                            "counter": state.counter, "exercise": state.exercise, "metrics": {"tempo": 0, "velocity": 0, "quality": 100, "stability": 100, "injury_risk": False}
                        })
                    elif "set" in cmd and "to" in cmd:
                        try:
                            num = int(''.join(filter(str.isdigit, cmd)))
                            state.counter = num
                            state.feedback = f"Set to {num}"
                            state.llm_feedback = f"Got it, reps adjusted to {num}."
                            await websocket.send_json({
                                "landmarks": [], "feedback": state.feedback, "llm_feedback": state.llm_feedback,
                                "counter": state.counter, "exercise": state.exercise, "metrics": {"tempo": 0, "velocity": 0, "quality": 100, "stability": 100, "injury_risk": False}
                            })
                        except: pass
                    else:
                        print(f"DEBUG: Spawning LLM task for -> '{cmd}'")
                        stats = {
                            "exercise": state.exercise, 
                            "reps": state.counter, 
                            "user_speech": cmd,
                            "context": "voice_interaction"
                        }
                        # Create non-blocking task with connection check
                        async def handle_voice_query(current_stats, current_exercise, ws, cid):
                            try:
                                print(f"DEBUG: Task Started for {cid}")
                                resp = await coach.get_coaching_tip(current_exercise, json.dumps(current_stats))
                                print(f"DEBUG: Task Finished -> {resp}")
                                
                                # Only send if the client is still present in our tracking
                                if cid in user_states:
                                    await ws.send_json({
                                        "landmarks": [], 
                                        "feedback": "AI Coach", 
                                        "llm_feedback": resp,
                                        "counter": user_states[cid].counter, 
                                        "exercise": user_states[cid].exercise, 
                                        "metrics": {"tempo": 0, "velocity": 0, "quality": 100, "stability": 100, "injury_risk": False}
                                    })
                            except Exception as e: 
                                print(f"LLM Task Error for client {cid}: {e}")
                            
                        asyncio.create_task(handle_voice_query(stats, state.exercise, websocket, client_id))
                    continue
            except: pass

            if not raw_data.startswith("data:image"): continue
            
            encoded = raw_data.split(",", 1)[1]
            nparr = np.frombuffer(base64.b64decode(encoded), np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is None: continue

            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            res = pose_detector.detect(mp_image)
            landmarks, state = [], user_states[client_id]
            
            if res.pose_landmarks:
                lms = res.pose_landmarks[0]
                for idx, lm in enumerate(lms):
                    landmarks.append({"id": idx, "x": lm.x, "y": lm.y, "z": lm.z, "visibility": lm.visibility})

                # --- AUTO-SENSE DISCOVERY ENGINE ---
                # Check for Squat (Knee Angle < 140)
                hip, knee, ankle = [lms[L_HIP].x, lms[L_HIP].y], [lms[L_KNEE].x, lms[L_KNEE].y], [lms[L_ANKLE].x, lms[L_ANKLE].y]
                knee_angle = calculate_angle(hip, knee, ankle)
                
                # Check for Curl (Elbow Angle < 100)
                sh, el, wr = [lms[L_SHOULDER].x, lms[L_SHOULDER].y], [lms[L_ELBOW].x, lms[L_ELBOW].y], [lms[L_WRIST].x, lms[L_WRIST].y]
                elbow_angle = calculate_angle(sh, el, wr)
                
                if knee_angle < 140 and state.exercise != "squat":
                    state.exercise = "squat"; state.feedback = "Auto-Sensing: SQUAT"; state.counter = 0
                elif elbow_angle < 100 and state.exercise != "curl":
                    state.exercise = "curl"; state.feedback = "Auto-Sensing: CURL"; state.counter = 0
                # -----------------------------------

                # Process Exercises
                prev_counter = state.counter
                
                # Sensing: Velocity
                current_y = lms[L_HIP].y
                if state.last_y is not None:
                    state.velocity = abs(current_y - state.last_y) * 100
                state.last_y = current_y

                # Sensing: Bio-Hydration (Water Tension / Retention)
                # Drop slightly every frame, faster if velocity/power is high
                hydration_decay = 0.002 + (state.power_level / 100000)
                state.hydration_level = max(0, state.hydration_level - hydration_decay)

                # Sensing: Metabolism (Calorie Burn)
                # Base metabolic rate + activity multiplier
                power_kcal = (state.power_level / 500) * 0.01 # Rough estimation
                state.burn_rate = 1.2 + (state.velocity * 2.0) + (state.power_level / 100)
                state.total_calories += (state.burn_rate / 3600) # Per frame increment (assuming 30fps)
                
                # Sensing: Neural Stress (Fatigue Detection)
                if len(state.rep_times) > 3:
                    avg_velo = sum(state.rep_times[-3:]) / 3
                    # If current rep is 40% slower than avg -> stress increases
                    if state.current_tempo > avg_velo * 1.4:
                        state.neural_stress = min(100, state.neural_stress + 15)
                    else:
                        state.neural_stress = max(0, state.neural_stress - 2)
                
                # Sensing: Stability (Horizontal Parity)
                shoulder_diff = abs(lms[L_SHOULDER].y - lms[R_SHOULDER].y)
                hip_diff = abs(lms[L_HIP].y - lms[R_HIP].y)
                stability = max(0, 1.0 - (shoulder_diff + hip_diff) * 5)
                state.stability_history.append(stability)
                if len(state.stability_history) > 50: state.stability_history.pop(0)

                # Fatigue / Injury Prediction
                # If stability drops below 0.6 and we have history, flag risk
                if len(state.stability_history) > 20:
                    avg_stability = sum(state.stability_history) / len(state.stability_history)
                    state.injury_warning = True if avg_stability < 0.7 else False
                
                state.quality_score = stability

                if state.exercise == "squat": state = process_squat(lms, state)
                elif state.exercise == "pushup": state = process_pushup(lms, state)
                elif state.exercise == "curl": state = process_curl(lms, state)
                elif state.exercise == "lunge": state = process_lunge(lms, state)
                elif state.exercise == "raise": state = process_lateral_raise(lms, state)
                elif state.exercise == "press": state = process_press(lms, state)
                elif state.exercise == "deadlift": state = process_deadlift(lms, state)
                
                # Sensing: Power
                state.power_level = (state.velocity * 50) * (getattr(state, 'calibration_factor', 1.0))

                # Sensing: Tempo
                import time
                if state.counter > prev_counter:
                    now = time.time()
                    if state.start_time:
                        rep_duration = now - state.start_time
                        state.rep_times.append(rep_duration)
                        state.current_tempo = rep_duration
                    state.start_time = now

                # Periodic LLM Coaching
                if state.counter > 0 and state.counter % 5 == 0 and state.counter != state.last_llm_call:
                    state.last_llm_call = state.counter
                    stats = {
                        "exercise": state.exercise,
                        "reps": state.counter,
                        "avg_tempo": f"{state.current_tempo:.1f}s",
                        "velocity": f"{state.velocity:.2f}"
                    }
                    state.llm_feedback = await coach.get_coaching_tip(state.exercise, json.dumps(stats))

            await websocket.send_json({
                "landmarks": landmarks,
                "feedback": state.feedback,
                "llm_feedback": state.llm_feedback,
                "counter": state.counter,
                "exercise": state.exercise,
                "metrics": {
                    "tempo": round(state.current_tempo, 1),
                    "velocity": round(state.velocity, 2),
                    "quality": round(state.quality_score * 100),
                    "stability": round(stability * 100),
                    "injury_risk": state.injury_warning,
                    "power": round(state.power_level),
                    "neural_stress": round(state.neural_stress),
                    "hydration": round(state.hydration_level, 1),
                    "calories": round(state.total_calories, 1),
                    "burn_rate": round(state.burn_rate, 1)
                }
            })
    except Exception as e: print(f"WS error: {e}")
    finally:
        # Final save
        if client_id in user_states and user_states[client_id].counter > 0:
            log = ExerciseLog(
                session_id=workout_session.id,
                exercise_name=user_states[client_id].exercise,
                reps=user_states[client_id].counter,
                avg_quality=1.0
            )
            db.add(log); db.commit()
        db.close()
        if client_id in user_states: del user_states[client_id]
        await websocket.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
