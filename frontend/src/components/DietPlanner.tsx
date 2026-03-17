import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Utensils, Apple, Droplets, Zap, ChevronLeft, Brain, Sparkles } from 'lucide-react';

export default function DietPlanner({ userId, onBack }: { userId: number, onBack: () => void }) {
  const [prediction, setPrediction] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`http://localhost:8000/predict-diet?user_id=${userId}`)
      .then(res => res.json())
      .then(data => {
        setPrediction(data.prediction);
        setLoading(false);
      })
      .catch(() => {
        setPrediction("Neural connection to Nutrition Lab failed. Try reloading.");
        setLoading(false);
      });
  }, [userId]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto p-6 bg-slate-950/50 backdrop-blur-xl rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="flex items-center justify-between z-10">
        <button 
          onClick={onBack}
          className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 transition-all group"
        >
          <ChevronLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
        </button>
        <div className="flex flex-col items-end">
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">
            Nutrition <span className="text-emerald-500">Lab</span>
          </h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] leading-none">Neural Diet Prediction v1.0</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 z-10">
        <div className="bg-slate-900/80 p-6 rounded-3xl border border-slate-800 flex flex-col items-center hover:border-emerald-500/30 transition-all group">
            <div className="p-4 rounded-2xl bg-emerald-500/20 mb-4 group-hover:scale-110 transition-transform">
                <Apple className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-sm font-black text-white uppercase mb-1">Macro Precision</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase text-center">Calculated based on training volume</p>
        </div>
        <div className="bg-slate-900/80 p-6 rounded-3xl border border-slate-800 flex flex-col items-center hover:border-blue-500/30 transition-all group">
            <div className="p-4 rounded-2xl bg-blue-500/20 mb-4 group-hover:scale-110 transition-transform">
                <Droplets className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-sm font-black text-white uppercase mb-1">Ion Balance</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase text-center">Syncing with real-time hydration</p>
        </div>
        <div className="bg-slate-900/80 p-6 rounded-3xl border border-slate-800 flex flex-col items-center hover:border-yellow-500/30 transition-all group">
            <div className="p-4 rounded-2xl bg-yellow-500/20 mb-4 group-hover:scale-110 transition-transform">
                <Zap className="w-8 h-8 text-yellow-500" />
            </div>
            <h3 className="text-sm font-black text-white uppercase mb-1">Fueling Timing</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase text-center">Optimizing anabolic window</p>
        </div>
      </div>

      <div className="bg-gradient-to-br from-slate-900 to-slate-900/50 p-8 rounded-[2rem] border border-slate-800 relative z-10 group min-h-[300px]">
        <div className="absolute top-6 right-8">
            <Sparkles className="w-6 h-6 text-emerald-400 opacity-20 group-hover:opacity-100 transition-opacity" />
        </div>
        
        <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-8 bg-emerald-500 rounded-full" />
            <h4 className="text-xl font-black text-white uppercase italic tracking-tighter">Your Intelligence-Based Roadmap</h4>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
             <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
             <p className="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">Analyzing Biometric Output...</p>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-slate-300 font-medium leading-relaxed text-lg"
          >
            {prediction.split('. ').map((sentence, idx) => (
              <p key={idx} className="mb-4 flex items-start gap-4">
                 <span className="mt-1.5 w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                 {sentence}
              </p>
            ))}
          </motion.div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-800/50 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
                <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/30">
                    <Brain className="w-5 h-5 text-emerald-500" />
                </div>
                <p className="text-[10px] text-slate-500 font-bold uppercase max-w-[200px] leading-tight text-left">
                    Predictive modeling based on last session's specific load distribution.
                </p>
            </div>
            <button className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-emerald-600/20 active:scale-95">
                Generate Groceries List
            </button>
        </div>
      </div>
    </div>
  );
}
