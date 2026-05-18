'use client';

import { motion } from 'motion/react';
import { MapPin } from 'lucide-react';
import Link from 'next/link';

import type { DashboardData } from '@/lib/services/dashboard';

export function DashboardPageClient({ data }: { data: DashboardData }) {
  const sites = data.sites.map((s) => ({ id: s.siteId, name: s.name, location: s.location, status: s.status }));

  return (
    <div className="space-y-6 pb-20">
      {/* Active Sites Stat Card */}
      <section className="grid grid-cols-1 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-standard p-5 flex flex-col justify-between h-32"
        >
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Active Sites</p>
          <div className="flex items-baseline gap-2 mt-auto">
            <span className="text-4xl font-light text-white tracking-tight">{data.sites.length}</span>
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Live</span>
          </div>
        </motion.div>
      </section>

      {/* Recent Site Activity Table */}
      <div className="flex flex-col lg:flex-row gap-6">
        <section className="flex-1 card-standard flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-white/5 backdrop-blur-md sticky top-0 z-10">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recent Site Activity</h2>
            <Link
              href="/app/sites"
              className="text-[10px] text-sky-400 font-bold uppercase tracking-widest hover:bg-white/5 px-2 py-1 rounded transition-colors"
            >
              View All Sites
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-white/5">
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Site Name
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest hidden sm:table-cell">
                    Location
                  </th>
                  <th className="text-right px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sites.map((site) => (
                  <tr
                    key={site.id}
                    onClick={() => (window.location.href = `/app/sites/${site.id}`)}
                    className="hover:bg-white/5 transition-colors cursor-pointer group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-200 group-hover:text-sky-400 transition-colors uppercase tracking-tight">
                          {site.name}
                        </span>
                        <span className="text-[10px] text-slate-500 sm:hidden mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {site.location}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500 italic hidden sm:table-cell">{site.location}</td>
                    <td className="px-5 py-4 text-right">
                      <span
                        className={
                          site.status === 'In Progress'
                            ? 'badge-emerald'
                            : site.status === 'Blocked'
                              ? 'badge-amber'
                              : 'badge-sky'
                        }
                      >
                        {site.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
