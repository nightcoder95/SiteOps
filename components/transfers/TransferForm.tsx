'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, MapPin, Truck, Package, Users, ChevronDown, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { requestJson } from '@/lib/http/client';

export type TransferSiteOption = {
  siteId: string;
  name: string;
  location?: string;
};

type Props = {
  sites: TransferSiteOption[];
  defaultFromSiteId?: string;
  onSuccess?: () => void;
};

type ResourceType = 'Labour' | 'Materials';

const LABOUR_WORK_TYPES = [
  'Steel work',
  'Shuttering',
  'Brick work',
  'Concrete work',
  'Plastering',
  'Electric work',
  'Plumbing',
  'Tile work',
  'Wood work',
  'Paint work',
] as const;

const MATERIAL_TYPES = ['Cement', 'M sand', 'P sand', 'Metal'] as const;

export function TransferForm({ sites, defaultFromSiteId, onSuccess }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const [fromSiteId, setFromSiteId] = useState(defaultFromSiteId || '');
  const [toSiteId, setToSiteId] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType>('Materials');
  const [workTypeEnum, setWorkTypeEnum] = useState<string>(LABOUR_WORK_TYPES[0]);
  const [materialTypeEnum, setMaterialTypeEnum] = useState<string>(MATERIAL_TYPES[0]);
  const [unitCustomId, setUnitCustomId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [remarks, setRemarks] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!fromSiteId || !toSiteId) {
      toast.error('Select both sites');
      return;
    }
    if (fromSiteId === toSiteId) {
      toast.error('Source and destination sites must differ');
      return;
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Quantity must be positive');
      return;
    }

    if (resourceType === 'Materials' && !unitCustomId) {
      toast.error('Unit ID is required for material transfers');
      return;
    }

    const payload: Record<string, unknown> = {
      fromSiteId,
      toSiteId,
      resourceType,
      quantity: qty,
      remarks: remarks || undefined,
    };

    if (resourceType === 'Labour') {
      payload.workTypeMode = 'default_enum';
      payload.workTypeEnum = workTypeEnum;
    } else {
      payload.materialTypeMode = 'default_enum';
      payload.materialTypeEnum = materialTypeEnum;
      payload.unitMode = 'custom';
      payload.unitCustomId = unitCustomId;
    }

    setIsLoading(true);
    const res = await requestJson<{ transferId: string }>('/api/transfers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setIsLoading(false);

    if (!res.ok) {
      toast.error(res.message);
      return;
    }

    toast.success('Transfer request submitted');
    if (onSuccess) onSuccess();
    else router.push(`/app/sites/${fromSiteId}`);
  }

  return (
    <div className="max-w-2xl mx-auto pt-4 pb-20 px-4">
      <div className="mb-8">
        <h3 className="text-xl font-extrabold tracking-tight text-white uppercase">Transfer Resources</h3>
        <p className="text-sm text-slate-500 font-medium italic">Move labor or materials between active project zones.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="card-standard p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5 ml-1">
                From (Source)
              </label>
              <div className="relative">
                <select required value={fromSiteId} onChange={(e) => setFromSiteId(e.target.value)} className="input-standard pl-10 appearance-none bg-slate-900">
                  <option value="" className="bg-slate-900">Select Origin</option>
                  {sites.map((s) => <option key={s.siteId} value={s.siteId} className="bg-slate-900">{s.name}</option>)}
                </select>
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
            </div>

            <div className="hidden md:flex absolute top-2/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-sky-500 text-slate-950 rounded-full items-center justify-center shadow-lg shadow-sky-500/20 border-4 border-slate-900">
              <ArrowRightLeft className="w-4 h-4" />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5 ml-1">
                To (Destination)
              </label>
              <div className="relative">
                <select required value={toSiteId} onChange={(e) => setToSiteId(e.target.value)} className="input-standard pl-10 appearance-none bg-slate-900">
                  <option value="" className="bg-slate-900">Select Destination</option>
                  {sites.filter((s) => s.siteId !== fromSiteId).map((s) => <option key={s.siteId} value={s.siteId} className="bg-slate-900">{s.name}</option>)}
                </select>
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
            </div>
          </div>

          <hr className="border-white/5" />

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Resource Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setResourceType('Materials')}
                className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all uppercase tracking-widest text-[10px] font-bold ${
                  resourceType === 'Materials' ? 'bg-sky-500/10 border-sky-500 text-sky-400' : 'bg-white/5 border-white/5 text-slate-500'
                }`}
              >
                <Package className="w-5 h-5" /> Material
              </button>
              <button
                type="button"
                onClick={() => setResourceType('Labour')}
                className={`flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all uppercase tracking-widest text-[10px] font-bold ${
                  resourceType === 'Labour' ? 'bg-sky-500/10 border-sky-500 text-sky-400' : 'bg-white/5 border-white/5 text-slate-500'
                }`}
              >
                <Users className="w-5 h-5" /> Workforce
              </button>
            </div>
          </div>

          {resourceType === 'Labour' ? (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Work Type</label>
              <select value={workTypeEnum} onChange={(e) => setWorkTypeEnum(e.target.value)} className="input-standard appearance-none bg-slate-900">
                {LABOUR_WORK_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Material Type</label>
                <select value={materialTypeEnum} onChange={(e) => setMaterialTypeEnum(e.target.value)} className="input-standard appearance-none bg-slate-900">
                  {MATERIAL_TYPES.map((v) => <option key={v} value={v} className="bg-slate-900">{v}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Unit ID</label>
                <input value={unitCustomId} onChange={(e) => setUnitCustomId(e.target.value)} className="input-standard" placeholder="Unit UUID" required />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2 md:col-span-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Quantity</label>
              <input type="number" min="0" step="0.01" required value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input-standard" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Transfer Remarks</label>
              <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="input-standard" placeholder="Add loading/transport details..." />
            </div>
          </div>
        </section>

        <section className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-start gap-4 backdrop-blur-md">
          <AlertCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-400 font-medium leading-relaxed italic">
            Command Protocol: Both sector supervisors must verify dispatch and receipt logs before completion.
          </p>
        </section>

        <div className="pt-2">
          <button type="submit" disabled={isLoading} className="w-full btn-primary py-4 uppercase">
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Truck className="w-6 h-6 mr-3" />Initialize Asset Transfer</>}
          </button>
        </div>
      </form>
    </div>
  );
}
