/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'supervisor' | 'admin';

export type View =
  | 'LOGIN'
  | 'HOME'
  | 'WORKSITE_DASHBOARD'
  | 'LABOUR_ENTRY'
  | 'MATERIALS_ENTRY'
  | 'MACHINERY_ENTRY'
  | 'EXPENSE_ENTRY'
  | 'EXPENSE_MANAGER'
  | 'SITE_DETAIL'
  | 'SITE_SELECTION'
  | 'ENTRY_CATEGORIES'
  | 'ENTRY_SUBCATEGORIES'
  | 'ENTRY_FORM'
  | 'ENTRY_EDIT'
  | 'ADMIN_ANALYTICS'
  | 'ADMIN_APPROVALS'
  | 'ADMIN_LIVE_FEED'
  | 'RESOURCE_REQUEST'
  | 'SETTINGS'
  | 'HISTORY'
  | 'NOTIFICATIONS'
  | 'PROFILE'
  | 'INCIDENT_REPORT';

export interface HistoryFilter {
  siteId?: string;
  categoryId?: string;
  date?: string;
}

export interface ResourceRequest {
  id: string;
  type: 'Labour' | 'Materials' | 'Money' | 'Machinery';
  details: string;
  reason: string;
  siteId: string;
  status: 'Pending' | 'Approved' | 'Declined';
  timestamp: string;
  requestedBy: string;
}

export interface Site {
  id: string;
  name: string;
  location: string;
  status: 'In Progress' | 'Blocked' | 'Completed';
  spend: number;
  headcount: number;
  progress: number;
  phase: string;
  supervisor: string;
  lastUpdate: string;
  alerts: number;
  budget: number;
}

export type FieldType = 'Number' | 'Text' | 'Dropdown';

export interface FieldDefinition {
  id: string;
  label: string;
  type: FieldType;
  unit?: string;
  options?: string[];
  isPending?: boolean;
}

export interface Subcategory {
  id: string;
  name: string;
  fields: FieldDefinition[];
}

export interface Category {
  id: string;
  name: string;
  subcategories: Subcategory[];
  icon: string;
}

export interface Entry {
  id: string;
  siteId: string;
  categoryId: string;
  subcategoryId: string;
  timestamp: string;
  data: Record<string, string | number>;
  status: 'verified' | 'unverified';
}

export interface PendingFieldRequest {
  id: string;
  proposedName: string;
  categoryId: string;
  subcategoryId: string;
  type: FieldType;
  unit?: string;
  proposedBy: string;
  timestamp: string;
}

// ─── Labour ─────────────────────────────────────────────────────────────────

export const LABOUR_WORK_TYPES = [
  'Steelwork',
  'Shuttering',
  'Brickwork',
  'Concretework',
  'Plastering',
  'Electric Work',
  'Plumbing',
  'Pile Work',
  'Wood Work',
  'Paint Work',
] as const;
export type LabourWorkType = (typeof LABOUR_WORK_TYPES)[number];

export interface LabourEntry {
  id: string;
  siteId: string;
  date: string;
  workType: LabourWorkType;
  peopleCount: number;
  remarks: string;
}

// ─── Materials ───────────────────────────────────────────────────────────────

export const MATERIAL_TYPES = ['Cement', 'M-Sand', 'P-Sand', 'Metal'] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const MATERIAL_UNITS: Record<MaterialType, string> = {
  Cement: 'Bags',
  'M-Sand': 'Tons',
  'P-Sand': 'Tons',
  Metal: 'Tons',
};

export interface MaterialEntry {
  id: string;
  siteId: string;
  date: string;
  material: MaterialType;
  quantity: number;
  unit: string;
  remarks: string;
}

// ─── Machinery ───────────────────────────────────────────────────────────────

export const MACHINERY_TYPES = [
  'Excavator',
  'Tower Crane',
  'Concrete Mixer',
  'Bulldozer',
  'Compactor',
  'Generator',
  'Water Tanker',
  'Transit Mixer',
] as const;
export type MachineryType = (typeof MACHINERY_TYPES)[number];

export interface MachineryEntry {
  id: string;
  siteId: string;
  date: string;
  equipment: MachineryType;
  count: number;
  hoursActive: number;
  remarks: string;
}

