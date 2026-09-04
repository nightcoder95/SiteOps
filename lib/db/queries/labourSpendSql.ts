import { sql } from "drizzle-orm";

// The one SQL home for "what did this labour row cost?". Mirrors
// lib/services/labourSpend.ts exactly — precedence is mason+helper split →
// stored salary_amount → people_count × wage_per_head.
//
// mason/helper amounts are PER-PERSON wages, so each role costs count × wage.
// The multiplication must appear in the WHEN guard as well as the THEN, or a
// wage with no head count takes this branch and reports the bare wage.
//
// lib/db/queries/entries.test.ts holds the fixture-parity test proving this
// agrees with the TS implementation. Do not inline a copy of this anywhere.
export const labourSpendSumExpr = sql`sum(case
        when coalesce(mason_count,0)*coalesce(mason_salary_amount,0)+coalesce(helper_count,0)*coalesce(helper_salary_amount,0)>0
          then coalesce(mason_count,0)*coalesce(mason_salary_amount,0)+coalesce(helper_count,0)*coalesce(helper_salary_amount,0)
        when coalesce(salary_amount,0)>0 then salary_amount
        else coalesce(people_count,0)*coalesce(wage_per_head,0)
      end)`;
