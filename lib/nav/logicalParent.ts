// Where "back" should go when there is no history to go back to.
//
// Deep-linked arrivals — a push notification, a shared URL, a PWA shortcut —
// open with an empty history stack, so router.back() exits the app entirely.
// This derives the parent screen from the route instead.
//
// The mapping is explicit rather than "drop the last segment", because that
// rule is wrong for the operations pages: /app/sites/:id/operations is not a
// route, so the parent of /app/sites/:id/operations/:type is the site page.
// Route tree verified with `find app/app -name page.tsx`.
const DASHBOARD = "/app/dashboard";

export function logicalParent(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "app") return DASHBOARD;

  // /app/sites/:id/operations/:type[/:category]
  if (segments[1] === "sites" && segments[3] === "operations" && segments.length >= 5) {
    const [, , siteId, , type] = segments;
    return segments.length >= 6
      ? `/app/sites/${siteId}/operations/${type}`
      : `/app/sites/${siteId}`;
  }

  // /app/sites/:id/stages — the per-site work stage summary.
  if (segments[1] === "sites" && segments[3] === "stages" && segments.length === 4) {
    return `/app/sites/${segments[2]}`;
  }

  // /app/sites/:id and /app/sites/new — NOT /app/sites. That route was removed
  // in favour of the dashboard, which is where the site list actually lives
  // (app/app/dashboard/SitesCard.tsx), and app/app/sites/page.tsx is a bare
  // notFound() tombstone. Pointing the chevron at it dropped the user on a 404.
  if (segments[1] === "sites" && segments.length === 3) return DASHBOARD;

  // /app/logs/new/:categoryId — the second step of the new-log flow.
  if (segments[1] === "logs" && segments[2] === "new" && segments.length >= 4) {
    return "/app/logs/new";
  }

  // Everything else — the admin pages, the request queues, /app/logs/:entryId,
  // /app/transfers/new, and the top-level sections — hangs off the dashboard.
  return DASHBOARD;
}
