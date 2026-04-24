import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft,
  ChevronRight, 
  X as Close, 
  Plus as Add, 
  AlertTriangle as Warning, 
  Search, 
  Check, 
  ChevronsUpDown as UnfoldMoreIcon,
  HelpCircle as HelpCenter
} from 'lucide-react';
import { Category, Subcategory, Entry } from '../../types';

interface EntryFormViewProps {
  category: Category | null;
  subcategory: Subcategory | null;
  navigate: (view: any) => void;
  onSubmitSuccess: (data: any) => void;
  editingEntry?: Entry | null;
}

export const EntryFormView: React.FC<EntryFormViewProps> = ({ 
  category, 
  subcategory, 
  navigate,
  onSubmitSuccess,
  editingEntry
}) => {
  const [formData, setFormData] = useState<Record<string, any>>(editingEntry?.data || {});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [showAddFieldModal, setShowAddFieldModal] = useState(false);
  const [proposedFieldName, setProposedFieldName] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate network delay
    setTimeout(() => {
      setIsSubmitting(false);
      // Randomly simulate error for demo
      if (Math.random() > 0.8) {
        setNetworkError(true);
        setTimeout(() => setNetworkError(false), 5000);
      } else {
        onSubmitSuccess(formData);
        navigate('HOME');
      }
    }, 1500);
  };

  const handleAddField = () => {
    if (proposedFieldName) {
      // Logic would go here to send request to admin
      setShowAddFieldModal(false);
      setProposedFieldName('');
    }
  };

  return (
    <div className="min-h-full bg-background flex flex-col">
      <header className="h-20 flex items-center px-8 bg-white sticky top-0 z-50 border-b border-outline-variant/30">
        <button onClick={() => navigate(editingEntry ? 'HISTORY' : 'ENTRY_SUBCATEGORIES')} className="mr-6 p-2 bg-surface rounded-xl border border-outline-variant/30 active-press transition-all">
          <ArrowLeft className="w-6 h-6 text-primary" />
        </button>
        <h2 className="font-headline font-black uppercase text-sm tracking-widest text-on-surface">
          {editingEntry ? 'Edit Signal' : 'Precision Log'}: {subcategory?.name}
        </h2>
      </header>

      <div className="flex-grow overflow-y-auto p-8 space-y-10 no-scrollbar pb-32">
        <form onSubmit={handleSubmit} className="space-y-10 max-w-[800px] mx-auto w-full">
          <div className="space-y-8">
            {subcategory?.fields.map(field => (
              <div key={field.id} className="space-y-3 group">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant group-focus-within:text-primary transition-colors">
                    {field.label} {field.unit && <span className="opacity-40 ml-1">({field.unit})</span>}
                  </label>
                  {field.type === 'Number' && <span className="text-[8px] font-bold text-on-surface-variant/40 uppercase">Numeric Only</span>}
                </div>
                
                <div className="relative">
                  {field.type === 'Dropdown' ? (
                    <div className="relative">
                      <select 
                        className="w-full h-16 bg-white border border-outline-variant/30 rounded-2xl px-6 font-bold text-sm uppercase tracking-wide appearance-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                        value={formData[field.id] || ''}
                        onChange={e => setFormData({ ...formData, [field.id]: e.target.value })}
                        required
                      >
                        <option value="">Select Option</option>
                        {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                      <UnfoldMoreIcon className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant/40" />
                    </div>
                  ) : (
                    <input 
                      type={field.type === 'Number' ? 'number' : 'text'}
                      className="w-full h-16 bg-white border border-outline-variant/30 rounded-2xl px-6 font-bold text-sm uppercase tracking-wide focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none placeholder:text-on-surface-variant/20"
                      placeholder={`Enter ${field.label}...`}
                      value={formData[field.id] || ''}
                      onChange={e => setFormData({ ...formData, [field.id]: e.target.value })}
                      required
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          <button 
            type="button"
            onClick={() => setShowAddFieldModal(true)}
            className="w-full h-18 bg-surface-container border-2 border-dashed border-outline-variant/50 rounded-2xl flex items-center justify-center gap-4 text-on-surface-variant/60 hover:text-primary hover:border-primary/50 transition-all group active-press"
          >
            <Add className="w-6 h-6" />
            <span className="font-headline font-black text-[11px] uppercase tracking-[0.2em]">Request New Data Field</span>
          </button>
        </form>
      </div>

      <AnimatePresence>
        {showAddFieldModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
            onClick={() => setShowAddFieldModal(false)}
          >
            <motion.div 
              initial={{ y: '100%', scale: 1 }} animate={{ y: 0, scale: 1 }} exit={{ y: '100%', scale: 0.95 }}
              className="bg-white w-full sm:max-w-md rounded-t-[32px] sm:rounded-[32px] p-10 space-y-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h3 className="font-headline font-black text-xl uppercase tracking-tight text-on-surface">Propose Field</h3>
                <button onClick={() => setShowAddFieldModal(false)} className="p-2 bg-surface-container rounded-full active-press"><Close className="w-6 h-6" /></button>
              </div>
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest ml-1">Field Name / Descriptor</label>
                    <input 
                      className="w-full h-14 bg-surface-container border-none focus:ring-2 focus:ring-primary/20 rounded-xl px-4 font-bold uppercase text-xs"
                      placeholder="e.g., Concrete Slump Test"
                      value={proposedFieldName}
                      onChange={e => setProposedFieldName(e.target.value)}
                    />
                 </div>
                 <div className="bg-primary/5 p-4 rounded-xl flex gap-3 text-primary">
                    <HelpCenter className="w-5 h-5 shrink-0" />
                    <p className="text-[10px] font-medium leading-relaxed uppercase tracking-wider">Requested fields will enter the <span className="font-black">Approval Queue</span> for Admin verification before global sync.</p>
                 </div>
                 <button 
                  onClick={handleAddField}
                  disabled={!proposedFieldName}
                  className="w-full h-14 machined-gradient text-white font-headline font-black uppercase text-xs tracking-widest rounded-xl disabled:opacity-50 active-press"
                 >
                   Send for Protocol Review
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-0 w-full p-8 glass-header border-t border-outline-variant/30 flex flex-col gap-4 max-w-[800px] left-1/2 -translate-x-1/2">
        {networkError && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="bg-error text-white p-4 rounded-xl flex items-center gap-3 shadow-lg"
          >
            <Warning className="w-5 h-5 shrink-0" />
            <p className="text-xs font-bold leading-tight uppercase tracking-tight">Sync Failure: System Offline. Re-attempting connection...</p>
          </motion.div>
        )}
        <button 
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full h-16 bg-primary text-on-primary rounded-xl font-headline text-base font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl active-press"
        >
          {isSubmitting ? 'Syncing...' : (
            <>
              {editingEntry ? 'Update Registry' : 'Finalize Log Entry'}
              <Check className="w-6 h-6" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
