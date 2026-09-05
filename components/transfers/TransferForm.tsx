'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useNavRouter } from '@/lib/nav/useNavRouter';
import { ArrowRightLeft, MapPin, Truck, Package, Users, ChevronDown, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { notifyError } from '@/lib/ui/toast';

import { UnitSelect, type UnitOption } from '@/components/logs/UnitSelect';
import { requestJson } from '@/lib/http/client';
import { useCatalogNames } from '@/lib/catalog/useCatalogNames';
import { filterToAllowedCanonical } from '@/lib/catalog/selectors';
import { labourDefaultTypes, materialDefaultTypes } from '@/lib/validation/schemas';

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

export function TransferForm({ sites, defaultFromSiteId, onSuccess }: Props) {
  const router = useNavRouter();
  const [isLoading, setIsLoading] = useState(false);

  // Live catalog instead of hardcoded option lists, so transfers stay in sync
  // with the admin-managed Labour/Materials types. Transfers still write pg-enum
  // columns, so filter to enum-accepted values until the enum→varchar migration.
  const { names: labourCatalog, loading: labourLoading } = useCatalogNames('Labour');
  const { names: materialCatalog, loading: materialLoading } = useCatalogNames('Materials');
  const labourWorkTypes = filterToAllowedCanonical(labourCatalog, labourDefaultTypes);
  const materialTypes = filterToAllowedCanonical(materialCatalog, materialDefaultTypes);

  const [fromSiteId, setFromSiteId] = useState(defaultFromSiteId || '');
  const [toSiteId, setToSiteId] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType>('Materials');
  const [workTypeEnum, setWorkTypeEnum] = useState<string>('');
  const [materialTypeEnum, setMaterialTypeEnum] = useState<string>('');
  const [unit, setUnit] = useState<UnitOption | null>(null);
  const [quantity, setQuantity] = useState('');
  const [remarks, setRemarks] = useState('');

  // Default the selection to the first catalog option once it loads, without
  // clobbering a choice the user already made.
  useEffect(() => {
    if (!workTypeEnum && labourWorkTypes.length) setWorkTypeEnum(labourWorkTypes[0]);
  }, [labourWorkTypes, workTypeEnum]);
  useEffect(() => {
    if (!materialTypeEnum && materialTypes.length) setMaterialTypeEnum(materialTypes[0]);
  }, [materialTypes, materialTypeEnum]);

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

    if (resourceType === 'Labour' && !workTypeEnum) {
      toast.error('Select a work type');
      return;
    }
    if (resourceType === 'Materials' && !materialTypeEnum) {
      toast.error('Select a material type');
      return;
    }

    if (resourceType === 'Materials' && !unit) {
      toast.error('Select a unit for material transfers');
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
      // The guard above returns before this branch when no unit is picked.
      payload.unitMode = unit!.mode;
      if (unit!.mode === 'master') payload.unitMasterId = unit!.unitId;
      else payload.unitCustomId = unit!.unitId;
    }

    setIsLoading(true);
    const res = await requestJson<{ transferId: string }>('/api/transfers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setIsLoading(false);

    if (!res.ok) {
      notifyError(res);
      return;
    }

    toast.success('Transfer request submitted');
    if (onSuccess) onSuccess();
    else router.replace(`/app/sites/${fromSiteId}`);
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
              <label htmlFor="transfer-from-site" className="text-[11px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5 ml-1">
                From (Source)
              </label>
              <div className="relative">
                <select id="transfer-from-site" required value={fromSiteId} onChange={(e) => setFromSiteId(e.target.value)} className="input-standard pl-10 appearance-none bg-slate-900">
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
              <label htmlFor="transfer-to-site" className="text-[11px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5 ml-1">
                To (Destination)
              </label>
              <div className="relative">
                <select id="transfer-to-site" required value={toSiteId} onChange={(e) => setToSiteId(e.target.value)} className="input-standard pl-10 appearance-none bg-slate-900">
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
            {/* This labels a pair of toggle buttons, not a form control, so it
                is a group label rather than a <label htmlFor>. */}
            <p id="transfer-resource-type" className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">Resource Type</p>
            <div role="group" aria-labelledby="transfer-resource-type" className="grid grid-cols-2 gap-3">
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
              <label htmlFor="transfer-work-type" className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">Work Type</label>
              <select id="transfer-work-type" value={workTypeEnum} onChange={(e) => setWorkTypeEnum(e.target.value)} disabled={labourLoading} className="input-standard appearance-none bg-slate-900">
                <option value="" className="bg-slate-900">
                  {labourLoading ? 'Loading…' : labourWorkTypes.length ? 'Select…' : 'No work types available'}
                </option>
                {labourWorkTypes.map((v) => <option key={v} value={v} className="bg-slate-900">{v}</option>)}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="transfer-material-type" className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">Material Type</label>
                <select id="transfer-material-type" value={materialTypeEnum} onChange={(e) => setMaterialTypeEnum(e.target.value)} disabled={materialLoading} className="input-standard appearance-none bg-slate-900">
                  <option value="" className="bg-slate-900">
                    {materialLoading ? 'Loading…' : materialTypes.length ? 'Select…' : 'No material types available'}
                  </option>
                  {materialTypes.map((v) => <option key={v} value={v} className="bg-slate-900">{v}</option>)}
                </select>
              </div>
              {/* UnitSelect renders its own label — no wrapper <label> here. */}
              <UnitSelect label="Unit" value={unit} onChange={setUnit} required />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2 md:col-span-1">
              <label htmlFor="transfer-quantity" className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">Quantity</label>
              <input id="transfer-quantity" type="number" inputMode="decimal" min="0" step="0.01" required value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input-standard" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="transfer-remarks" className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">Transfer Remarks</label>
              <input id="transfer-remarks" type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="input-standard" placeholder="Add loading/transport details..." />
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