// ─── Expenses ────────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = ['Labour', 'Materials', 'Equipment', 'Misc'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface ExpenseEntry {
  id: string;
  siteId: string;
  date: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  enteredBy: string;
}

// ─── Master Dictionary (legacy entry flow) ───────────────────────────────────

export const MASTER_DICTIONARY: Category[] = [
  {
    id: 'labour',
    name: 'Labour',
    icon: 'engineering',
    subcategories: [
      {
        id: 'general',
        name: 'General Labour',
        fields: [
          { id: 'worker_count', label: 'Worker Count', type: 'Number', unit: 'Heads' },
          { id: 'total_wages', label: 'Total Wages', type: 'Number', unit: 'INR' },
          { id: 'shift_hours', label: 'Shift Hours', type: 'Number', unit: 'Hrs' },
        ],
      },
    ],
  },
  {
    id: 'materials',
    name: 'Materials',
    icon: 'inventory_2',
    subcategories: [
      {
        id: 'cement',
        name: 'Cement',
        fields: [
          { id: 'qty_received', label: 'Quantity Received', type: 'Number', unit: 'Bags' },
          { id: 'vendor_name', label: 'Vendor Name', type: 'Text' },
        ],
      },
      {
        id: 'steel',
        name: 'Steel',
        fields: [
          { id: 'weight', label: 'Total Weight', type: 'Number', unit: 'Tons' },
          { id: 'grade', label: 'Steel Grade', type: 'Dropdown', options: ['Fe 415', 'Fe 500', 'Fe 550'] },
        ],
      },
    ],
  },
  {
    id: 'financials',
    name: 'Financials',
    icon: 'payments',
    subcategories: [
      {
        id: 'site_spend',
        name: 'Site Spend',
        fields: [
          { id: 'amount', label: 'Amount', type: 'Number', unit: 'INR' },
          { id: 'description', label: 'Description', type: 'Text' },
          {
            id: 'category',
            label: 'Spend Category',
            type: 'Dropdown',
            options: ['Petty Cash', 'Vendor Payment', 'Emergency Repair', 'Local Purchase'],
          },
        ],
      },
    ],
  },
  {
    id: 'machinery',
    name: 'Machinery',
    icon: 'precision_manufacturing',
    subcategories: [
      {
        id: 'excavator',
        name: 'Excavator',
        fields: [
          { id: 'hours_active', label: 'Hours Active', type: 'Number', unit: 'Hrs' },
          { id: 'fuel_consumed', label: 'Fuel Consumed', type: 'Number', unit: 'Liters' },
        ],
      },
    ],
  },
  {
    id: 'incidents',
    name: 'Incidents',
    icon: 'report_problem',
    subcategories: [
      {
        id: 'safety',
        name: 'Safety Violation',
        fields: [
          { id: 'description', label: 'Description', type: 'Text' },
          { id: 'severity', label: 'Severity', type: 'Dropdown', options: ['Low', 'Medium', 'High', 'Critical'] },
        ],
      },
      {
        id: 'blockage',
        name: 'Site Blockage',
        fields: [
          { id: 'description', label: 'Description', type: 'Text' },
          { id: 'duration', label: 'Estimated Delay', type: 'Text' },
        ],
      },
    ],
  },
];

// ─── Mock Data ───────────────────────────────────────────────────────────────

export const MOCK_SITES: Site[] = [
  {
    id: 'oak-tower',
    name: 'Oak Tower',
    location: 'Downtown',
    status: 'In Progress',
    spend: 842500,
    headcount: 342,
    progress: 68,
    phase: 'Phase 4: Structural',
    supervisor: 'John Doe',
    lastUpdate: '10m ago',
    alerts: 0,
    budget: 5000000,
  },
  {
    id: 'bridge-proj',
    name: 'Bridge Project',
    location: 'River Crossing',
    status: 'Blocked',
    spend: 518200,
    headcount: 86,
    progress: 12,
    phase: 'Phase 1: Foundation',
    supervisor: 'Alice Smith',
    lastUpdate: '2h ago',
    alerts: 3,
    budget: 3200000,
  },
  {
    id: 'metro-ext',
    name: 'Metro Extension',
    location: 'East Sector',
    status: 'In Progress',
    spend: 2182100,
    headcount: 820,
    progress: 45,
    phase: 'Phase 2: Tunnelling',
    supervisor: 'Robert Brown',
    lastUpdate: '45m ago',
    alerts: 1,
    budget: 12000000,
  },
  {
    id: 'riverside-apts',
    name: 'Riverside Apartments',
    location: 'South Bank',
    status: 'In Progress',
    spend: 410000,
    headcount: 148,
    progress: 72,
    phase: 'Phase 3: Interiors',
    supervisor: 'Priya Nair',
    lastUpdate: '1h ago',
    alerts: 0,
    budget: 2800000,
  },
];

