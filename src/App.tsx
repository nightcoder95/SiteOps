/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import {
  UserRole,
  Site,
  Category,
  Subcategory,
  PendingFieldRequest,
  MASTER_DICTIONARY,
  MOCK_SITES,
  Entry,
  View,
  ResourceRequest,
  HistoryFilter,
  LabourEntry,
  MaterialEntry,
  MachineryEntry,
  ExpenseEntry,
  MOCK_LABOUR_ENTRIES,
  MOCK_MATERIAL_ENTRIES,
  MOCK_MACHINERY_ENTRIES,
  MOCK_EXPENSE_ENTRIES,
} from './types.ts';

import { IconMap } from './constants/icons.tsx';
import { GlobalFooter } from './components/GlobalFooter.tsx';
import { LoginView } from './components/views/LoginView.tsx';
import { HomeView } from './components/views/HomeView.tsx';
import { HistoryView } from './components/views/HistoryView.tsx';
import { NotificationsView } from './components/views/NotificationsView.tsx';
import { ProfileView } from './components/views/ProfileView.tsx';
import { CategorySelectionView } from './components/views/CategorySelectionView.tsx';
import { SubcategorySelectionView } from './components/views/SubcategorySelectionView.tsx';
import { EntryFormView } from './components/views/EntryFormView.tsx';
import { SettingsView } from './components/views/SettingsView.tsx';
import { AdminAnalyticsView } from './components/views/AdminAnalyticsView.tsx';
import { ApprovalCenterView } from './components/views/ApprovalCenterView.tsx';
import { SiteSelectionView } from './components/views/SiteSelectionView.tsx';
import { SiteDetailView } from './components/views/SiteDetailView.tsx';
import { LiveFeedView } from './components/views/LiveFeedView.tsx';
import { ResourceRequestView } from './components/views/ResourceRequestView.tsx';
import { IncidentReportView } from './components/views/IncidentReportView.tsx';
import { WorksiteDashboardView } from './components/views/WorksiteDashboardView.tsx';
import { LabourEntryView } from './components/views/LabourEntryView.tsx';
import { MaterialsEntryView } from './components/views/MaterialsEntryView.tsx';
import { MachineryEntryView } from './components/views/MachineryEntryView.tsx';
import { ExpenseEntryView } from './components/views/ExpenseEntryView.tsx';
import { ExpenseManagerView } from './components/views/ExpenseManagerView.tsx';

