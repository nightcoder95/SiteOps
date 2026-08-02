import { sql } from "drizzle-orm";

import { withStatementTimeout, type Tx } from "@/lib/db/guard";
import { makeSnippet } from "@/lib/search/snippet";

export type SearchSource = "labour" | "material" | "machinery" | "expense";

export interface SearchHit {
  source: SearchSource;
  /** The source row's uuid (labour_entry_id / material_entry_id / … ). */
  entryId: string;
  siteId: string;
  siteName: string;
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Match-centered, length-capped snippet of the note. */
  snippet: string;
  /** Trigram similarity 0..1 over the searched column. */
  similarity: number;
  /** Entry spend. Null for material rows with no cost entered (cost is optional). */
  amount: number | null;
}

interface RawRow {
  source: SearchSource;
  entry_id: string;
  site_id: string;
  site_name: string;
  date: string;
  note: string;
  sim: number | string;
  amount: string | number | null;
}

export interface SearchScope {
  isAdmin: boolean;
  /** Accessible site ids; ignored when `isAdmin`. */
  siteIds: string[];
}

const TIMEOUT_MS = 5_000;
const SIMILARITY_THRESHOLD = 0.15;

/**
 * Global, cross-site search over the free-text note of daily logs — `remarks`
 * for labour/material/machinery and `description` for expense. Typo-tolerant via
 * pg_trgm. One parameterised UNION ALL query, ranked by similarity then recency,
 * role-scoped by accessible site ids. Fetches `limit + 1` rows to derive
 * `hasMore` without a second COUNT.
 */
export async function searchRemarks(params: {
  q: string;
  limit: number;
  offset: number;
  scope: SearchScope;
  /** Test seam: run inside an existing transaction instead of opening one. */
  tx?: Tx;
}): Promise<{ hits: SearchHit[]; hasMore: boolean }> {
  const { q, limit, offset, scope } = params;
  const fetchLimit = limit + 1;
  const like = `%${q}%`;

  // A non-admin with no accessible sites can match nothing. Guard here too (the
  // route also early-returns) so we never emit an empty `IN ()` clause.
  if (!scope.isAdmin && scope.siteIds.length === 0) {
    return { hits: [], hasMore: false };
  }

  // Site-scope predicate per table alias. Admin → unrestricted. Otherwise a real
  // `site_id IN (<uuid>, …)` list. NOTE: drizzle's `sql` template expands a JS
  // array into a placeholder LIST, not a single array param — so an array value
  // cannot be used with `= ANY($n::uuid[])`. We build an explicit IN-list of
  // individually-bound uuids instead. `alias` is a fixed code literal (sql.raw safe).
  const siteCond = (alias: string) => {
    if (scope.isAdmin) return sql`true`;
    const ids = sql.join(
      scope.siteIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    return sql`${sql.raw(alias)}.site_id IN (${ids})`;
  };

  // Archived sites are unreachable in the UI — every operations route 404s them —
  // so a hit on one is a dead deep link. Filter them out at the source.
  const notArchived = sql`s.archived_at IS NULL`;

  const runGuarded = async <T,>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    params.tx ? fn(params.tx) : withStatementTimeout(fn, TIMEOUT_MS);

  const rows = (await runGuarded(async (tx) => {
    // SET LOCAL cannot take a bound parameter, so interpolate the constant via
    // sql.raw (mirrors withStatementTimeout's own statement_timeout SET LOCAL).
    // SIMILARITY_THRESHOLD is a fixed numeric literal — never user input.
    await tx.execute(sql.raw(`SET LOCAL pg_trgm.similarity_threshold = ${SIMILARITY_THRESHOLD}`));
    return tx.execute(sql`
      SELECT source, entry_id, site_id, site_name, date, note, sim, amount
      FROM (
        SELECT 'labour'::text AS source, le.labour_entry_id::text AS entry_id,
               le.site_id::text AS site_id, s.name AS site_name, le.date::text AS date,
               le.remarks AS note, similarity(le.remarks, ${q}) AS sim,
               -- Mirrors calculateLabourTotal: split mason/helper wins, else the
               -- stored salary, else people * per-head wage.
               CASE
                 WHEN COALESCE(le.mason_salary_amount, 0) + COALESCE(le.helper_salary_amount, 0) > 0
                   THEN COALESCE(le.mason_salary_amount, 0) + COALESCE(le.helper_salary_amount, 0)
                 WHEN COALESCE(le.salary_amount, 0) > 0 THEN le.salary_amount
                 ELSE le.people_count * COALESCE(le.wage_per_head, 0)
               END AS amount
        FROM labour_entries le JOIN sites s ON s.site_id = le.site_id
        WHERE le.remarks IS NOT NULL
          AND (le.remarks % ${q} OR le.remarks ILIKE ${like})
          AND ${notArchived}
          AND ${siteCond("le")}
        UNION ALL
        SELECT 'material'::text, me.material_entry_id::text, me.site_id::text, s.name,
               me.date::text, me.remarks, similarity(me.remarks, ${q}), me.cost
        FROM material_entries me JOIN sites s ON s.site_id = me.site_id
        WHERE me.remarks IS NOT NULL
          AND (me.remarks % ${q} OR me.remarks ILIKE ${like})
          AND ${notArchived}
          AND ${siteCond("me")}
        UNION ALL
        SELECT 'machinery'::text, mc.machinery_entry_id::text, mc.site_id::text, s.name,
               mc.date::text, mc.remarks, similarity(mc.remarks, ${q}), COALESCE(mc.total_cost, 0)
        FROM machinery_entries mc JOIN sites s ON s.site_id = mc.site_id
        WHERE mc.remarks IS NOT NULL
          AND (mc.remarks % ${q} OR mc.remarks ILIKE ${like})
          AND ${notArchived}
          AND ${siteCond("mc")}
        UNION ALL
        -- expense: search DESCRIPTION (no remarks column); description is NOT NULL
        SELECT 'expense'::text, ee.expense_entry_id::text, ee.site_id::text, s.name,
               ee.date::text, ee.description, similarity(ee.description, ${q}), ee.amount
        FROM expense_entries ee JOIN sites s ON s.site_id = ee.site_id
        WHERE (ee.description % ${q} OR ee.description ILIKE ${like})
          AND ${notArchived}
          AND ${siteCond("ee")}
      ) hits
      ORDER BY sim DESC, date DESC
      LIMIT ${fetchLimit} OFFSET ${offset}
    `);
  })) as unknown as RawRow[];

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;

  const hits: SearchHit[] = sliced.map((r) => ({
    source: r.source,
    entryId: r.entry_id,
    siteId: r.site_id,
    siteName: r.site_name,
    date: r.date,
    snippet: makeSnippet(r.note, q),
    similarity: Number(r.sim),
    amount: r.amount == null ? null : Number(r.amount),
  }));

  return { hits, hasMore };
}