export const MOCK_LABOUR_ENTRIES: LabourEntry[] = [
  { id: 'lab-1', siteId: 'oak-tower', date: '2026-04-24', workType: 'Steelwork', peopleCount: 14, remarks: 'Main column reinforcement, floors 12-14' },
  { id: 'lab-2', siteId: 'oak-tower', date: '2026-04-24', workType: 'Shuttering', peopleCount: 8, remarks: 'Floor 12 slab shuttering complete' },
  { id: 'lab-3', siteId: 'oak-tower', date: '2026-04-24', workType: 'Concretework', peopleCount: 10, remarks: 'Pouring scheduled 3 PM' },
  { id: 'lab-4', siteId: 'oak-tower', date: '2026-04-23', workType: 'Plastering', peopleCount: 6, remarks: 'Floors 8-10 internal walls' },
  { id: 'lab-5', siteId: 'oak-tower', date: '2026-04-23', workType: 'Electric Work', peopleCount: 4, remarks: 'Floor 9 conduit laying' },
  { id: 'lab-6', siteId: 'bridge-proj', date: '2026-04-24', workType: 'Pile Work', peopleCount: 20, remarks: 'Pile driving at piers 3 & 4' },
  { id: 'lab-7', siteId: 'bridge-proj', date: '2026-04-24', workType: 'Steelwork', peopleCount: 12, remarks: 'Girder assembly, span 2' },
  { id: 'lab-8', siteId: 'bridge-proj', date: '2026-04-23', workType: 'Concretework', peopleCount: 8, remarks: 'Pile cap pour, pier 2' },
  { id: 'lab-9', siteId: 'metro-ext', date: '2026-04-24', workType: 'Concretework', peopleCount: 35, remarks: 'Tunnel lining pour - section 7B' },
  { id: 'lab-10', siteId: 'metro-ext', date: '2026-04-24', workType: 'Electric Work', peopleCount: 8, remarks: 'Cable laying, station 3' },
  { id: 'lab-11', siteId: 'metro-ext', date: '2026-04-24', workType: 'Plumbing', peopleCount: 6, remarks: 'Drainage installation, platform level' },
  { id: 'lab-12', siteId: 'metro-ext', date: '2026-04-23', workType: 'Shuttering', peopleCount: 22, remarks: 'Station box walls, zone C' },
  { id: 'lab-13', siteId: 'riverside-apts', date: '2026-04-24', workType: 'Plastering', peopleCount: 15, remarks: 'Block B exterior plastering' },
  { id: 'lab-14', siteId: 'riverside-apts', date: '2026-04-24', workType: 'Paint Work', peopleCount: 10, remarks: 'Block A interiors, primer coat' },
  { id: 'lab-15', siteId: 'riverside-apts', date: '2026-04-24', workType: 'Plumbing', peopleCount: 5, remarks: 'Bathroom fittings floors 3-5' },
  { id: 'lab-16', siteId: 'riverside-apts', date: '2026-04-23', workType: 'Wood Work', peopleCount: 8, remarks: 'Doors and frames, Block B' },
];

