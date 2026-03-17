import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, Mail, Lock, User, ArrowRight, Zap, ShieldCheck, Fingerprint } from 'lucide-react';

interface AuthResponse {
  token: string;
  username: string;
  user_id: number;
  error?: string;
}

export default function Login({ onLoginSuccess }: { onLoginSuccess: (user: { id: number, name: string }) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState<'auth' | 'otp'>('auth');
  const [formData, setFormData] = useState({ username: '', email: '', password: '' });
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const endpoint = isLogin ? '/login' : '/register';
    try {
      const response = await fetch(`http://localhost:8000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data: AuthResponse = await response.json();

      if (data.error) {
        if (data.error.includes("verify OTP")) {
          await handleSendOTP();
          setStep('otp');
        } else {
          setError(data.error);
        }
      } else {
        if (!isLogin) {
          await handleSendOTP();
          setStep('otp');
        } else {
          localStorage.setItem('trainer_token', data.token);
          localStorage.setItem('trainer_user', JSON.stringify({ id: data.user_id, name: data.username }));
          onLoginSuccess({ id: data.user_id, name: data.username });
        }
      }
    } catch (err) {
      setError("Server connection failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    await fetch(`http://localhost:8000/send-otp?username=${formData.username}`, { method: 'POST' });
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: formData.username, otp }),
      });
      const data = await response.json();
      if (data.error) setError(data.error);
      else {
        setIsLogin(true);
        setStep('auth');
        setError("Account verified! You can now login.");
      }
    } catch (err) { setError("Verification failed."); }
    finally { setLoading(false); }
  };

  const handleBiometricLogin = async () => {
    // Bio-Auth Simulation using WebAuthn
    if (!window.PublicKeyCredential) {
      setError("Biometrics not supported on this device/browser.");
      return;
    }
    
    setLoading(true);
    setFeedback("Scanning Bio-Signature...");
    
    try {
      // Small delay to simulate sensor scan
      await new Promise(r => setTimeout(r, 1500));
      const savedUser = localStorage.getItem('trainer_user');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        onLoginSuccess(u);
      } else {
        setError("No Bio-Signature found. Please login with password first.");
      }
    } catch (e) {
      setError("Bio-Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const [feedback, setFeedback] = useState("");

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
      <div className="absolute inset-0 bg-blue-600/5 pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-slate-900/40 backdrop-blur-2xl p-8 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden"
      >
        {/* Tech Decor */}
        <div className="absolute top-0 right-0 p-4">
          <ShieldCheck className="w-6 h-6 text-blue-500/30" />
        </div>

        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-4">
            <Dumbbell className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">
            ProTrainer <span className="text-blue-500">v3.5</span>
          </h1>
          <p className="text-slate-500 text-sm font-bold mt-1 tracking-widest uppercase">
            {step === 'otp' ? "Email Verification Sent" : (isLogin ? "Neural Bio-Link Authorization" : "New Agent Initialization")}
          </p>
        </div>

        {feedback && (
          <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400 text-[10px] font-black uppercase text-center animate-pulse">
             {feedback}
          </div>
        )}

        <form onSubmit={step === 'otp' ? handleVerifyOTP : handleAuth} className="space-y-4">
          <div className="space-y-4">
            {step === 'auth' ? (
              <>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                  <input 
                    type="text" 
                    placeholder="USERNAME"
                    required
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-bold"
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                  />
                </div>

                {!isLogin && (
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    <input 
                      type="email" 
                      placeholder="EMAIL ADDRESS"
                      required
                      className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-bold"
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                )}

                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                  <input 
                    type="password" 
                    placeholder="BIO-PIN (PASSWORD)"
                    required
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-bold"
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                  />
                </div>
              </>
            ) : (
              <div className="relative group">
                <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                <input 
                  type="text" 
                  placeholder="6-DIGIT BIO-CODE"
                  required
                  maxLength={6}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 tracking-[1em] text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-black text-xl"
                  onChange={(e) => setOtp(e.target.value)}
                />
              </div>
            )}
          </div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className={`text-xs font-black uppercase text-center py-2 ${error.includes("verified") ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 group transition-all disabled:opacity-50"
          >
            {loading ? "Processing..." : (step === 'otp' ? "VERIFY EMAIL CODE" : (isLogin ? "SYNC LINK" : "INITIALIZE AGENT"))}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>

          {isLogin && step === 'auth' && (
            <button 
              type="button"
              onClick={handleBiometricLogin}
              className="w-full border border-slate-700 hover:border-blue-500/50 text-slate-400 hover:text-white py-4 rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all mt-2"
            >
              <Fingerprint className="w-5 h-5 text-blue-500" />
              Auth via Fingerprint
            </button>
          )}
        </form>

        <div className="mt-8 text-center">
          <button 
            onClick={() => { setIsLogin(!isLogin); setError(""); }}
            className="text-slate-500 hover:text-blue-400 text-xs font-black uppercase tracking-widest transition-colors"
          >
            {isLogin ? "New user? Create Bio-Link" : "Already registered? Sync Link"}
          </button>
        </div>

        {/* Floating Icons for Aesthetic */}
        <div className="mt-8 flex justify-center gap-6 opacity-20">
          <Zap className="w-5 h-5 text-blue-500" />
          <ShieldCheck className="w-5 h-5 text-blue-500" />
          <Dumbbell className="w-5 h-5 text-blue-500" />
        </div>
      </motion.div>
    </div>
  );
}
