import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ChevronRight, Plus, Check, X } from 'lucide-react';
import { Category, Subcategory, View } from '../../types';

interface SubcategorySelectionViewProps {
  category: Category | null;
  onSelectSubcategory: (sub: Subcategory) => void;
  navigate: (view: View) => void;
}

export const SubcategorySelectionView: React.FC<SubcategorySelectionViewProps> = ({ 
  category, 
  onSelectSubcategory, 
  navigate 
}) => {
  const [isProposing, setIsProposing] = useState(false);
  const [proposal, setProposal] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handlePropose = () => {
    if (!proposal.trim()) return;
    setIsSubmitted(true);
    setTimeout(() => {
      setIsProposing(false);
      setIsSubmitted(false);
      setProposal('');
    }, 2000);
  };

  return (
    <div className="min-h-full bg-background flex flex-col">
      <header className="h-20 flex items-center px-8 bg-white sticky top-0 z-50 border-b border-outline-variant/30">
        <button onClick={() => navigate('ENTRY_CATEGORIES')} className="mr-6 p-2 bg-surface rounded-xl border border-outline-variant/30 active-press transition-all">
          <ArrowLeft className="w-6 h-6 text-primary" />
        </button>
        <h2 className="font-headline font-black uppercase text-sm tracking-widest text-on-surface">{category?.name} Nodes</h2>
      </header>
      <main className="p-8 space-y-4 max-w-[800px] mx-auto w-full">
        <AnimatePresence mode="popLayout">
          {category?.subcategories.map((sub, idx) => (
            <motion.button
              key={sub.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onSelectSubcategory(sub);
                navigate('ENTRY_FORM');
              }}
              className="w-full bg-white p-6 rounded-[20px] border border-outline-variant/30 flex items-center justify-between shadow-sm hover:border-primary transition-all group"
            >
              <span className="font-bold text-sm uppercase tracking-[0.1em] text-on-surface group-hover:text-primary transition-colors">{sub.name}</span>
              <div className="p-2 transition-transform group-hover:translate-x-1"><ChevronRight className="w-5 h-5 text-primary" /></div>
            </motion.button>
          ))}
        </AnimatePresence>

        <div className="pt-4 mt-8 border-t border-outline-variant/20">
          <AnimatePresence mode="wait">
            {!isProposing ? (
              <motion.button 
                key="add-btn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsProposing(true)}
                className="w-full p-6 border-2 border-dashed border-primary/20 rounded-[24px] text-primary font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary/5 transition-all active-press group"
              >
                <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                Propose New Sub-Node
              </motion.button>
            ) : (
              <motion.div 
                key="form"
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-6 bg-white rounded-[24px] border-2 border-primary/20 shadow-xl shadow-primary/5 space-y-4"
              >
                {!isSubmitted ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black tracking-widest uppercase text-primary">Propose Node</span>
                      <button onClick={() => setIsProposing(false)} className="p-1 opacity-40 hover:opacity-100 transition-opacity"><X size={16}/></button>
                    </div>
                    <input 
                      autoFocus
                      value={proposal}
                      onChange={(e) => setProposal(e.target.value)}
                      placeholder="Node Identifier..."
                      className="w-full p-4 bg-surface rounded-xl border border-outline-variant/30 font-bold uppercase text-xs outline-none focus:border-primary transition-all"
                    />
                    <button 
                      onClick={handlePropose}
                      disabled={!proposal.trim()}
                      className="w-full machined-gradient text-white p-4 rounded-xl font-black uppercase text-[10px] tracking-widest active-press disabled:opacity-50"
                    >
                      Log Proposal
                    </button>
                  </>
                ) : (
                  <div className="py-4 flex flex-col items-center justify-center text-center space-y-3">
                    <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center text-success">
                      <Check size={24} />
                    </div>
                    <div className="space-y-1">
                      <p className="font-headline font-black uppercase text-xs tracking-widest">Proposal Registered</p>
                      <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60">Strategic review initiated</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};
