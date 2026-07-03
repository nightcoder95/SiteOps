// Integration tests for the tool server layer. These write real rows, so they
// are OPT-IN: run only when TOOLS_IT_DB=1 against a SCRATCH database (never
// prod). Default `npm test` skips them.
//
//   TOOLS_IT_DB=1 DATABASE_URL=$SCRATCH_DB_URL npx vitest run lib/tools/integration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  sites,
  toolAssignments,
  toolCategories,
  toolMovements,
  tools,
  userProfiles,
} from "@/lib/db/schema";

import { applyOneTool } from "./applyBatch";
import { createTool, deleteTool } from "./manage";
import { returnSiteToolsOnLifecycle } from "./siteLifecycle";

const IT = process.env.TOOLS_IT_DB ? describe : describe.skip;

IT("tools server layer (integration)", () => {
  let actorId: string;
  let categoryId: string;
  let siteA: string;
  let siteB: string;
  const createdToolIds: string[] = [];

  beforeAll(async () => {
    // Actor user profile (FK target for created_by / actor).
    const u = (
      await db
        .insert(userProfiles)
        .values({ userId: crypto.randomUUID(), role: "Admin", fullName: "IT Actor" })
        .returning()
    )[0];
    actorId = u.userId;

    const cat = (
      await db
        .insert(toolCategories)
        .values({ name: `IT Cat ${Date.now()}`, codePrefix: `IT${Math.floor(Math.random() * 900 + 100)}` })
        .returning()
    )[0];
    categoryId = cat.categoryId;

    const mkSite = async (name: string) =>
      (
        await db
          .insert(sites)
          .values({
            name: `${name} ${Date.now()}-${Math.random()}`,
            location: "IT",
            supervisorId: actorId,
            createdByUserId: actorId,
            updatedByUserId: actorId,
          })
          .returning()
      )[0].siteId;
    siteA = await mkSite("IT Site A");
    siteB = await mkSite("IT Site B");
  });

  afterAll(async () => {
    if (createdToolIds.length) {
      await db.delete(toolMovements).where(inArray(toolMovements.toolId, createdToolIds));
      await db.delete(toolAssignments).where(inArray(toolAssignments.toolId, createdToolIds));
      await db.delete(tools).where(inArray(tools.toolId, createdToolIds));
    }
    await db.delete(sites).where(inArray(sites.siteId, [siteA, siteB]));
    await db.delete(toolCategories).where(eq(toolCategories.categoryId, categoryId));
    await db.delete(userProfiles).where(eq(userProfiles.userId, actorId));
  });

  async function freshTool(total = 20) {
    const t = await createTool({ name: `Tool ${crypto.randomUUID()}`, categoryId, openingStock: total, actorUserId: actorId });
    createdToolIds.push(t.toolId);
    return t;
  }

  async function ledger(toolId: string) {
    return db.select().from(toolMovements).where(eq(toolMovements.toolId, toolId));
  }

  describe("createTool", () => {
    it("mints a PREFIX-NNN code and writes an opening movement when stock > 0", async () => {
      const t = await freshTool(10);
      expect(t.code).toMatch(/^IT\d{3}-\d{3}$/);
      expect(t.totalQuantity).toBe(10);
      const l = await ledger(t.toolId);
      expect(l).toHaveLength(1);
      expect(l[0].kind).toBe("opening");
    });

    it("writes no opening movement when stock is 0 (case 15)", async () => {
      const t = await createTool({ name: `Tool ${crypto.randomUUID()}`, categoryId, openingStock: 0, actorUserId: actorId });
      createdToolIds.push(t.toolId);
      expect(await ledger(t.toolId)).toHaveLength(0);
    });
  });

  describe("applyOneTool", () => {
    it("assigns to a site and ledgers an assign movement (happy apply)", async () => {
      const t = await freshTool(20);
      const r = await applyOneTool({ toolId: t.toolId, version: t.version, assignments: [{ siteId: siteA, qty: 8 }] }, actorId);
      expect(r.status).toBe("ok");
      if (r.status === "ok") {
        expect(r.tool.version).toBe(t.version + 1);
        expect(r.tool.free).toBe(12);
        expect(r.tool.assignments).toEqual([{ siteId: siteA, qty: 8 }]);
      }
      const kinds = (await ledger(t.toolId)).map((m) => m.kind).sort();
      expect(kinds).toEqual(["assign", "opening"]);
    });

    it("stale version → conflict, no writes (case 6)", async () => {
      const t = await freshTool(20);
      const r = await applyOneTool({ toolId: t.toolId, version: t.version - 1, totalQuantity: 99 }, actorId);
      expect(r.status).toBe("conflict");
      const row = (await db.select().from(tools).where(eq(tools.toolId, t.toolId)))[0];
      expect(row.version).toBe(t.version);
      expect(row.totalQuantity).toBe(20);
    });

    it("Σ > total → invalid sum_exceeds_total, no writes (case 1)", async () => {
      const t = await freshTool(5);
      const r = await applyOneTool({ toolId: t.toolId, version: t.version, assignments: [{ siteId: siteA, qty: 6 }] }, actorId);
      expect(r).toMatchObject({ status: "invalid", reason: "sum_exceeds_total" });
      expect(await db.select().from(toolAssignments).where(eq(toolAssignments.toolId, t.toolId))).toHaveLength(0);
    });

    it("decreasing total below Σ deployed → invalid total_below_assigned (case 2)", async () => {
      const t = await freshTool(20);
      const a = await applyOneTool({ toolId: t.toolId, version: t.version, assignments: [{ siteId: siteA, qty: 8 }] }, actorId);
      const v = a.status === "ok" ? a.tool.version : t.version;
      const r = await applyOneTool({ toolId: t.toolId, version: v, totalQuantity: 5 }, actorId);
      expect(r).toMatchObject({ status: "invalid", reason: "total_below_assigned" });
    });

    it("archived site → invalid site_unavailable (case 5)", async () => {
      const t = await freshTool(20);
      const gone = (
        await db
          .insert(sites)
          .values({ name: `Gone ${crypto.randomUUID()}`, location: "IT", supervisorId: actorId, createdByUserId: actorId, updatedByUserId: actorId, archivedAt: new Date() })
          .returning()
      )[0].siteId;
      const r = await applyOneTool({ toolId: t.toolId, version: t.version, assignments: [{ siteId: gone, qty: 1 }] }, actorId);
      expect(r).toMatchObject({ status: "invalid", reason: "site_unavailable" });
      await db.delete(sites).where(eq(sites.siteId, gone));
    });

    it("procure-only payload (assignments omitted) does NOT delete assignments (accidental-wipe guard §19.1)", async () => {
      const t = await freshTool(10);
      const a = await applyOneTool({ toolId: t.toolId, version: t.version, assignments: [{ siteId: siteA, qty: 4 }] }, actorId);
      const v = a.status === "ok" ? a.tool.version : t.version;
      const r = await applyOneTool({ toolId: t.toolId, version: v, totalQuantity: 15 }, actorId);
      expect(r.status).toBe("ok");
      if (r.status === "ok") {
        expect(r.tool.totalQuantity).toBe(15);
        expect(r.tool.assignments).toEqual([{ siteId: siteA, qty: 4 }]);
      }
      const kinds = (await ledger(t.toolId)).map((m) => m.kind);
      expect(kinds).toContain("procure");
      expect(kinds).not.toContain("return");
    });

    it("concurrency: two saves at the same version → one ok, one conflict (FOR UPDATE + version)", async () => {
      const t = await freshTool(20);
      const [r1, r2] = await Promise.all([
        applyOneTool({ toolId: t.toolId, version: t.version, assignments: [{ siteId: siteA, qty: 3 }] }, actorId),
        applyOneTool({ toolId: t.toolId, version: t.version, assignments: [{ siteId: siteB, qty: 4 }] }, actorId),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual(["conflict", "ok"]);
    });
  });

  describe("deleteTool", () => {
    it("blocks delete when units are deployed (case 7)", async () => {
      const t = await freshTool(20);
      await applyOneTool({ toolId: t.toolId, version: t.version, assignments: [{ siteId: siteA, qty: 5 }] }, actorId);
      const r = await deleteTool({ toolId: t.toolId, force: false, actorUserId: actorId });
      expect(r).toEqual({ ok: false, reason: "deployed" });
      const row = (await db.select().from(tools).where(eq(tools.toolId, t.toolId)))[0];
      expect(row.isDeleted).toBe(false);
    });

    it("force delete returns every site then soft-deletes (case 7)", async () => {
      const t = await freshTool(20);
      await applyOneTool({ toolId: t.toolId, version: t.version, assignments: [{ siteId: siteA, qty: 5 }] }, actorId);
      const r = await deleteTool({ toolId: t.toolId, force: true, actorUserId: actorId });
      expect(r).toEqual({ ok: true });
      const row = (await db.select().from(tools).where(eq(tools.toolId, t.toolId)))[0];
      expect(row.isDeleted).toBe(true);
      expect(await db.select().from(toolAssignments).where(eq(toolAssignments.toolId, t.toolId))).toHaveLength(0);
      expect((await ledger(t.toolId)).some((m) => m.kind === "return" && m.note === "tool_deleted")).toBe(true);
    });
  });

  describe("returnSiteToolsOnLifecycle (case 8)", () => {
    it("archiving a site returns its tools to warehouse, ledgered, bumps version", async () => {
      const t = await freshTool(20);
      const a = await applyOneTool({ toolId: t.toolId, version: t.version, assignments: [{ siteId: siteB, qty: 6 }] }, actorId);
      const beforeVersion = a.status === "ok" ? a.tool.version : t.version;

      await db.transaction(async (tx) => {
        await tx.update(sites).set({ archivedAt: new Date() }).where(eq(sites.siteId, siteB));
        await returnSiteToolsOnLifecycle(tx, siteB, actorId, "site_archived");
      });

      expect(
        await db.select().from(toolAssignments).where(and(eq(toolAssignments.toolId, t.toolId), eq(toolAssignments.siteId, siteB))),
      ).toHaveLength(0);
      const row = (await db.select().from(tools).where(eq(tools.toolId, t.toolId)))[0];
      expect(row.version).toBe(beforeVersion + 1);
      expect((await ledger(t.toolId)).some((m) => m.kind === "return" && m.note === "site_archived")).toBe(true);
      // restore siteB for other tests' afterAll cleanup ordering
      await db.update(sites).set({ archivedAt: null }).where(eq(sites.siteId, siteB));
    });
  });

  beforeEach(() => {
    // no-op; each test creates its own tool for isolation
  });
});
