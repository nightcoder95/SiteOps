"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { displayUnitName } from "@/lib/db/queries/materialUnits";
import { requestJson } from "@/lib/http/client";

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
  const [masterUnits, setMasterUnits] = useState<MasterUnit[]>([]);
  const [customUnits, setCustomUnits] = useState<CustomUnit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      setLoading(true);
      const [masterRes, customRes] = await Promise.all([
        requestJson<MasterUnit[]>("/api/catalog/units/master", { signal: controller.signal }),
        requestJson<CustomUnit[]>("/api/catalog/units/custom", { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;

      if (!masterRes.ok) {
        toast.error(masterRes.message);
      } else {
        setMasterUnits(masterRes.data.filter((unit) => unit.isActive));
      }

      if (!customRes.ok) {
        toast.error(customRes.message);
      } else {
        setCustomUnits(customRes.data.filter((unit) => unit.isActive));
      }

      setLoading(false);
    })();

    return () => controller.abort();
  }, []);

  const options: UnitOption[] = [
    ...masterUnits.map((unit) => ({
      unitId: unit.unitId,
      label: displayUnitName(unit.label),
      mode: "master" as const,
      name: displayUnitName(unit.label),
    })),
    ...customUnits.map((unit) => ({
      unitId: unit.unitId,
      label: displayUnitName(unit.symbol ? `${unit.name} (${unit.symbol})` : unit.name),
      mode: "custom" as const,
      name: displayUnitName(unit.name),
    })),
  ].filter((unit) => !allowedNames?.length || allowedNames.includes(unit.name));

  useEffect(() => {
    if (!value || !allowedNames?.length) return;
    if (!allowedNames.includes(value.name)) onChange(null);
  }, [allowedNames, onChange, value]);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
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
