import React from 'react';
import { motion } from 'motion/react';
import { 
  Factory as PrecisionManufacturing,
  Lock,
  ArrowRight as ArrowForward,
  HelpCircle as HelpCenter,
  ShieldAlert as GppMaybe,
  Users as Groups
} from 'lucide-react';

interface LoginViewProps {
  onLogin: (e: React.FormEvent) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => (
  <div className="min-h-full flex flex-col industrial-grid px-6 py-8 relative">
    <header className="flex justify-between items-center mb-12">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary flex items-center justify-center">
          <PrecisionManufacturing className="text-on-primary w-5 h-5" />
        </div>
        <h1 className="font-headline text-sm font-black tracking-widest uppercase text-white">
          SITE <span className="text-primary">CORE</span>
        </h1>
      </div>
    </header>

    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full bg-surface/90 backdrop-blur-xl p-8 shadow-2xl relative rounded-3xl"
    >
      <div className="mb-10 text-center">
        <p className="font-sans text-[10px] uppercase tracking-[0.3em] text-primary font-black mb-1">Access Portal</p>
        <h3 className="font-headline text-lg font-bold uppercase tracking-widest text-on-surface">Sign In</h3>
        <div className="mt-4 mx-auto h-0.5 w-8 bg-primary" />
      </div>

      <form className="space-y-6" onSubmit={onLogin}>
        <div className="group">
          <label className="font-headline text-[10px] font-bold uppercase tracking-widest text-on-surface-variant block mb-2">Email Address</label>
          <div className="relative border-b-2 border-outline-variant/30 focus-within:border-primary">
            <input 
              className="w-full bg-transparent border-none focus:ring-0 text-on-surface font-headline font-bold uppercase tracking-wider placeholder:text-outline-variant/60 py-2 h-10" 
              placeholder="supervisor@site.com"
              type="email"
            />
            <Groups className="absolute right-0 bottom-2 text-on-surface-variant/40 w-5 h-5" />
          </div>
        </div>
        <div className="group">
          <label className="font-headline text-[10px] font-bold uppercase tracking-widest text-on-surface-variant block mb-2">Password</label>
          <div className="relative border-b-2 border-outline-variant/30 focus-within:border-primary">
            <input 
              className="w-full bg-transparent border-none focus:ring-0 text-on-surface font-bold tracking-widest placeholder:text-outline-variant/60 py-2 h-10" 
              placeholder="••••••••••••" 
              type="password"
            />
            <Lock className="absolute right-0 bottom-2 text-on-surface-variant/40 w-5 h-5" />
          </div>
        </div>

        <div className="pt-4 space-y-4">
          <button 
            type="submit"
            className="w-full h-14 bg-primary text-on-primary font-headline font-black uppercase tracking-widest flex items-center justify-center gap-3 active-press shadow-lg rounded-xl"
          >
            <span>Login</span>
            <ArrowForward className="w-5 h-5" />
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-outline-variant/30"></div></div>
            <div className="relative flex justify-center text-[8px] uppercase font-bold tracking-widest text-on-surface-variant bg-surface px-2 w-fit mx-auto">Or Continue With</div>
          </div>

          <button 
            type="button"
            className="w-full h-14 bg-white border border-outline-variant/50 text-on-surface font-headline font-black uppercase tracking-widest flex items-center justify-center gap-3 active-press shadow-sm rounded-xl"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M0 0h24v24H0z" fill="none"/>
            </svg>
            <span>Login with Google</span>
          </button>
        </div>
      </form>
    </motion.div>

    <div className="mt-auto pt-8 pb-4 text-center">
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white/10 backdrop-blur p-4 text-center text-white/60">
          <HelpCenter className="w-5 h-5 mx-auto mb-2" />
          <span className="text-[9px] font-bold uppercase tracking-widest">Support</span>
        </div>
        <div className="bg-white/10 backdrop-blur p-4 text-center text-white/60">
          <GppMaybe className="w-5 h-5 mx-auto mb-2" />
          <span className="text-[9px] font-bold uppercase tracking-widest">Protocol</span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 text-white/30 font-headline text-[8px] uppercase tracking-[0.3em] font-medium">
        <div className="flex items-center gap-3">
          <span>v2.4.08 STABLE</span>
          <span className="w-1 h-1 bg-white/20 rounded-full"></span>
          <span>AES-256 ENC</span>
        </div>
        <div>© 2026 PRECISION CORE SYSTEMS</div>
      </div>
    </div>
  </div>
);