export const MOCK_MATERIAL_ENTRIES: MaterialEntry[] = [
  { id: 'mat-1', siteId: 'oak-tower', date: '2026-04-24', material: 'Cement', quantity: 250, unit: 'Bags', remarks: 'Ultratech OPC 53 Grade' },
  { id: 'mat-2', siteId: 'oak-tower', date: '2026-04-24', material: 'M-Sand', quantity: 8, unit: 'Tons', remarks: 'Zone II grading, washed' },
  { id: 'mat-3', siteId: 'oak-tower', date: '2026-04-23', material: 'Metal', quantity: 5.2, unit: 'Tons', remarks: 'Fe 500 TMT bars, 16mm dia' },
  { id: 'mat-4', siteId: 'oak-tower', date: '2026-04-22', material: 'P-Sand', quantity: 4, unit: 'Tons', remarks: 'Plastering work floor 8' },
  { id: 'mat-5', siteId: 'bridge-proj', date: '2026-04-24', material: 'Metal', quantity: 18, unit: 'Tons', remarks: 'Structural steel IS 2062' },
  { id: 'mat-6', siteId: 'bridge-proj', date: '2026-04-24', material: 'Cement', quantity: 400, unit: 'Bags', remarks: 'For pile caps, M25 mix' },
  { id: 'mat-7', siteId: 'bridge-proj', date: '2026-04-23', material: 'M-Sand', quantity: 12, unit: 'Tons', remarks: 'Concrete mix aggregate' },
  { id: 'mat-8', siteId: 'metro-ext', date: '2026-04-24', material: 'Cement', quantity: 600, unit: 'Bags', remarks: 'Tunnel lining concrete M40' },
  { id: 'mat-9', siteId: 'metro-ext', date: '2026-04-24', material: 'P-Sand', quantity: 12, unit: 'Tons', remarks: 'Station platform finishing' },
  { id: 'mat-10', siteId: 'metro-ext', date: '2026-04-23', material: 'Metal', quantity: 22, unit: 'Tons', remarks: 'Tunnel segment steel' },
  { id: 'mat-11', siteId: 'riverside-apts', date: '2026-04-24', material: 'P-Sand', quantity: 6, unit: 'Tons', remarks: 'Plastering, Block B' },
  { id: 'mat-12', siteId: 'riverside-apts', date: '2026-04-24', material: 'Cement', quantity: 180, unit: 'Bags', remarks: 'ACC Gold, general use' },
  { id: 'mat-13', siteId: 'riverside-apts', date: '2026-04-23', material: 'M-Sand', quantity: 3, unit: 'Tons', remarks: 'Block B masonry joints' },
];

export const MOCK_MACHINERY_ENTRIES: MachineryEntry[] = [
  { id: 'mach-1', siteId: 'oak-tower', date: '2026-04-24', equipment: 'Tower Crane', count: 2, hoursActive: 14, remarks: 'Material hoisting floors 12-15' },
  { id: 'mach-2', siteId: 'oak-tower', date: '2026-04-24', equipment: 'Concrete Mixer', count: 3, hoursActive: 10, remarks: 'M30 mix for columns' },
  { id: 'mach-3', siteId: 'oak-tower', date: '2026-04-23', equipment: 'Generator', count: 1, hoursActive: 24, remarks: 'Continuous power backup' },
  { id: 'mach-4', siteId: 'bridge-proj', date: '2026-04-24', equipment: 'Excavator', count: 2, hoursActive: 12, remarks: 'Pile cap excavation pier 3' },
  { id: 'mach-5', siteId: 'bridge-proj', date: '2026-04-24', equipment: 'Generator', count: 1, hoursActive: 16, remarks: 'Power for site ops' },
  { id: 'mach-6', siteId: 'bridge-proj', date: '2026-04-23', equipment: 'Water Tanker', count: 2, hoursActive: 8, remarks: 'Curing and dust suppression' },
  { id: 'mach-7', siteId: 'metro-ext', date: '2026-04-24', equipment: 'Transit Mixer', count: 6, hoursActive: 18, remarks: 'Continuous pour, night shift' },
  { id: 'mach-8', siteId: 'metro-ext', date: '2026-04-24', equipment: 'Compactor', count: 2, hoursActive: 8, remarks: 'Backfill compaction, station 2' },
  { id: 'mach-9', siteId: 'metro-ext', date: '2026-04-23', equipment: 'Excavator', count: 3, hoursActive: 14, remarks: 'Station box excavation' },
  { id: 'mach-10', siteId: 'riverside-apts', date: '2026-04-24', equipment: 'Concrete Mixer', count: 2, hoursActive: 8, remarks: 'Plaster mortar preparation' },
  { id: 'mach-11', siteId: 'riverside-apts', date: '2026-04-23', equipment: 'Water Tanker', count: 1, hoursActive: 6, remarks: 'Curing water supply' },
];