export default function App() {
  // ── Navigation ─────────────────────────────────────────────────────────────
  const [navState, setNavState] = useState<{ current: View; stack: View[] }>({
    current: 'LOGIN',
    stack: [],
  });
  const currentView = navState.current;

  const navigate = useCallback((view: View, filter: HistoryFilter = {}) => {
    setHistoryFilter(filter);
    setNavState(prev => ({ current: view, stack: [...prev.stack, prev.current] }));
    setIsMenuOpen(false);
  }, []);

  const goBack = useCallback(() => {
    setNavState(prev => {
      if (prev.stack.length === 0) return prev;
      const newStack = [...prev.stack];
      const prevView = newStack.pop()!;
      return { current: prevView, stack: newStack };
    });
  }, []);

  // ── UI State ────────────────────────────────────────────────────────────────
  const [role, setRole] = useState<UserRole>('supervisor');
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<Subcategory | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showInsiteHelp, setShowInsiteHelp] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>({});
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  // ── Data State ──────────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<Entry[]>([
    { id: 'e1', siteId: 'oak-tower', categoryId: 'labour', subcategoryId: 'general', timestamp: new Date(Date.now() - 3600000).toISOString(), data: { worker_count: 45, total_wages: 25000, shift_hours: 8 }, status: 'verified' },
    { id: 'e2', siteId: 'oak-tower', categoryId: 'materials', subcategoryId: 'cement', timestamp: new Date(Date.now() - 86400000).toISOString(), data: { qty_received: 150, vendor_name: 'Ultratech' }, status: 'verified' },
    { id: 'FIN-1', siteId: 'oak-tower', categoryId: 'financials', subcategoryId: 'site_spend', timestamp: new Date(Date.now() - 172800000).toISOString(), data: { amount: 15000, description: 'Emergency Generator Rent', category: 'Emergency Repair' }, status: 'verified' },
  ]);

  const [labourEntries, setLabourEntries] = useState<LabourEntry[]>(MOCK_LABOUR_ENTRIES);
  const [materialEntries, setMaterialEntries] = useState<MaterialEntry[]>(MOCK_MATERIAL_ENTRIES);
  const [machineryEntries, setMachineryEntries] = useState<MachineryEntry[]>(MOCK_MACHINERY_ENTRIES);
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>(MOCK_EXPENSE_ENTRIES);
  const [resourceRequests, setResourceRequests] = useState<ResourceRequest[]>([]);

  // ── Entry Handlers ──────────────────────────────────────────────────────────
  const handleAddLabourEntry = useCallback((entry: Omit<LabourEntry, 'id'>) => {
    setLabourEntries(prev => [{ ...entry, id: `lab-${Date.now()}` }, ...prev]);
  }, []);

  const handleAddMaterialEntry = useCallback((entry: Omit<MaterialEntry, 'id'>) => {
    setMaterialEntries(prev => [{ ...entry, id: `mat-${Date.now()}` }, ...prev]);
  }, []);

  const handleAddMachineryEntry = useCallback((entry: Omit<MachineryEntry, 'id'>) => {
    setMachineryEntries(prev => [{ ...entry, id: `mach-${Date.now()}` }, ...prev]);
  }, []);

  const handleAddExpenseEntry = useCallback((entry: Omit<ExpenseEntry, 'id'>) => {
    setExpenseEntries(prev => [{ ...entry, id: `exp-${Date.now()}` }, ...prev]);
  }, []);

  const handleTransferLabour = useCallback((entryId: string, targetSiteId: string) => {
    setLabourEntries(prev => prev.map(e => e.id === entryId ? { ...e, siteId: targetSiteId } : e));
  }, []);

  const handleTransferMaterial = useCallback((entryId: string, targetSiteId: string) => {
    setMaterialEntries(prev => prev.map(e => e.id === entryId ? { ...e, siteId: targetSiteId } : e));
  }, []);

  const handleTransferMachinery = useCallback((entryId: string, targetSiteId: string) => {
    setMachineryEntries(prev => prev.map(e => e.id === entryId ? { ...e, siteId: targetSiteId } : e));
  }, []);

  // ── Legacy Handlers ─────────────────────────────────────────────────────────
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setNavState({ current: 'HOME', stack: [] });
  };

  const handleToggleRole = () => {
    setRole(prev => (prev === 'admin' ? 'supervisor' : 'admin'));
  };

  const handleEntrySubmit = (formData: any) => {
    if (editingEntry) {
      setEntries(entries.map(e => e.id === editingEntry.id ? { ...e, data: formData, timestamp: new Date().toISOString() } : e));
      setEditingEntry(null);
      navigate('HISTORY');
    } else {
      const newEntry: Entry = {
        id: Math.random().toString(36).substr(2, 9),
        siteId: selectedSite?.id || 'oak-tower',
        categoryId: selectedCategory?.id || '',
        subcategoryId: selectedSubcategory?.id || '',
        timestamp: new Date().toISOString(),
        data: formData,
        status: 'unverified',
      };
      setEntries([newEntry, ...entries]);
      navigate('HOME');
    }
  };

  const handleDeleteEntry = (id: string) => {
    if (confirm('Delete this entry?')) {
      setEntries(entries.filter(e => e.id !== id));
    }
  };

  const handleEditEntry = (entry: Entry) => {
    setEditingEntry(entry);
    const site = MOCK_SITES.find(s => s.id === entry.siteId) || null;
    const category = MASTER_DICTIONARY.find(c => c.id === entry.categoryId) || null;
    const subcategory = category?.subcategories.find(s => s.id === entry.subcategoryId) || null;
    setSelectedSite(site);
    setSelectedCategory(category);
    setSelectedSubcategory(subcategory);
    navigate('ENTRY_FORM');
  };

  const handleResourceRequest = (request: Partial<ResourceRequest>) => {
    const newReq: ResourceRequest = { id: `REQ-${Math.random().toString(36).substr(2, 4).toUpperCase()}`, ...request as any };
    setResourceRequests([newReq, ...resourceRequests]);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-svh bg-background relative overflow-hidden flex flex-col pt-[var(--sat)] pl-[var(--sal)] pr-[var(--sar)]">
      <div className="flex-grow overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-0 overflow-hidden"
          >
            {currentView === 'LOGIN' && <LoginView onLogin={handleLogin} />}

            {currentView === 'HOME' && (
              <HomeView
                role={role}
                isMenuOpen={isMenuOpen}
                setIsMenuOpen={setIsMenuOpen}
                navigate={navigate}
                currentView={currentView}
                onSelectSite={site => {
                  setSelectedSite(site);
                  navigate('WORKSITE_DASHBOARD');
                }}
              />
            )}

            {currentView === 'WORKSITE_DASHBOARD' && (
              <WorksiteDashboardView
                site={selectedSite}
                labourEntries={labourEntries}
                materialEntries={materialEntries}
                machineryEntries={machineryEntries}
                expenseEntries={expenseEntries}
                goBack={goBack}
                navigate={navigate}
              />
            )}

            {currentView === 'LABOUR_ENTRY' && (
              <LabourEntryView
                site={selectedSite}
                entries={labourEntries}
                sites={MOCK_SITES}
                onAddEntry={handleAddLabourEntry}
                onTransfer={handleTransferLabour}
                goBack={goBack}
              />
            )}

            {currentView === 'MATERIALS_ENTRY' && (
              <MaterialsEntryView
                site={selectedSite}
                entries={materialEntries}
                sites={MOCK_SITES}
                onAddEntry={handleAddMaterialEntry}
                onTransfer={handleTransferMaterial}
                goBack={goBack}
              />
            )}

            {currentView === 'MACHINERY_ENTRY' && (
              <MachineryEntryView
                site={selectedSite}
                entries={machineryEntries}
                sites={MOCK_SITES}
                onAddEntry={handleAddMachineryEntry}
                onTransfer={handleTransferMachinery}
                goBack={goBack}
              />
            )}

            {currentView === 'EXPENSE_ENTRY' && (
              <ExpenseEntryView
                site={selectedSite}
                entries={expenseEntries}
                onAddEntry={handleAddExpenseEntry}
                goBack={goBack}
              />
            )}

            {currentView === 'EXPENSE_MANAGER' && (
              <ExpenseManagerView
                expenses={expenseEntries}
                sites={MOCK_SITES}
                goBack={goBack}
                navigate={navigate}
              />
            )}

            {currentView === 'SITE_DETAIL' && <SiteDetailView site={selectedSite} navigate={navigate} />}
            {currentView === 'SITE_SELECTION' && <SiteSelectionView onSelectSite={setSelectedSite} navigate={navigate} />}

            {currentView === 'HISTORY' && (
              <HistoryView
                entries={entries}
                navigate={navigate}
                onDeleteEntry={handleDeleteEntry}
                onEditEntry={handleEditEntry}
                initialFilter={historyFilter}
              />
            )}
            {currentView === 'NOTIFICATIONS' && <NotificationsView navigate={navigate} />}
            {currentView === 'PROFILE' && <ProfileView navigate={navigate} />}

            {currentView === 'ENTRY_CATEGORIES' && (
              <CategorySelectionView
                categories={MASTER_DICTIONARY}
                onSelectCategory={setSelectedCategory}
                navigate={navigate}
                iconMap={IconMap}
              />
            )}
            {currentView === 'ENTRY_SUBCATEGORIES' && (
              <SubcategorySelectionView
                category={selectedCategory}
                onSelectSubcategory={setSelectedSubcategory}
                navigate={navigate}
              />
            )}
            {currentView === 'ENTRY_FORM' && (
              <EntryFormView
                category={selectedCategory}
                subcategory={selectedSubcategory}
                navigate={navigate}
                onSubmitSuccess={handleEntrySubmit}
                editingEntry={editingEntry}
              />
            )}

            {currentView === 'SETTINGS' && (
              <SettingsView role={role} onToggleRole={handleToggleRole} navigate={navigate} />
            )}
            {currentView === 'ADMIN_ANALYTICS' && (
              <AdminAnalyticsView
                showInsiteHelp={showInsiteHelp}
                setShowInsiteHelp={setShowInsiteHelp}
                navigate={navigate}
              />
            )}
            {currentView === 'ADMIN_APPROVALS' && <ApprovalCenterView navigate={navigate} />}
            {currentView === 'ADMIN_LIVE_FEED' && <LiveFeedView entries={entries} navigate={navigate} />}
            {currentView === 'RESOURCE_REQUEST' && <ResourceRequestView navigate={navigate} onSubmit={handleResourceRequest} />}
            {currentView === 'INCIDENT_REPORT' && (
              <IncidentReportView
                navigate={navigate}
                onSubmit={incident => {
                  const newEntry: Entry = {
                    id: Math.random().toString(36).substr(2, 9),
                    siteId: selectedSite?.id || 'oak-tower',
                    categoryId: 'incidents',
                    subcategoryId: incident.category || 'other',
                    timestamp: incident.timestamp,
                    data: { description: incident.description },
                    status: 'verified',
                  };
                  setEntries([newEntry, ...entries]);
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <GlobalFooter currentView={currentView} role={role} navigate={navigate} />
    </div>
  );
}
