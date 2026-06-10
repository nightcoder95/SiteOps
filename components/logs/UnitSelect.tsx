"use client";

import { useEffect } from "react";

import { displayUnitName } from "@/lib/db/queries/materialUnits";
import { useApiResult } from "@/lib/http/useApiQuery";
import { notifyError } from "@/lib/ui/toast";

export type UnitOption = {
  unitId: string;
  label: string;
  mode: "master" | "custom";
  name: string;
};

type MasterUnit = {
  unitId: string;
  code: string;
  label: string;
  isActive: boolean;
};

type CustomUnit = {
  unitId: string;
  name: string;
  symbol: string | null;
  isActive: boolean;
};

type Props = {
  label: string;
  value: UnitOption | null;
  onChange: (value: UnitOption | null) => void;
  required?: boolean;
  allowedNames?: string[];
};

export function UnitSelect({ label, value, onChange, required, allowedNames }: Props) {
  // Unit catalogs change rarely — cache + dedupe so reopening the form is instant.
  const { data: masterRes } = useApiResult<MasterUnit[]>("/api/catalog/units/master");
  const { data: customRes } = useApiResult<CustomUnit[]>("/api/catalog/units/custom");
  const loading = !masterRes || !customRes;
  const masterUnits = masterRes?.ok ? masterRes.data.filter((unit) => unit.isActive) : [];
  const customUnits = customRes?.ok ? customRes.data.filter((unit) => unit.isActive) : [];

  useEffect(() => {
    if (masterRes && !masterRes.ok) notifyError(masterRes);
  }, [masterRes]);
  useEffect(() => {
    if (customRes && !customRes.ok) notifyError(customRes);
  }, [customRes]);

  const options: UnitOption[] = [
    ...masterUnits.map((unit) => ({
      unitId: unit.unitId,
      label: displayUnitName(unit.label),
      mode: "master" as const,
      name: displayUnitName(unit.label),
    })),
    ...(allowedNames?.length ? [] : customUnits.map((unit) => ({
      unitId: unit.unitId,
      label: displayUnitName(unit.symbol ? `${unit.name} (${unit.symbol})` : unit.name),
      mode: "custom" as const,
      name: displayUnitName(unit.name),
    }))),
  ].filter((unit) => !allowedNames?.length || allowedNames.includes(unit.name));

  useEffect(() => {
    if (!value || !allowedNames?.length) return;
    if (!allowedNames.includes(value.name)) onChange(null);
  }, [allowedNames, onChange, value]);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
        {label}
        {required && " *"}
      </label>
      <select
        value={value ? `${value.mode}:${value.unitId}` : ""}
        onChange={(event) => {
          const nextValue = options.find(
            (option) => `${option.mode}:${option.unitId}` === event.target.value,
          ) ?? null;
          onChange(nextValue);
        }}
        required={required}
        disabled={loading}
        className="input-standard appearance-none bg-slate-900"
      >
        <option value="" className="bg-slate-900">
          {loading ? "Loading..." : "Select..."}
        </option>
        {options.map((option) => (
          <option
            key={`${option.mode}:${option.unitId}`}
            value={`${option.mode}:${option.unitId}`}
            className="bg-slate-900"
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