export const MOCK_EXPENSE_ENTRIES: ExpenseEntry[] = [
  { id: 'exp-1', siteId: 'oak-tower', date: '2026-04-24', description: 'Ultratech Cement Supply — 250 Bags', amount: 87500, category: 'Materials', enteredBy: 'John Doe' },
  { id: 'exp-2', siteId: 'oak-tower', date: '2026-04-24', description: 'Daily Labour Wages — Steelwork Team', amount: 21000, category: 'Labour', enteredBy: 'John Doe' },
  { id: 'exp-3', siteId: 'oak-tower', date: '2026-04-23', description: 'Tower Crane Rental — April', amount: 120000, category: 'Equipment', enteredBy: 'John Doe' },
  { id: 'exp-4', siteId: 'oak-tower', date: '2026-04-22', description: 'Petty Cash — Site Maintenance', amount: 4500, category: 'Misc', enteredBy: 'John Doe' },
  { id: 'exp-5', siteId: 'oak-tower', date: '2026-04-21', description: 'TMT Bars Fe500 — 5.2 Tons', amount: 182000, category: 'Materials', enteredBy: 'John Doe' },
  { id: 'exp-6', siteId: 'bridge-proj', date: '2026-04-24', description: 'Structural Steel Procurement — 18T', amount: 342000, category: 'Materials', enteredBy: 'Alice Smith' },
  { id: 'exp-7', siteId: 'bridge-proj', date: '2026-04-24', description: 'Labour — Pile Driving Team (20 workers)', amount: 38000, category: 'Labour', enteredBy: 'Alice Smith' },
  { id: 'exp-8', siteId: 'bridge-proj', date: '2026-04-23', description: 'Excavator Hire — 2 units, daily', amount: 28000, category: 'Equipment', enteredBy: 'Alice Smith' },
  { id: 'exp-9', siteId: 'bridge-proj', date: '2026-04-22', description: 'Cement Supply — 400 Bags', amount: 140000, category: 'Materials', enteredBy: 'Alice Smith' },
  { id: 'exp-10', siteId: 'metro-ext', date: '2026-04-24', description: 'Cement for Tunnel Lining — 600 Bags', amount: 210000, category: 'Materials', enteredBy: 'Robert Brown' },
  { id: 'exp-11', siteId: 'metro-ext', date: '2026-04-24', description: 'Transit Mixer Fleet — Daily Hire (6 units)', amount: 54000, category: 'Equipment', enteredBy: 'Robert Brown' },
  { id: 'exp-12', siteId: 'metro-ext', date: '2026-04-23', description: 'Night Shift Labour Premium', amount: 32000, category: 'Labour', enteredBy: 'Robert Brown' },
  { id: 'exp-13', siteId: 'metro-ext', date: '2026-04-22', description: 'Tunnel Segment Steel — 22T', amount: 770000, category: 'Materials', enteredBy: 'Robert Brown' },
  { id: 'exp-14', siteId: 'metro-ext', date: '2026-04-21', description: 'Compactor Hire — 2 units', amount: 18000, category: 'Equipment', enteredBy: 'Robert Brown' },
  { id: 'exp-15', siteId: 'riverside-apts', date: '2026-04-24', description: 'P-Sand Supply — 6 Tons', amount: 18000, category: 'Materials', enteredBy: 'Priya Nair' },
  { id: 'exp-16', siteId: 'riverside-apts', date: '2026-04-24', description: 'Plastering & Paint Team Wages', amount: 25000, category: 'Labour', enteredBy: 'Priya Nair' },
  { id: 'exp-17', siteId: 'riverside-apts', date: '2026-04-23', description: 'Plumbing Fittings — Bathrooms Block A', amount: 67000, category: 'Materials', enteredBy: 'Priya Nair' },
  { id: 'exp-18', siteId: 'riverside-apts', date: '2026-04-22', description: 'Woodwork Team — Doors & Frames', amount: 32000, category: 'Labour', enteredBy: 'Priya Nair' },
];
