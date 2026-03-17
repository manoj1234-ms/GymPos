"use client";

import { useState, useEffect } from "react";
import GymTrainer from "@/components/GymTrainer";
import Login from "@/components/Login";

export default function Home() {
  const [user, setUser] = useState<{ id: number; name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('trainer_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  if (loading) return null;

  if (!user) {
    return <Login onLoginSuccess={(u) => setUser(u)} />;
  }

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-7xl w-full">
        <header className="flex justify-between items-center mb-8 px-4">
          <div className="flex flex-col">
            <h1 className="text-2xl font-black tracking-tight text-white italic uppercase">
              ProTrainer <span className="text-blue-500">v3.5</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-[0.2em] uppercase">Authenticated Bio-Link Active</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none mb-1">Agent Identity</p>
              <p className="text-sm font-bold text-blue-400 leading-none">{user.name}</p>
            </div>
            <button 
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white hover:border-red-500/50 transition-all"
            >
              LOGOUT
            </button>
          </div>
        </header>

        <GymTrainer userId={user.id} />
      </div>
    </main>
  );
}
