import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Plus as Add } from 'lucide-react';
import { Category, View } from '@/lib/types/legacy';

interface CategorySelectionViewProps {
  categories: Category[];
  onSelectCategory: (cat: Category) => void;
  navigate: (view: View) => void;
  iconMap: Record<string, any>;
}

export const CategorySelectionView: React.FC<CategorySelectionViewProps> = ({ 
  categories, 
  onSelectCategory, 
  navigate,
  iconMap
}) => (
  <div className="min-h-full bg-background flex flex-col">
    <header className="h-20 flex items-center px-8 bg-white sticky top-0 z-50 border-b border-outline-variant/30">
      <button onClick={() => navigate('SITE_SELECTION')} className="mr-6 p-2 bg-surface rounded-xl border border-outline-variant/30 active-press transition-all">
        <ArrowLeft className="w-6 h-6 text-primary" />
      </button>
      <h2 className="font-headline font-black uppercase text-sm tracking-widest text-on-surface">Category Protocol</h2>
    </header>
    <main className="p-8 grid grid-cols-2 gap-6 overflow-y-auto no-scrollbar pb-32 max-w-[800px] mx-auto w-full">
      {categories.map(cat => {
        const Icon = iconMap[cat.icon];
        return (
          <motion.button
            key={cat.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              onSelectCategory(cat);
              navigate('ENTRY_SUBCATEGORIES');
            }}
            className="bg-white p-8 rounded-[24px] border border-outline-variant/30 flex flex-col items-center gap-6 shadow-sm hover:shadow-md transition-all group active-press"
          >
            <div className="w-16 h-16 bg-primary/10 text-primary flex items-center justify-center rounded-[20px] group-hover:bg-primary group-hover:text-white transition-colors">
              {Icon && <Icon className="w-8 h-8" />}
            </div>
            <span className="font-headline font-black uppercase text-[10px] tracking-[0.2em] text-on-surface-variant group-hover:text-primary transition-colors text-center">{cat.name}</span>
          </motion.button>
        );
      })}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => alert("Category Proposal Protocol Initiated. Verification required by Admin.")}
        className="bg-primary/5 p-8 rounded-[24px] border-2 border-dashed border-primary/20 flex flex-col items-center justify-center gap-6 text-primary active:bg-primary/10 transition-colors shadow-sm"
      >
        <div className="w-16 h-16 flex items-center justify-center border-2 border-primary/20 rounded-[20px]">
          <Add className="w-8 h-8" />
        </div>
        <span className="font-headline font-bold uppercase text-[9px] tracking-widest text-center opacity-80">Propose Category</span>
      </motion.button>
    </main>
  </div>
);
