import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  ChevronRight,
  ShieldAlert, 
  Clock, 
  Hammer, 
  MessageSquare,
  Camera,
  CheckCircle2,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { View } from '../../types';

interface IncidentReportViewProps {
  navigate: (view: View) => void;
  onSubmit: (incident: any) => void;
}

const INCIDENT_CATEGORIES = [
  { id: 'safety', label: 'Safety Violation', icon: ShieldAlert, color: 'text-error', bg: 'bg-error/10' },
  { id: 'delay', label: 'Critical Delay', icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
  { id: 'equipment', label: 'Asset Failure', icon: Hammer, color: 'text-primary', bg: 'bg-primary/10' },
  { id: 'other', label: 'Misc Incident', icon: AlertTriangle, color: 'text-on-surface-variant', bg: 'bg-surface' },
];

export function IncidentReportView({ navigate, onSubmit }: IncidentReportViewProps) {
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      onSubmit({
        category: selectedCategory,
        description,
        timestamp: new Date().toISOString(),
      });
      setStep(3);
      setIsSubmitting(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col min-h-full blueprint-bg overflow-hidden">
      <header className="sticky top-0 z-50 glass-header h-16 flex items-center gap-4 px-6 border-b border-outline-variant/10">
        <button onClick={() => step === 3 ? navigate('HOME') : navigate('SITE_DETAIL')} className="p-2 -ml-2 active-press">
          <ChevronLeft className="w-6 h-6 text-on-surface-variant" />
        </button>
        <h2 className="font-headline font-black uppercase text-xs tracking-[0.2em] text-on-surface-variant flex-1">
          {step === 3 ? 'Signal Transmitted' : 'Incident Protocol'}
        </h2>
      </header>

      <main className="flex-grow p-6 flex flex-col">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="space-y-2">
                <h1 className="text-4xl font-headline font-black uppercase tracking-tighter leading-none">Classify<br/>Impact</h1>
                <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest leading-relaxed opacity-60">
                  Select the category that best describes the site disruption.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {INCIDENT_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { setSelectedCategory(cat.id); setStep(2); }}
                    className={`flex items-center justify-between p-5 rounded-2xl border transition-all active-press ${
                      selectedCategory === cat.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-outline-variant/10 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${cat.bg}`}>
                        <cat.icon className={`w-6 h-6 ${cat.color}`} />
                      </div>
                      <span className="font-headline font-bold uppercase tracking-widest text-sm text-on-surface">{cat.label}</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-outline-variant" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8 h-full flex flex-col"
            >
              <div className="space-y-2">
                <span className="text-primary font-black uppercase text-[10px] tracking-[0.3em]">Protocol Phase 02</span>
                <h1 className="text-3xl font-headline font-black uppercase tracking-tighter leading-tight">Detail the<br/>Situation</h1>
              </div>

              <div className="space-y-4 flex-grow">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-60 ml-1">Incident Brief</label>
                  <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide a concise description of the event..."
                    className="w-full h-40 bg-white rounded-2xl border border-outline-variant/20 p-5 font-bold text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-on-surface-variant/30"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button className="bg-surface rounded-2xl p-4 border border-outline-variant/10 flex flex-col items-center justify-center gap-2 opacity-50 cursor-not-allowed">
                    <Camera className="w-6 h-6" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Add Evidence</span>
                  </button>
                  <button className="bg-surface rounded-2xl p-4 border border-outline-variant/10 flex flex-col items-center justify-center gap-2 opacity-50 cursor-not-allowed">
                    <MessageSquare className="w-6 h-6" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Tag Personnel</span>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <button 
                  onClick={handleSubmit}
                  disabled={!description.trim() || isSubmitting}
                  className={`w-full p-6 h-20 rounded-3xl machined-gradient text-white flex items-center justify-center gap-3 shadow-xl transition-all font-headline font-black uppercase tracking-[0.2em] text-sm active-press ${
                    !description.trim() || isSubmitting ? 'opacity-50 grayscale' : 'shadow-primary/30'
                  }`}
                >
                  {isSubmitting ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                      <Zap className="w-6 h-6" />
                    </motion.div>
                  ) : (
                    <>
                      Transmit Alert
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
                <button onClick={() => setStep(1)} className="w-full text-center py-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-40">Re-classify Category</button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex-grow flex flex-col items-center justify-center text-center space-y-8"
            >
              <div className="w-32 h-32 bg-success/10 rounded-full flex items-center justify-center relative">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 12 }}
                  className="w-24 h-24 bg-success rounded-full flex items-center justify-center text-white shadow-xl shadow-success/20"
                >
                  <CheckCircle2 size={48} />
                </motion.div>
                <div className="absolute inset-0 rounded-full border-4 border-success/20 animate-ping" />
              </div>

              <div className="space-y-3 px-8">
                <h2 className="text-3xl font-headline font-black uppercase tracking-tighter">Site Secure</h2>
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest leading-relaxed opacity-60">
                  Incident reported and transmitted to Strategic Admin. Live telemetry updated.
                </p>
              </div>

              <button 
                onClick={() => navigate('HOME')}
                className="machined-gradient text-white px-10 py-5 rounded-2xl font-headline font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 active-press"
              >
                Return to Core
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

const Zap = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
