import { expect, it } from "vitest";

import { getResourceRequestsFor } from "@/lib/db/queries/resourceRequests";
import { resourceRequests } from "@/lib/db/schema";
import { describeDb, seedSite, withRollback } from "@/lib/db/testing";

// The server component for /app/requests/resource calls this instead of its own
// HTTP route (audit F16). The scoping below IS the authorization boundary: a
// role without resource:manage_all must never see another user's request.
describeDb("getResourceRequestsFor", () => {
  it("returns only the caller's own requests for a role without resource:manage_all", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      const other = await seedSite(tx);

      await tx.insert(resourceRequests).values([
        { siteId, requestType: "Materials", details: "mine, ten chars", reason: "because reasons", requestedBy: userId },
        { siteId: other.siteId, requestType: "Labour", details: "theirs, ten chars", reason: "because reasons", requestedBy: other.userId },
      ]);

      const rows = await getResourceRequestsFor(
        { id: userId, role: "Supervisor" },
        tx,
      );

      expect(rows.map((row) => row.requestedBy)).toEqual([userId]);
    });
  });

  it("returns every request for a role with resource:manage_all", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      const other = await seedSite(tx);

      await tx.insert(resourceRequests).values([
        { siteId, requestType: "Materials", details: "mine, ten chars", reason: "because reasons", requestedBy: userId },
        { siteId: other.siteId, requestType: "Labour", details: "theirs, ten chars", reason: "because reasons", requestedBy: other.userId },
      ]);

      const rows = await getResourceRequestsFor({ id: userId, role: "Admin" }, tx);
      const owners = rows.map((row) => row.requestedBy);

      expect(owners).toContain(userId);
      expect(owners).toContain(other.userId);
    });
  });
});
