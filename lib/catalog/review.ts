import { and, eq, isNull } from "drizzle-orm";

import { can } from "@/lib/auth/capabilities";
import { db } from "@/lib/db/client";
import { createNotification, getAllAdmins } from "@/lib/db/queries/notifications";
import { fieldRequests, sites } from "@/lib/db/schema";
import { runNonCritical } from "@/lib/services/nonCritical";
import { rankSimilarityCandidates } from "@/lib/utils/stringSimilarity";

// The catalog review flow, shared by the categories and subcategories POST
// routes (audit F11). Both carried byte-identical copies of resolveReviewSiteId
// and near-identical review/custom-field blocks differing only in noun strings.
//
// NOTE: there is deliberately NO transaction here. The routes have always run
// the insert, the notification fan-out (fire-and-forget via runNonCritical) and
// the fieldRequests insert as independent statements. Adding a transaction as a
// side effect of this extraction would be a behaviour change with its own risk.

// Which site should a review request be filed against? Prefers the site the
// caller named; falls back to any active site they may act on. The capability
// check is load-bearing: without it a supervisor's review lands on a site they
// do not supervise.
export async function resolveReviewSiteId(
  preferredSiteId: string | undefined,
  sessionUserId: string,
  role: "Admin" | "Supervisor",
) {
  if (preferredSiteId) {
    const rows = await db
      .select({ siteId: sites.siteId })
      .from(sites)
      .where(and(eq(sites.siteId, preferredSiteId), isNull(sites.archivedAt)));
    if (rows[0]?.siteId) return rows[0].siteId;
  }

  const rows = can(role, "site:read_all")
    ? await db
      .select({ siteId: sites.siteId })
      .from(sites)
      .where(isNull(sites.archivedAt))
      .limit(1)
    : await db
      .select({ siteId: sites.siteId })
      .from(sites)
      .where(and(eq(sites.supervisorId, sessionUserId), isNull(sites.archivedAt)))
      .limit(1);

  return rows[0]?.siteId ?? null;
}

export type ReviewNoun = "category" | "subcategory";

// User-visible strings, copied verbatim from the two routes. They reach admins
// in notifications and appear in the fieldRequests list — parameterising them
// by noun is fine, changing them is not.
const NOUN_CONFIG = {
  category: {
    reviewPrefix: "[Category Review] ",
    notificationTitle: "Category needs review",
    notificationBody: (name: string) =>
      `A similar category "${name}" was created and flagged for admin review.`,
    nonCriticalEvent: "category_review_notification_failed",
  },
  subcategory: {
    reviewPrefix: "[Subcategory Review] ",
    notificationTitle: "Subcategory needs review",
    notificationBody: (name: string) =>
      `A similar subcategory "${name}" was created and flagged for admin review.`,
    nonCriticalEvent: "subcategory_review_notification_failed",
  },
} as const;

export async function submitForReview(input: {
  requestId: string;
  noun: ReviewNoun;
  name: string;
  categoryId: string;
  subcategoryId: string | null;
  preferredSiteId: string | undefined;
  sessionUserId: string;
  role: "Admin" | "Supervisor";
}): Promise<void> {
  const config = NOUN_CONFIG[input.noun];
  const admins = await getAllAdmins();

  runNonCritical(
    input.requestId,
    config.nonCriticalEvent,
    Promise.all(
      admins.map((admin) =>
        createNotification(
          admin.id,
          "approval",
          config.notificationTitle,
          config.notificationBody(input.name),
          input.preferredSiteId ? `/app/sites/${input.preferredSiteId}` : "/app/logs/new",
        ),
      ),
    ),
    input.noun === "category"
      ? { categoryId: input.categoryId, name: input.name }
      : { categoryId: input.categoryId, subcategoryId: input.subcategoryId, name: input.name },
  );

  const reviewSiteId = await resolveReviewSiteId(
    input.preferredSiteId,
    input.sessionUserId,
    input.role,
  );
  // No resolvable site → skip the row silently. Current behaviour: the create
  // still succeeds and the admins are still notified.
  if (!reviewSiteId) return;

  await db.insert(fieldRequests).values({
    siteId: reviewSiteId,
    proposedName: `${config.reviewPrefix}${input.name}`,
    categoryId: input.categoryId,
    // null for BOTH nouns — the subcategory route has always written null here.
    subcategoryId: null,
    fieldType: "Text",
    status: "Pending",
    requestedBy: input.sessionUserId,
  });
}

// The per-site "extra fields the supervisor asked for" rows that accompany a
// create. One row per non-blank custom field, plus one for remarks.
export type FieldRequestInsert = typeof fieldRequests.$inferInsert;

export function buildFieldRequestRows(input: {
  siteId: string;
  categoryId: string;
  subcategoryId: string | null;
  requestedBy: string;
  customFields?: Array<{ label: string; unit?: string | null; fieldType: FieldRequestInsert["fieldType"] }>;
  remarks?: string | null;
}): FieldRequestInsert[] {
  return [
    ...(input.customFields ?? [])
      .filter((item) => item.label.trim())
      .map((item) => ({
        siteId: input.siteId,
        proposedName: item.unit?.trim()
          ? `${item.label.trim()} (${item.unit.trim()})`
          : item.label.trim(),
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        fieldType: item.fieldType,
        status: "Pending" as const,
        requestedBy: input.requestedBy,
      })),
    ...(input.remarks?.trim()
      ? [{
        siteId: input.siteId,
        proposedName: `Remarks: ${input.remarks.trim()}`,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        fieldType: "Text" as const,
        status: "Pending" as const,
        requestedBy: input.requestedBy,
      }]
      : []),
  ];
}

// A proposed name this close to an existing one goes to admin review rather
// than being created silently. One constant, used by both create routes and
// both /similar routes — it used to be a bare 0.7 in four places.
export const SIMILARITY_REVIEW_THRESHOLD = 0.7;

// Shared ranking + review decision. The DB read stays in each caller: the
// categories list is global while subcategories are scoped to one category, and
// a generic table parameter would buy nothing but lost types.
export function checkSimilarNames(
  candidate: string,
  existing: Array<{ id: string; name: string }>,
) {
  const ranked = rankSimilarityCandidates(candidate, existing);
  return { ...ranked, requiresReview: ranked.topScore >= SIMILARITY_REVIEW_THRESHOLD };
}
