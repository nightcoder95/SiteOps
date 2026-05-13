import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Menu, 
  Bell as Notifications, 
  FileEdit as EditNote, 
  Factory as PrecisionManufacturing,
  TrendingUp,
  History,
  Home,
  Settings,
  Plus as Add,
  BarChart4 as Analytics,
  LogOut as Logout,
  X as Close,
  ChevronRight,
  User
} from 'lucide-react';
import { UserRole, Site, View, MOCK_SITES } from '@/lib/types/legacy';

interface HomeViewProps {
  role: UserRole;
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  navigate: (view: View) => void;
  currentView: View;
  onSelectSite: (site: Site) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ 
  role, 
  isMenuOpen, 
  setIsMenuOpen, 
  navigate,
  currentView,
  onSelectSite
}) => (
  <div className="flex flex-col h-full blueprint-bg">
    <header className="sticky top-0 z-50 glass-header h-16 flex items-center justify-between px-6 border-b border-outline-variant/10">
      <div className="flex items-center gap-4">
        <button onClick={() => setIsMenuOpen(true)} className="active-press p-1"><Menu className="w-6 h-6 text-on-surface-variant" /></button>
        <h1 className="font-headline tracking-tighter text-sm font-black uppercase leading-none">
          SITE<br/><span className="text-[8px] tracking-[0.2em] font-bold text-primary opacity-80">CORE</span>
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('NOTIFICATIONS')} className="relative active-press p-1">
          <Notifications className="w-6 h-6 text-on-surface-variant" />
          <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full border border-surface" />
        </button>
        <button onClick={() => navigate('PROFILE')} className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant/30 active-press">
          <img src="https://picsum.photos/seed/headshot/200/200" alt="Profile" className="w-full h-full object-cover" />
        </button>
      </div>
    </header>

    <main className="flex-grow p-6 space-y-6 overflow-y-auto no-scrollbar pb-32">
      {role === 'supervisor' ? (
        <>
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-outline-variant/5 relative overflow-hidden">
            <div className="relative z-10">
              <span className="font-headline text-on-surface-variant text-[10px] tracking-widest font-bold uppercase block mb-1">Operational Update</span>
              <h2 className="text-3xl font-headline font-black text-on-surface mb-6 leading-none tracking-tighter uppercase">Home Base: PHASE 2A</h2>
              <button 
                onClick={() => navigate('SITE_SELECTION')}
                className="machined-gradient text-on-primary font-headline font-bold uppercase tracking-widest py-3 px-6 rounded-xl flex items-center justify-center gap-3 w-full shadow-lg shadow-primary/20 active-press"
              >
                <EditNote className="w-5 h-5" />
                Log Daily Entry
              </button>
            </div>
            <div className="absolute top-4 right-4 text-on-surface-variant/5">
              <PrecisionManufacturing size={64} />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="font-headline text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Managed Sites</h3>
            <div className="space-y-3">
               {MOCK_SITES.map(site => (
                  <button 
                    key={site.id}
                    onClick={() => onSelectSite(site)}
                    className="w-full text-left bg-white p-5 rounded-2xl border border-outline-variant/10 shadow-sm flex items-center justify-between group active-press"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-surface rounded-xl flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-primary opacity-60 shrink-0" />
                      </div>
                      <div>
                         <h4 className="font-bold text-sm tracking-tight text-on-surface uppercase">{site.name}</h4>
                         <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60">{site.location} / {site.phase}</p>
                      </div>
                    </div>
                    <div className="p-2 border border-outline-variant/30 rounded-lg group-hover:bg-primary/5 transition-colors">
                      <ChevronRight className="w-4 h-4 text-primary" />
                    </div>
                  </button>
               ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <header className="mb-10">
            <h2 className="text-4xl font-headline font-black tracking-tighter text-on-surface uppercase leading-none">Home Center</h2>
            <div className="h-1 w-12 bg-primary mt-4" />
          </header>
          
          <div className="grid grid-cols-1 gap-6">
            {MOCK_SITES.map(site => (
              <button 
                key={site.id} 
                onClick={() => onSelectSite(site)}
                className="w-full text-left bg-white rounded-[32px] overflow-hidden border border-outline-variant/10 shadow-sm active-press group"
              >
                <div className="p-8 flex justify-between items-start">
                  <div>
                    <h4 className="font-headline font-black text-xl uppercase tracking-tight group-hover:text-primary transition-colors">{site.name}</h4>
                    <div className="flex items-center gap-2 mt-2">
                       <User className="w-3 h-3 text-on-surface-variant" />
                       <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">{site.supervisor}</p>
                    </div>
                  </div>
                  <div className="w-14 h-14 machined-gradient rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/20">
                    <Analytics className="w-7 h-7" />
                  </div>
                </div>
                <div className="px-8 py-6 bg-surface flex justify-between border-t border-outline-variant/5">
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest opacity-60">Site Health</p>
                    <p className="font-bold text-sm text-primary uppercase">92% Signal</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest opacity-60">Phase Integrity</p>
                    <p className="font-bold text-sm uppercase">{site.phase.split(':')[0]}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </main>

    {/* Sidebar Menu */}
    <AnimatePresence>
      {isMenuOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMenuOpen(false)}
            className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm"
          />
          <motion.div 
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            className="fixed top-0 left-0 bottom-0 w-[85%] max-w-sm bg-white z-[70] shadow-2xl flex flex-col"
          >
            <div className="p-8 border-b border-outline-variant/10">
              <div className="flex justify-between items-center mb-10">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
                      <PrecisionManufacturing className="w-6 h-6" />
                    </div>
                    <h2 className="font-headline font-black text-xl tracking-tighter uppercase leading-none">SITE<br/>CORE</h2>
                 </div>
                 <button onClick={() => setIsMenuOpen(false)} className="p-2 active-press"><Close className="w-6 h-6" /></button>
              </div>
              <div className="flex items-center gap-4 p-5 bg-surface rounded-2xl border border-outline-variant/10">
                 <img src="https://picsum.photos/seed/headshot/200/200" alt="Avatar" className="w-12 h-12 rounded-full border-2 border-primary" />
                 <div>
                    <p className="font-black text-xs uppercase tracking-tight">Karan Sharma</p>
                    <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60">{role === 'admin' ? 'Strategic Admin' : 'Site Supervisor'}</p>
                 </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-2">
              <button onClick={() => { navigate('HOME'); setIsMenuOpen(false); }} className={`w-full flex items-center gap-4 p-4 rounded-xl hover:bg-primary/5 active-press transition-colors ${currentView === 'HOME' ? 'bg-primary/5 text-primary' : 'text-on-surface-variant'}`}>
                <Home className="w-5 h-5" />
                <span className="font-bold text-xs uppercase tracking-widest text-left">Home</span>
              </button>
              <button onClick={() => { navigate('HISTORY'); setIsMenuOpen(false); }} className={`w-full flex items-center gap-4 p-4 rounded-xl hover:bg-primary/5 active-press transition-colors ${currentView === 'HISTORY' ? 'bg-primary/5 text-primary' : 'text-on-surface-variant'}`}>
                <History className="w-5 h-5" />
                <span className="font-bold text-xs uppercase tracking-widest text-left">History</span>
              </button>
              {role === 'admin' && (
                <button onClick={() => { navigate('ADMIN_LIVE_FEED'); setIsMenuOpen(false); }} className={`w-full flex items-center gap-4 p-4 rounded-xl hover:bg-primary/5 active-press transition-colors ${currentView === 'ADMIN_LIVE_FEED' ? 'bg-primary/5 text-primary' : 'text-on-surface-variant'}`}>
                  <Notifications className="w-5 h-5" />
                  <span className="font-bold text-xs uppercase tracking-widest text-left">Live Feed</span>
                </button>
              )}
              <button onClick={() => { navigate('PROFILE'); setIsMenuOpen(false); }} className={`w-full flex items-center gap-4 p-4 rounded-xl hover:bg-primary/5 active-press transition-colors ${currentView === 'PROFILE' ? 'bg-primary/5 text-primary' : 'text-on-surface-variant'}`}>
                <User className="w-5 h-5" />
                <span className="font-bold text-xs uppercase tracking-widest text-left">Profile</span>
              </button>
              <button onClick={() => { navigate('SETTINGS'); setIsMenuOpen(false); }} className={`w-full flex items-center gap-4 p-4 rounded-xl hover:bg-primary/5 active-press transition-colors ${currentView === 'SETTINGS' ? 'bg-primary/5 text-primary' : 'text-on-surface-variant'}`}>
                <Settings className="w-5 h-5" />
                <span className="font-bold text-xs uppercase tracking-widest text-left">Settings</span>
              </button>
            </div>
            <div className="p-8 border-t border-outline-variant/10 bg-surface/30">
              <button onClick={() => { navigate('LOGIN'); setIsMenuOpen(false); }} className="w-full p-4 flex items-center gap-4 text-error font-black uppercase text-[10px] tracking-widest active-press">
                <Logout className="w-5 h-5" />
                Disconnect Session
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  </div>
);
