"use client";

import { AnimatePresence, motion } from "motion/react";
import { useBackDismiss } from "@/lib/nav/useBackDismiss";
import { ArrowLeftRight, ArrowRightLeft, Clock, History, PackageMinus, PackagePlus, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { SiteOption } from "@/components/tools/AssignmentPanel";
import type { ToolDTO } from "@/lib/client/tools";
import { useToolMovements, useToolMutations } from "@/lib/client/tools";
import { notifyError } from "@/lib/ui/toast";

const KIND_LABEL: Record<string, string> = {
  opening: "Stock Added (Opening)",
  procure: "Stock Added (Procured)",
  retire: "Stock Removed (Damaged/Retired)",
  assign: "Sent to Site",
  return: "Brought Back to Godown",
  transfer: "Transferred Between Sites",
  adjust: "Stock Adjusted",
};

function locationLabel(loc: string, siteName: (id: string) => string): string {
  if (loc === "WAREHOUSE") return "Godown";
  if (loc === "EXTERNAL") return "Supplier / External";
  return siteName(loc);
}

type Tab = "move" | "stock" | "history";

export function ToolDrawer({
  tool,
  sites,
  categoryName,
  onClose,
}: {
  tool: ToolDTO | null;
  sites: SiteOption[];
  categoryName: string;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("move");
  const [submitting, setSubmitting] = useState(false);

  // Accordion state for Move tab: "send" | "return" | "transfer"
  const [moveAction, setMoveAction] = useState<"send" | "return" | "transfer">("send");

  // Form states (using number | "" to allow users to backspace and clear inputs freely)
  const [sendSiteId, setSendSiteId] = useState("");
  const [sendQty, setSendQty] = useState<number | "">(1);
  const [sendNote, setSendNote] = useState("");

  const [returnSiteId, setReturnSiteId] = useState("");
  const [returnQty, setReturnQty] = useState<number | "">(1);
  const [returnNote, setReturnNote] = useState("");

  const [transferFromSiteId, setTransferFromSiteId] = useState("");
  const [transferToSiteId, setTransferToSiteId] = useState("");
  const [transferQty, setTransferQty] = useState<number | "">(1);
  const [transferNote, setTransferNote] = useState("");

  const [addQty, setAddQty] = useState<number | "">(1);
  const [addNote, setAddNote] = useState("");

  const [removeQty, setRemoveQty] = useState<number | "">(1);
  const [removeNote, setRemoveNote] = useState("");

  const { moveTool } = useToolMutations();
  const { data: movementsResult, isLoading: isMovementsLoading } = useToolMovements(tool?.toolId ?? null);
  const movements = movementsResult?.ok ? movementsResult.data.movements : [];

  const assignedCount = tool?.assignments.reduce((s, a) => s + a.qty, 0) ?? 0;
  const inGodown = tool ? tool.free : 0;

  const siteMap = new Map(sites.map((s) => [s.siteId, s.name]));
  const siteName = (id: string) => siteMap.get(id) ?? "Unknown site";

  // Reset form inputs when tool changes
  useEffect(() => {
    setSendSiteId("");
    setSendQty(1);
    setSendNote("");

    setReturnSiteId("");
    setReturnQty(1);
    setReturnNote("");

    setTransferFromSiteId("");
    setTransferToSiteId("");
    setTransferQty(1);
    setTransferNote("");

    setAddQty(1);
    setAddNote("");

    setRemoveQty(1);
    setRemoveNote("");

    setActiveTab("move");
    setMoveAction("send");
  }, [tool?.toolId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (tool) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tool, onClose]);

  // The phone back gesture closes the drawer instead of navigating the Tools
  // hub away underneath it. Must sit above the early return below — it is a
  // hook, and the drawer unmounts its body when `tool` is null.
  useBackDismiss(Boolean(tool), onClose);

  if (!tool) return null;

  const assignedSites = tool.assignments;
  const returnSiteAssignment = assignedSites.find((a) => a.siteId === returnSiteId);
  const maxReturnQty = returnSiteAssignment ? returnSiteAssignment.qty : 1;

  const transferFromAssignment = assignedSites.find((a) => a.siteId === transferFromSiteId);
  const maxTransferQty = transferFromAssignment ? transferFromAssignment.qty : 1;

  async function handleSend() {
    const finalQty = typeof sendQty === "number" ? Math.max(1, Math.min(inGodown, sendQty)) : 1;
    if (!sendSiteId || finalQty < 1 || !tool) return;

    setSubmitting(true);
    const res = await moveTool(tool.toolId, {
      kind: "send_to_site",
      targetSiteId: sendSiteId,
      quantity: finalQty,
      note: sendNote.trim() || undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success(`Sent ${finalQty} ${tool.name} to ${siteName(sendSiteId)}.`);
    setSendQty(1);
    setSendNote("");
  }

  async function handleReturn() {
    const finalQty = typeof returnQty === "number" ? Math.max(1, Math.min(maxReturnQty, returnQty)) : 1;
    if (!returnSiteId || finalQty < 1 || !tool) return;

    setSubmitting(true);
    const res = await moveTool(tool.toolId, {
      kind: "return_to_godown",
      fromSiteId: returnSiteId,
      quantity: finalQty,
      note: returnNote.trim() || undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success(`Brought back ${finalQty} ${tool.name} to Godown.`);
    setReturnQty(1);
    setReturnNote("");
  }

  async function handleTransfer() {
    const finalQty = typeof transferQty === "number" ? Math.max(1, Math.min(maxTransferQty, transferQty)) : 1;
    if (!transferFromSiteId || !transferToSiteId || transferFromSiteId === transferToSiteId || finalQty < 1 || !tool) return;

    setSubmitting(true);
    const res = await moveTool(tool.toolId, {
      kind: "transfer_site",
      fromSiteId: transferFromSiteId,
      targetSiteId: transferToSiteId,
      quantity: finalQty,
      note: transferNote.trim() || undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success(`Transferred ${finalQty} ${tool.name} from ${siteName(transferFromSiteId)} to ${siteName(transferToSiteId)}.`);
    setTransferQty(1);
    setTransferNote("");
  }

  async function handleAddStock() {
    const finalQty = typeof addQty === "number" ? Math.max(1, addQty) : 1;
    if (finalQty < 1 || !tool) return;

    setSubmitting(true);
    const res = await moveTool(tool.toolId, {
      kind: "add_stock",
      quantity: finalQty,
      note: addNote.trim() || undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success(`Added ${finalQty} ${tool.name} to stock.`);
    setAddQty(1);
    setAddNote("");
  }

  async function handleRemoveStock() {
    const finalQty = typeof removeQty === "number" ? Math.max(1, Math.min(inGodown, removeQty)) : 1;
    if (finalQty < 1 || !tool) return;

    setSubmitting(true);
    const res = await moveTool(tool.toolId, {
      kind: "remove_stock",
      quantity: finalQty,
      note: removeNote.trim() || undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success(`Removed ${finalQty} ${tool.name} from stock.`);
    setRemoveQty(1);
    setRemoveNote("");
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex justify-end bg-black/50 backdrop-blur-xs"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.aside
          role="dialog"
          aria-label={`Manage ${tool.name}`}
          className="flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-slate-900 shadow-2xl"
          initial={{ x: 40 }}
          animate={{ x: 0 }}
          exit={{ x: 40 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {categoryName}
                </span>
                <h2 className="truncate text-lg font-bold text-white">{tool.name}</h2>
              </div>
              <button
                type="button"
                aria-label="Close drawer"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-xs transition-all hover:bg-white/20 hover:border-white/30 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick KPI badges */}
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                In Godown: {inGodown}
              </span>
              <span className="rounded-lg bg-blue-500/15 px-2.5 py-1 text-xs font-semibold text-blue-400 border border-blue-500/20">
                At Sites: {assignedCount}
              </span>
              <span className="ml-auto text-xs font-medium text-slate-400">
                Total: {tool.totalQuantity}
              </span>
            </div>
          </div>

          {/* 3 Tabs Navigation */}
          <div className="flex border-b border-white/10 bg-slate-950/50 px-2">
            <button
              type="button"
              onClick={() => setActiveTab("move")}
              className={`flex-1 py-3 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
                activeTab === "move"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Move Tools
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("stock")}
              className={`flex-1 py-3 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
                activeTab === "stock"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Manage Stock
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`flex-1 py-3 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
                activeTab === "history"
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Tool History
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === "move" && (
              <div className="space-y-3">
                {/* Send to Site Card */}
                <div className={`rounded-xl border transition-colors ${moveAction === "send" ? "border-blue-500/50 bg-blue-500/5" : "border-white/5 bg-white/5"}`}>
                  <button
                    type="button"
                    onClick={() => setMoveAction("send")}
                    className="flex w-full items-center justify-between p-3.5 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Send className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-semibold text-white">Send to Site</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{inGodown} available</span>
                  </button>

                  {moveAction === "send" && (
                    <div className="space-y-3 border-t border-white/5 p-3.5 pt-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-300 mb-1">Destination Site</label>
                        <select
                          value={sendSiteId}
                          onChange={(e) => setSendSiteId(e.target.value)}
                          disabled={inGodown < 1}
                          className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500 disabled:opacity-40 cursor-pointer"
                        >
                          <option value="">{inGodown < 1 ? "No tools available in Godown" : "Select site..."}</option>
                          {sites.map((s) => (
                            <option key={s.siteId} value={s.siteId}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">Quantity</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={Math.max(1, inGodown)}
                            value={sendQty}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "") {
                                setSendQty("");
                              } else {
                                const num = parseInt(val, 10);
                                if (!isNaN(num)) setSendQty(num);
                              }
                            }}
                            onBlur={() => {
                              if (sendQty === "" || sendQty < 1) setSendQty(1);
                              else if (sendQty > inGodown) setSendQty(inGodown);
                            }}
                            disabled={inGodown < 1}
                            className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500 disabled:opacity-40"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">Note (optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. Sent with driver Sasi"
                            value={sendNote}
                            onChange={(e) => setSendNote(e.target.value)}
                            className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={submitting || !sendSiteId || inGodown < 1}
                        onClick={() => void handleSend()}
                        className="w-full h-9 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-40 cursor-pointer"
                      >
                        {submitting ? "Sending..." : "Send to Site"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Bring Back to Godown Card */}
                <div className={`rounded-xl border transition-colors ${moveAction === "return" ? "border-blue-500/50 bg-blue-500/5" : "border-white/5 bg-white/5"}`}>
                  <button
                    type="button"
                    onClick={() => setMoveAction("return")}
                    className="flex w-full items-center justify-between p-3.5 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-semibold text-white">Bring Back to Godown</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{assignedSites.length} site(s) holding</span>
                  </button>

                  {moveAction === "return" && (
                    <div className="space-y-3 border-t border-white/5 p-3.5 pt-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-300 mb-1">From Site</label>
                        <select
                          value={returnSiteId}
                          onChange={(e) => {
                            setReturnSiteId(e.target.value);
                            setReturnQty(1);
                          }}
                          disabled={assignedSites.length === 0}
                          className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500 disabled:opacity-40 cursor-pointer"
                        >
                          <option value="">{assignedSites.length === 0 ? "No tools deployed at any site" : "Select site..."}</option>
                          {assignedSites.map((a) => (
                            <option key={a.siteId} value={a.siteId}>
                              {siteName(a.siteId)} ({a.qty} assigned)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">Quantity</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={maxReturnQty}
                            value={returnQty}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "") {
                                setReturnQty("");
                              } else {
                                const num = parseInt(val, 10);
                                if (!isNaN(num)) setReturnQty(num);
                              }
                            }}
                            onBlur={() => {
                              if (returnQty === "" || returnQty < 1) setReturnQty(1);
                              else if (returnQty > maxReturnQty) setReturnQty(maxReturnQty);
                            }}
                            disabled={!returnSiteId}
                            className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500 disabled:opacity-40"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">Note (optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. Returned after work"
                            value={returnNote}
                            onChange={(e) => setReturnNote(e.target.value)}
                            className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={submitting || !returnSiteId}
                        onClick={() => void handleReturn()}
                        className="w-full h-9 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40 cursor-pointer"
                      >
                        {submitting ? "Processing..." : "Bring Back to Godown"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Transfer Between Sites Card */}
                <div className={`rounded-xl border transition-colors ${moveAction === "transfer" ? "border-blue-500/50 bg-blue-500/5" : "border-white/5 bg-white/5"}`}>
                  <button
                    type="button"
                    onClick={() => setMoveAction("transfer")}
                    className="flex w-full items-center justify-between p-3.5 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ArrowLeftRight className="h-4 w-4 text-amber-400" />
                      <span className="text-sm font-semibold text-white">Transfer Between Sites</span>
                    </div>
                    <span className="text-[10px] text-slate-400">Direct site-to-site</span>
                  </button>

                  {moveAction === "transfer" && (
                    <div className="space-y-3 border-t border-white/5 p-3.5 pt-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">From Site</label>
                          <select
                            value={transferFromSiteId}
                            onChange={(e) => {
                              setTransferFromSiteId(e.target.value);
                              setTransferQty(1);
                            }}
                            disabled={assignedSites.length === 0}
                            className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500 disabled:opacity-40 cursor-pointer"
                          >
                            <option value="">Select source...</option>
                            {assignedSites.map((a) => (
                              <option key={a.siteId} value={a.siteId}>
                                {siteName(a.siteId)} ({a.qty})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">To Site</label>
                          <select
                            value={transferToSiteId}
                            onChange={(e) => setTransferToSiteId(e.target.value)}
                            disabled={!transferFromSiteId}
                            className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500 disabled:opacity-40 cursor-pointer"
                          >
                            <option value="">Select dest...</option>
                            {sites
                              .filter((s) => s.siteId !== transferFromSiteId)
                              .map((s) => (
                                <option key={s.siteId} value={s.siteId}>
                                  {s.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">Quantity</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={maxTransferQty}
                            value={transferQty}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "") {
                                setTransferQty("");
                              } else {
                                const num = parseInt(val, 10);
                                if (!isNaN(num)) setTransferQty(num);
                              }
                            }}
                            onBlur={() => {
                              if (transferQty === "" || transferQty < 1) setTransferQty(1);
                              else if (transferQty > maxTransferQty) setTransferQty(maxTransferQty);
                            }}
                            disabled={!transferFromSiteId}
                            className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500 disabled:opacity-40"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">Note (optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. Sent directly via supervisor"
                            value={transferNote}
                            onChange={(e) => setTransferNote(e.target.value)}
                            className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={submitting || !transferFromSiteId || !transferToSiteId}
                        onClick={() => void handleTransfer()}
                        className="w-full h-9 rounded-lg bg-amber-600 px-4 text-xs font-bold text-white transition-colors hover:bg-amber-500 disabled:opacity-40 cursor-pointer"
                      >
                        {submitting ? "Transferring..." : "Transfer Tools"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "stock" && (
              <div className="space-y-4">
                {/* Add Stock */}
                <div className="rounded-xl border border-white/5 bg-white/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <PackagePlus className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-white">Add New Tools to Stock</h3>
                  </div>
                  <p className="text-xs text-slate-400">Add newly purchased tools directly to the central Godown.</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">Quantity</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={addQty}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "") {
                            setAddQty("");
                          } else {
                            const num = parseInt(val, 10);
                            if (!isNaN(num)) setAddQty(num);
                          }
                        }}
                        onBlur={() => {
                          if (addQty === "" || addQty < 1) setAddQty(1);
                        }}
                        className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">Note (optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Purchased from hardware store"
                        value={addNote}
                        onChange={(e) => setAddNote(e.target.value)}
                        className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleAddStock()}
                    className="w-full h-9 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40 cursor-pointer"
                  >
                    {submitting ? "Adding..." : "Add to Stock"}
                  </button>
                </div>

                {/* Remove / Mark Damaged */}
                <div className="rounded-xl border border-white/5 bg-white/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <PackageMinus className="h-4 w-4 text-rose-400" />
                    <h3 className="text-sm font-semibold text-white">Remove / Mark Damaged</h3>
                  </div>
                  <p className="text-xs text-slate-400">Deduct damaged or lost tools from Godown stock ({inGodown} free available).</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">Quantity</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={Math.max(1, inGodown)}
                        value={removeQty}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "") {
                            setRemoveQty("");
                          } else {
                            const num = parseInt(val, 10);
                            if (!isNaN(num)) setRemoveQty(num);
                          }
                        }}
                        onBlur={() => {
                          if (removeQty === "" || removeQty < 1) setRemoveQty(1);
                          else if (removeQty > inGodown) setRemoveQty(inGodown);
                        }}
                        disabled={inGodown < 1}
                        className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500 disabled:opacity-40"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">Note (optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Damaged during usage"
                        value={removeNote}
                        onChange={(e) => setRemoveNote(e.target.value)}
                        className="h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={submitting || inGodown < 1}
                    onClick={() => void handleRemoveStock()}
                    className="w-full h-9 rounded-lg bg-rose-600 px-4 text-xs font-bold text-white transition-colors hover:bg-rose-500 disabled:opacity-40 cursor-pointer"
                  >
                    {submitting ? "Removing..." : "Remove Stock"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "history" && (
              <div>
                {isMovementsLoading ? (
                  <p className="text-xs text-slate-400">Loading timeline...</p>
                ) : movements.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    <History className="mx-auto h-6 w-6 mb-2 text-slate-500" />
                    No movement history recorded yet for this tool.
                  </div>
                ) : (
                  <ol className="space-y-2.5">
                    {movements.map((m) => (
                      <li key={m.movementId} className="rounded-xl border border-white/5 bg-white/5 p-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{KIND_LABEL[m.kind] ?? m.kind}</span>
                          <span className="font-mono font-bold text-emerald-400">×{m.quantity}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-300">
                          {locationLabel(m.fromLocation, siteName)} → {locationLabel(m.toLocation, siteName)}
                        </p>
                        {m.note && <p className="mt-0.5 text-[11px] text-slate-400 italic">"{m.note}"</p>}
                        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(m.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
