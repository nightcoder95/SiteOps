import React from 'react';
import { ArrowLeft, User, Edit, FileEdit as EditNote, LogOut as Logout } from 'lucide-react';
import { View } from '../../types';

interface ProfileViewProps {
  navigate: (view: View) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ navigate }) => (
  <div className="min-h-full bg-background flex flex-col">
    <header className="h-20 flex items-center px-8 bg-white sticky top-0 z-50 border-b border-outline-variant/30">
      <button onClick={() => navigate('HOME')} className="mr-6 p-2 bg-surface rounded-xl border border-outline-variant/30 active-press transition-all">
        <ArrowLeft className="w-6 h-6 text-primary" />
      </button>
      <h2 className="font-headline font-black uppercase text-sm tracking-widest text-on-surface">Dossier</h2>
    </header>
    <main className="p-8 space-y-8 max-w-[800px] mx-auto w-full">
      <div className="flex flex-col items-center gap-6">
         <div className="relative">
            <img src="https://picsum.photos/seed/headshot/400/400" alt="Avatar" className="w-32 h-32 rounded-[40px] border-4 border-white shadow-xl" />
            <button 
               onClick={() => alert("Identity Protocol: Edit access restricted to Admin HQ.")}
               className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg active-press transition-transform hover:scale-110"
            >
               <EditNote className="w-5 h-5" />
            </button>
         </div>
         <div className="text-center">
            <h3 className="font-headline font-black text-2xl uppercase tracking-tighter">Karan Sharma</h3>
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1">Certified Lead Supervisor</p>
         </div>
      </div>

      <div className="bg-white p-8 rounded-[32px] border border-outline-variant/30 shadow-sm space-y-6">
         <div className="space-y-2">
            <p className="text-[8px] font-black uppercase text-on-surface-variant opacity-60 tracking-widest">Assigned Sector</p>
            <p className="font-bold text-sm uppercase">North Zone Operations</p>
         </div>
         <div className="h-px bg-surface-container" />
         <div className="space-y-2">
            <p className="text-[8px] font-black uppercase text-on-surface-variant opacity-60 tracking-widest">Badge ID</p>
            <p className="font-bold text-sm uppercase">DXB-2023-8842</p>
         </div>
         <div className="h-px bg-surface-container" />
         <div className="space-y-2">
            <p className="text-[8px] font-black uppercase text-on-surface-variant opacity-60 tracking-widest">Certification Status</p>
            <div className="flex items-center gap-2">
               <div className="w-2 h-2 bg-primary rounded-full" />
               <p className="font-bold text-sm uppercase">Active / Verified</p>
            </div>
         </div>
      </div>

      <button 
        onClick={() => navigate('LOGIN')}
        className="w-full h-16 bg-error/5 text-error font-headline font-black uppercase text-xs tracking-[0.2em] rounded-[24px] border-2 border-error/10 active-press transition-all flex items-center justify-center gap-3"
      >
        <Logout className="w-5 h-5" />
        End Session
      </button>
    </main>
  </div>
);
