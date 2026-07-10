"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

export function parseDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date(Number.NaN);
  return new Date(year, month - 1, day);
}

export function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthLabel(date: Date) {
  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export function calendarDays(viewDate: Date) {
  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

export function formatDateFieldValue(value: string) {
  if (!value) return "Select date";
  const date = parseDateValue(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
}

export function DateFilterField({
  id,
  label,
  value,
  onChange,
  openId,
  setOpenId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  openId: string | null;
  setOpenId: (value: string | null) => void;
}) {
  const selectedDate = value ? parseDateValue(value) : null;
  const open = openId === id;
  const setOpen = (next: boolean) => setOpenId(next ? id : null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewDate, setViewDate] = useState(
    selectedDate && !Number.isNaN(selectedDate.getTime()) ? selectedDate : new Date(),
  );

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent | TouchEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpenId(null);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenId(null);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, setOpenId]);
  const todayValue = toDateValue(new Date());
  const selectedValue = selectedDate && !Number.isNaN(selectedDate.getTime()) ? toDateValue(selectedDate) : "";

  function changeMonth(offset: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function selectDate(date: Date) {
    onChange(toDateValue(date));
    setViewDate(date);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={open ? "relative z-[90] space-y-2" : "relative space-y-2"}>
      <label
        htmlFor={id}
        className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400"
      >
        {label}
      </label>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-14 w-full cursor-pointer items-center justify-between rounded-2xl border border-white/8 bg-white/[0.04] px-5 text-left text-slate-100 transition-colors hover:border-sky-500/30 hover:bg-white/[0.06] focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
      >
        <span className={value ? "text-base font-medium text-slate-100" : "text-base font-medium text-slate-500"}>
          {formatDateFieldValue(value)}
        </span>
        <CalendarDays className="w-5 h-5 text-slate-500" />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-3rem))] rounded-2xl border border-sky-500/20 bg-slate-950 p-4 shadow-2xl shadow-sky-950/40">
          <div className="flex items-center justify-between pb-3">
            <p className="text-sm font-extrabold uppercase tracking-widest text-white">
              {monthLabel(viewDate)}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                aria-label="Previous month"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-colors hover:border-sky-500/30 hover:text-sky-400"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                aria-label="Next month"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-colors hover:border-sky-500/30 hover:text-sky-400"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 pb-2">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
              <div
                key={`${day}-${index}`}
                className="flex h-8 items-center justify-center text-[10px] font-extrabold uppercase tracking-widest text-slate-500"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays(viewDate).map((date) => {
              const dateValue = toDateValue(date);
              const isSelected = dateValue === selectedValue;
              const isToday = dateValue === todayValue;
              const isCurrentMonth = date.getMonth() === viewDate.getMonth();

              return (
                <button
                  key={dateValue}
                  type="button"
                  onClick={() => selectDate(date)}
                  className={[
                    "flex h-10 items-center justify-center rounded-xl text-sm font-bold transition-colors",
                    isSelected
                      ? "bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20"
                      : "text-slate-200 hover:bg-sky-500/10 hover:text-sky-400",
                    !isCurrentMonth && !isSelected ? "text-slate-700" : "",
                    isToday && !isSelected ? "border border-sky-500/40" : "",
                  ].join(" ")}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-widest text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => selectDate(new Date())}
              className="rounded-xl bg-sky-500 px-3 py-2 text-xs font-extrabold uppercase tracking-widest text-slate-950 transition-colors hover:bg-sky-400"
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
