"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Camera, Activity, Trophy, AlertCircle, Mic, MicOff, Heart, Zap, Brain, Droplets, Flame, Bell, BellDot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import WorkoutDashboard from './WorkoutDashboard';
import DietPlanner from './DietPlanner';
import { Utensils } from 'lucide-react';

const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // Shoulders and arms
  [11, 23], [12, 24], [23, 24], // Torso
  [23, 25], [24, 26], [25, 27], [26, 28], // Legs
];

export default function GymTrainer({ userId }: { userId: number }) {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [feedback, setFeedback] = useState("Initializing...");
  const [reps, setReps] = useState(0);
  const [exercise, setExercise] = useState("squat");
  const [llmFeedback, setLlmFeedback] = useState("");
  const [metrics, setMetrics] = useState({ tempo: 0, velocity: 0, quality: 100, stability: 100, injury_risk: false, power: 0, neural_stress: 0, hydration: 100, calories: 0, burn_rate: 0 });
  const [pulse, setPulse] = useState(72);
  const [stabilityHistory, setStabilityHistory] = useState<number[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [summary, setSummary] = useState<{ text: string, logs: any[] } | null>(null);
  const [view, setView] = useState<'trainer' | 'diet'>('trainer');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [autoSense, setAutoSense] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const lastNotifyTime = useRef<number>(0);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstall = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choice: any) => {
        if (choice.outcome === 'accepted') setDeferredPrompt(null);
      });
    }
  };

  useEffect(() => {
    if ("Notification" in window) {
      if (Notification.permission === "granted") setNotificationsEnabled(true);
      else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(p => {
           if (p === "granted") setNotificationsEnabled(true);
        });
      }
    }
  }, []);

  const sendNotification = (title: string, body: string) => {
    const now = Date.now();
    if (notificationsEnabled && now - lastNotifyTime.current > 30000) { // Throttling: 30s
       new Notification(title, { body, icon: "/logo192.png" });
       lastNotifyTime.current = now;
    }
  };

  const startSpeechToText = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).Recognition;
    if (!SpeechRecognition) {
      setFeedback("Voice Commands not supported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    // STEP 1: Speak first, THEN start listening once speech is done
    // This prevents the mic from hearing the computer's own voice
    const introUtterance = new SpeechSynthesisUtterance("I'm listening.");
    introUtterance.onend = () => {
      try {
        recognition.start();
        setIsListening(true);
      } catch (e) { console.error(e); }
    };
    window.speechSynthesis.speak(introUtterance);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      console.log("Voice Command Recognized:", transcript);
      setFeedback(`Question: "${transcript}"...`);
      setIsThinking(true); // Show thinking state
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ command: transcript }));
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (err: any) => {
      console.error("Mic error:", err.error);
      setIsListening(false);
    };
  };

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      console.log("Speaking:", text);
      // Cancel previous only if it's very long, or just let them queue
      // window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      // Ensure it speaks even if another is playing
      window.speechSynthesis.speak(utterance);
    }
  };

  const switchExercise = (newEx: string) => {
    setExercise(newEx);
    setReps(0);
    setLlmFeedback("");
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ exercise: newEx }));
    }
  };

  const lastSpokenRef = useRef("");

  const connectWS = useCallback(() => {
    console.log('Attempting to connect to WebSocket...');
    const ws = new WebSocket('ws://127.0.0.1:8000/ws/pose');
    ws.onopen = () => {
      console.log('Connected to backend');
      setIsConnected(true);
      setFeedback("Ready to Workout");
      ws.send(JSON.stringify({ user_id: userId, exercise }));
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.session_id) setSessionId(data.session_id);

      // Update feedback text
      if (data.feedback !== feedback) {
        setFeedback(data.feedback);
        if (data.feedback.includes("/")) {
          const repCount = data.feedback.split("/")[0].split("!").pop().trim();
          speak(repCount);
        }
      }

      // Voice response handling
      if (data.llm_feedback && data.llm_feedback !== lastSpokenRef.current) {
        setLlmFeedback(data.llm_feedback);
        speak(data.llm_feedback);
        lastSpokenRef.current = data.llm_feedback;
        setIsThinking(false); // Stop thinking once answer arrives
      }

      if (data.metrics) {
        setMetrics(data.metrics);
        if (data.exercise && data.exercise !== exercise && autoSense) {
          setExercise(data.exercise);
        }
        if (data.metrics.neural_stress > 85) {
          sendNotification("CRITICAL FATIGUE", "Muscle failure imminent. Bio-Sync recommends an immediate pause.");
        }
        if (data.metrics.hydration < 50) {
          sendNotification("HYDRATION ALERT", "Water tension critical. Drink water to maintain ion-balance.");
        }
        setStabilityHistory(prev => {
          const newHistory = [...prev, data.metrics.stability];
          return newHistory.slice(-20); // Keep last 20 points
        });
      }

      // Simulate heart rate increase based on reps/activity
      setPulse(prev => {
        const target = 70 + (data.counter * 5) + (data.metrics?.velocity * 10 || 0);
        return Math.floor(prev + (target - prev) * 0.1);
      });

      setReps(data.counter);
      drawPose(data.landmarks, data.metrics?.stability || 100);
    };
    ws.onclose = () => {
      console.log('Disconnected from backend');
      setIsConnected(false);
      setFeedback("Connection lost. Reconnecting...");
      setTimeout(connectWS, 3000);
    };
    wsRef.current = ws;
  }, [exercise]);

  const endWorkout = async () => {
    if (!sessionId) return;
    setFeedback("Syncing Bio-Results...");
    try {
      const res = await fetch(`http://localhost:8000/session/${sessionId}/summary`);
      const data = await res.json();
      setSummary({ text: data.summary, logs: data.logs });
      speak("Workout synced. Here is your evaluation.");
    } catch (e) {
      setFeedback("Failed to sync session.");
    }
  };

  useEffect(() => {
    connectWS();
    return () => {
      wsRef.current?.close();
    };
  }, [connectWS]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Improved logic: Only send if we are connected and not currently processing too much
      if (webcamRef.current && isConnected && wsRef.current?.readyState === WebSocket.OPEN) {
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
          wsRef.current.send(imageSrc);
        }
      }
    }, 200); // Throttled to 5 FPS to reduce connection drops

    return () => clearInterval(interval);
  }, [isConnected]);

  const drawPose = (landmarks: any[], stability: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks || landmarks.length === 0) return;
    const width = canvas.width, height = canvas.height;

    // Bio-Glow Color Logic
    let color = '#3b82f6'; // Default Blue
    if (stability < 85) color = '#fbbf24'; // Yellow
    if (stability < 70) color = '#ef4444'; // Red

    ctx.strokeStyle = color;
    ctx.lineWidth = stability < 70 ? 5 : 3; // Thicker lines if unstable
    ctx.shadowBlur = stability < 70 ? 20 : 0;
    ctx.shadowColor = color;
    
    POSE_CONNECTIONS.forEach(([startIdx, endIdx]) => {
      const start = landmarks[startIdx], end = landmarks[endIdx];
      if (start && end && start.visibility > 0.5 && end.visibility > 0.5) {
        ctx.beginPath();
        ctx.moveTo(start.x * width, start.y * height);
        ctx.lineTo(end.x * width, end.y * height);
        ctx.stroke();
      }
    });
    ctx.shadowBlur = 0; // Reset shadow
    ctx.fillStyle = '#f59e0b';
    landmarks.forEach((lm) => {
      if (lm.visibility > 0.5) {
        ctx.beginPath();
        ctx.arc(lm.x * width, lm.y * height, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  };

  if (view === 'diet') {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
        <DietPlanner userId={userId} onBack={() => setView('trainer')} />
      </div>
    );
  }

  return (
    <div className="flex flex-col xl:flex-row gap-6 w-full max-w-7xl mx-auto min-h-[700px]">
      {/* Left Column: Camera Feed */}
      <div className="relative flex-1 overflow-hidden rounded-3xl bg-slate-900 shadow-2xl border border-slate-800 min-h-[500px]">
        <div className="absolute top-0 left-0 right-0 z-20 p-6 flex justify-between items-start bg-gradient-to-b from-slate-900/80 to-transparent">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white uppercase tracking-tighter">ProTrainer <span className="text-blue-500">v2.0</span></h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">{isConnected ? 'Biometric Sync Active' : 'Disconnected'}</p>
            </div>
          </div>

           <div className="bg-slate-800/80 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-700 flex items-center gap-3">
             <Trophy className="w-5 h-5 text-yellow-400" />
             <div>
               <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest leading-none mb-1">Set Progress</p>
               <p className="text-xl font-black text-white leading-none">{reps}</p>
             </div>
           </div>

           <button
             onClick={() => setAutoSense(!autoSense)}
             className={`px-4 py-2 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${autoSense ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
           >
              <Brain className={`w-4 h-4 ${autoSense ? 'animate-pulse' : ''}`} />
              {autoSense ? 'Auto-Sense: ON' : 'Auto-Sense: OFF'}
           </button>

          <button
            onClick={startSpeechToText}
            className={`p-3 rounded-full border transition-all ${isListening ? 'bg-red-500 border-red-400 animate-pulse' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-blue-500'}`}
          >
            {isListening ? <Mic className="w-6 h-6 text-white" /> : isThinking ? <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <Mic className="w-6 h-6" />}
          </button>

          <button
            onClick={endWorkout}
            className="px-6 py-2 rounded-xl bg-blue-600/10 border border-blue-500/50 text-[10px] font-black text-blue-400 hover:bg-blue-600 hover:text-white transition-all uppercase tracking-widest"
          >
            End & Sync
          </button>

          <button
            onClick={() => setView('diet')}
            className="p-3 rounded-xl bg-emerald-600/10 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all shrink-0"
            title="Nutrition Lab"
          >
            <Utensils className="w-5 h-5" />
          </button>

          <div className={`p-3 rounded-xl border transition-all ${notificationsEnabled ? 'bg-blue-600/10 border-blue-500/50 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
             {notificationsEnabled ? <BellDot className="w-5 h-5 animate-pulse" /> : <Bell className="w-5 h-5" />}
          </div>

          {deferredPrompt && (
            <button
              onClick={handleInstall}
              className="px-6 py-2 rounded-xl bg-yellow-600/10 border border-yellow-500/50 text-[10px] font-black text-yellow-500 hover:bg-yellow-600 hover:text-white transition-all uppercase tracking-widest"
            >
              Install App
            </button>
          )}
        </div>

        <div className="relative h-full bg-black flex items-center justify-center min-h-[500px]">
          <Webcam ref={webcamRef} screenshotFormat="image/jpeg" className="w-full h-full object-cover" mirrored={true} />
          {/* Biometric Sensing Overlays */}
          <div className="absolute top-6 right-6 z-30 space-y-3">
             <motion.div 
                animate={{ scale: [1, 1.05, 1], borderColor: metrics.power > 15 ? ['rgba(239,68,68,0.3)', 'rgba(59,130,246,1)', 'rgba(239,68,68,0.3)'] : 'rgba(239,68,68,0.3)' }} 
                transition={{ repeat: Infinity, duration: pulse > 0 ? 60/pulse : 1 }}
                className="bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border flex flex-col items-center justify-center min-w-[100px]"
              >
                <Heart className="w-6 h-6 text-red-500 mb-1" />
                <span className="text-2xl font-black text-white">{pulse}</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">BPM SENSOR</span>
              </motion.div>

              <motion.div 
                animate={{ boxShadow: metrics.power > 20 ? '0 0 20px rgba(59,130,246,0.5)' : 'none' }}
                className="bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border border-blue-500/30 flex flex-col items-center justify-center min-w-[100px]"
              >
                <Zap className="w-6 h-6 text-blue-400 mb-1" />
                <span className="text-2xl font-black text-white">{metrics.power}</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">POWER LEVEL</span>
              </motion.div>

              <motion.div 
                animate={{ borderColor: metrics.neural_stress > 70 ? 'rgba(249,115,22,0.8)' : 'rgba(100,116,139,0.3)' }}
                className="bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border flex flex-col items-center justify-center min-w-[100px]"
              >
                <Brain className={`w-6 h-6 mb-1 ${metrics.neural_stress > 70 ? 'text-orange-500 animate-pulse' : 'text-slate-400'}`} />
                <span className="text-2xl font-black text-white">{metrics.neural_stress}%</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">NEURAL STRESS</span>
              </motion.div>

              <div className="bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border border-blue-400/20 flex flex-col items-center justify-center min-w-[100px]">
                <Droplets className={`w-6 h-6 mb-1 ${metrics.hydration < 70 ? 'text-blue-400 animate-bounce' : 'text-blue-500'}`} />
                <span className="text-2xl font-black text-white">{metrics.hydration}%</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">ION HYDRATION</span>
              </div>

              <div className="bg-slate-900/60 backdrop-blur-md p-4 rounded-2xl border border-orange-500/20 flex flex-col items-center justify-center min-w-[100px]">
                <Flame className={`w-6 h-6 mb-1 ${metrics.burn_rate > 5 ? 'text-orange-500 animate-pulse' : 'text-orange-400'}`} />
                <div className="flex flex-col items-center leading-none">
                    <span className="text-2xl font-black text-white">{metrics.calories}</span>
                    <span className="text-[10px] font-bold text-orange-500 mt-1">{metrics.burn_rate} <span className="text-[7px] text-slate-500">KC/M</span></span>
                </div>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">METABOLISM</span>
              </div>
          </div>

          <div className="absolute bottom-6 right-6 z-30 flex flex-col gap-3">
            <div className="bg-slate-900/80 backdrop-blur-md px-4 py-3 rounded-2xl border border-slate-700 w-48">
              <div className="flex justify-between items-end mb-2">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">Stability Index</p>
                <p className="text-xs font-black text-emerald-400">{metrics.stability}%</p>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${metrics.stability}%` }}
                  className={`h-full transition-all ${metrics.stability > 80 ? 'bg-emerald-500' : 'bg-orange-500'}`}
                />
              </div>
            </div>

            <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-700 flex justify-between items-center group">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 group-hover:text-blue-400 transition-colors">Eccentric Tempo</p>
              <p className="text-sm font-black text-blue-400">{metrics.tempo}s</p>
            </div>
          </div>

          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" width={1280} height={720} style={{ transform: 'scaleX(-1)' }} />

          {/* Injury Risk Alert */}
          <AnimatePresence>
            {metrics.injury_risk && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-x-0 bottom-32 flex justify-center z-40">
                <div className="bg-red-600 px-6 py-2 rounded-full shadow-[0_0_40px_rgba(220,38,38,0.8)] border-2 border-white/30 flex items-center gap-2 animate-pulse">
                  <AlertCircle className="text-white w-5 h-5" />
                  <span className="font-black text-white uppercase text-sm">Injury Risk Detected — Pause & Correct Pose</span>
                </div>
              </motion.div>
            )}
            
            {metrics.neural_stress > 85 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-1/3 flex justify-center z-50">
                <div className="bg-orange-600/90 backdrop-blur-md px-8 py-4 rounded-3xl border border-orange-400 shadow-[0_0_50px_rgba(234,88,12,0.6)] text-center">
                  <Brain className="w-8 h-8 text-white mx-auto mb-2 animate-bounce" />
                  <p className="text-lg font-black text-white uppercase tracking-tighter italic">FATIGUE AT CAPACITY</p>
                  <p className="text-[10px] text-white/80 font-bold uppercase mt-1 tracking-widest">Neural Drive Exhausted. Bio-Sync Recommends Rest.</p>
                </div>
              </motion.div>
            )}
            {metrics.hydration < 50 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-0 bottom-48 flex justify-center z-40 px-6">
                <div className="bg-blue-600/90 backdrop-blur-md px-8 py-3 rounded-2xl border border-blue-400 shadow-[0_0_30px_rgba(37,99,235,0.5)] text-center">
                  <p className="text-sm font-black text-white uppercase tracking-widest leading-none">Hydration Low</p>
                  <p className="text-[10px] text-white/80 font-bold uppercase mt-1 tracking-widest">Water Tension Critical. Sync Ion-Flow (Drink Water).</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Smart Coach Feedback */}
          <AnimatePresence>
            {llmFeedback && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute top-24 right-6 z-30 max-w-xs">
                <div className="bg-emerald-600/90 backdrop-blur-lg px-4 py-3 rounded-2xl shadow-xl border border-emerald-400/50">
                  <p className="text-[10px] font-black text-emerald-100 uppercase mb-1 tracking-widest">AI Intelligence</p>
                  <p className="text-sm font-medium text-white italic">"{llmFeedback}"</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Real-time Feedback Bubble */}
          <AnimatePresence mode="wait">
            <motion.div key={isConnected ? feedback : "recon"} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30">
              <div className={`bg-blue-600/90 backdrop-blur-lg px-8 py-3 rounded-full shadow-[0_0_30px_rgba(37,99,235,0.4)] border border-blue-400/50 flex items-center gap-3`}>
                <AlertCircle className={`w-5 h-5 ${isConnected ? 'text-white' : 'text-red-400 animate-pulse'}`} />
                <p className="text-lg font-black text-white whitespace-nowrap uppercase tracking-wide">
                  {isConnected ? feedback : "Synchronizing Biological Link..."}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Right Column: Dashboard */}
      <div className="w-full xl:w-96 flex flex-col gap-6 h-full min-h-[700px]">
        <WorkoutDashboard 
          onSelectExercise={switchExercise} 
          currentEx={exercise} 
          realTimeStability={stabilityHistory}
          reps={reps}
          userId={userId}
        />
      </div>

      {/* Post-Workout Summary Overlay */}
      <AnimatePresence>
        {summary && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-xl bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl relative"
            >
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-blue-600 p-4 rounded-2xl shadow-lg border border-blue-400">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              
              <div className="text-center mt-6 mb-8">
                <h2 className="text-2xl font-black text-white italic uppercase">Session Execution Report</h2>
                <p className="text-xs font-bold text-slate-500 tracking-[0.3em] uppercase mt-1">Neuro-Agent Performance Evaluation</p>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                  <p className="text-sm font-medium text-slate-300 leading-relaxed italic">
                    "{summary.text}"
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {summary.logs.map((log, i) => (
                    <div key={i} className="p-4 bg-slate-950/50 rounded-xl border border-slate-800 flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-500 uppercase">{log.exercise}</span>
                      <span className="text-lg font-black text-blue-500">{log.reps} <span className="text-[10px] text-slate-600">REPS</span></span>
                    </div>
                  ))}
                </div>
              </div>

              <button 
                onClick={() => setSummary(null)}
                className="w-full mt-8 bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-xl font-black uppercase tracking-widest transition-all"
              >
                Close Bio-Feed
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
