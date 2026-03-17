import React, { useState } from 'react';
import { Dumbbell, Target, Zap, TrendingUp, ChevronRight, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const MOCK_TREND_DATA = [
  { time: '1', stability: 70, velocity: 4 },
  { time: '2', stability: 85, velocity: 5 },
  { time: '3', stability: 80, velocity: 3 },
  { time: '4', stability: 95, velocity: 4 },
  { time: '5', stability: 90, velocity: 6 },
  { time: '6', stability: 88, velocity: 5 },
];

const CATEGORIES = [
  { id: 'strength', name: 'Strength', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'hiit', name: 'HIIT/Cardio', icon: <Zap className="w-4 h-4" /> },
  { id: 'functional', name: 'Functional', icon: <Target className="w-4 h-4" /> },
];

const INDIVIDUAL_EXERCISES = [
  { id: 'squat', name: 'Squats', cat: 'strength', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'pushup', name: 'Pushups', cat: 'strength', icon: <Zap className="w-4 h-4" /> },
  { id: 'curl', name: 'Curls', cat: 'strength', icon: <Dumbbell className="w-4 h-4" /> },
  { id: 'press', name: 'OH Press', cat: 'strength', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'deadlift', name: 'Deadlift', cat: 'strength', icon: <Target className="w-4 h-4" /> },
  { id: 'lunge', name: 'Lunges', cat: 'functional', icon: <Target className="w-4 h-4" /> },
  { id: 'raise', name: 'Lat Raise', cat: 'strength', icon: <Dumbbell className="w-4 h-4" /> },
];

export default function WorkoutDashboard({ 
  onSelectExercise, 
  currentEx, 
  realTimeStability = [],
  reps = 0,
  userId
}: { 
  onSelectExercise: (ex: string) => void, 
  currentEx: string,
  realTimeStability?: number[],
  reps?: number,
  userId: number
}) {
  const [activeCat, setActiveCat] = useState('strength');
  const [calibrating, setCalibrating] = useState(false);
  const [calibMsg, setCalibMsg] = useState("");

  const handleRecalibrate = async () => {
    setCalibrating(true);
    setCalibMsg("Analyzing historical biomechanics...");
    try {
      const res = await fetch(`http://localhost:8000/train-personal-model?user_id=${userId}`, { method: 'POST' });
      const data = await res.json();
      setCalibMsg(data.message || data.error);
    } catch (e) {
      setCalibMsg("Recalibration failed.");
    } finally {
      setCalibrating(false);
      setTimeout(() => setCalibMsg(""), 5000);
    }
  };
  
  // Transform real-time stability into chart data
  const chartData = realTimeStability.length > 0 
    ? realTimeStability.map((val, i) => ({ time: i.toString(), stability: val }))
    : MOCK_TREND_DATA;
  
  return (
    <div className="p-6 space-y-8 bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800 h-full overflow-y-auto custom-scrollbar">
      <div className="space-y-4">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Training Categories</h3>
        <div className="flex gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all border ${activeCat === cat.id ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}`}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Select Exercise</h3>
        <div className="grid grid-cols-2 gap-3">
          {INDIVIDUAL_EXERCISES.filter(ex => ex.cat === activeCat).map((ex) => (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              key={ex.id}
              onClick={() => onSelectExercise(ex.id)}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${currentEx === ex.id ? 'bg-blue-600 border-blue-400 shadow-lg text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'}`}
            >
              <div className={`${currentEx === ex.id ? 'text-white' : 'text-blue-500'}`}>
                {ex.icon}
              </div>
              <span className="text-xs font-bold uppercase">{ex.name}</span>
            </motion.button>
          ))}
        </div>
      </div>

      <div className="pt-6 border-t border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Performance Trends</h3>
          <BarChart3 className="w-4 h-4 text-slate-600" />
        </div>
        <div className="h-40 w-full bg-slate-800/50 rounded-xl p-2 border border-slate-700">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorStab" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', fontSize: '10px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area type="monotone" dataKey="stability" stroke="#3b82f6" fillOpacity={1} fill="url(#colorStab)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="pt-6 border-t border-slate-800">
         <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Session Milestones</h3>
         <div className="space-y-2">
            <div className={`p-3 rounded-lg border transition-all ${reps >= 10 ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
               <p className="text-[10px] font-bold uppercase">Consistency Streak (10 Reps)</p>
               <div className="h-1 w-full bg-slate-900 mt-2 rounded-full overflow-hidden">
                 <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, (reps / 10) * 100)}%` }} />
               </div>
            </div>
            {reps >= 10 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-yellow-500/20 p-3 rounded-lg border border-yellow-500/50 text-[10px] text-yellow-400 font-bold uppercase">
                New Milestone: Heavy Set (Target 20)
              </motion.div>
            )}
         </div>

         <div className="mt-6">
            <button 
              onClick={handleRecalibrate}
              disabled={calibrating}
              className="w-full py-3 rounded-xl bg-emerald-600/10 border border-emerald-500/30 text-[10px] font-black text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all uppercase tracking-widest flex items-center justify-center gap-2 group"
            >
              {calibrating ? <Zap className="w-4 h-4 animate-pulse" /> : <Zap className="w-4 h-4" />}
              {calibrating ? "Calibrating..." : "Recalibrate Agent"}
            </button>
            {calibMsg && <p className="text-[9px] font-bold text-center mt-2 text-slate-500 uppercase">{calibMsg}</p>}
         </div>
      </div>
    </div>
  );
}
