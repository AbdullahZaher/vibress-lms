import { projectPublicCourse } from "./access.js";
import type { Course, Enrollment, VerifiedMemberScope } from "./types.js";

export type FreeEnrollmentDecision =
  | { readonly kind: "eligible" }
  | { readonly kind: "already-enrolled" }
  | { readonly kind: "reactivation-required" }
  | { readonly kind: "entitlement-required" }
  | { readonly kind: "not-found" };

/**
 * Read-only decision for a host-authenticated learner. Scope MUST come from
 * authoritative Member/session + independently resolved publication. The
 * caller MUST still use a publication-scoped atomic insert-or-existing with
 * UNIQUE(publication_id, course_id, member_id) to handle concurrent requests.
 *
 * This is for FREE enrollment only; paid course access is blocked pending the
 * host's verified entitlements bridge. Revoked/suspended registrations must
 * not be silently reactivated by a retry.
 */
export function decideFreeEnrollment(
  course: Course,
  enrollment: Enrollment | null,
  member: VerifiedMemberScope,
  locale: string,
): FreeEnrollmentDecision {
  if (
    !member.publicationId || !member.memberId ||
    course.publicationId !== member.publicationId ||
    !projectPublicCourse(course, member.publicationId, locale)
  ) return { kind: "not-found" };

  // A scoped repository should never return a different Member's enrollment.
  // Fail closed if a compromised/unscoped adapter does so; reveal no identifiers.
  if (
    enrollment &&
    (enrollment.publicationId !== member.publicationId ||
      enrollment.courseId !== course.id ||
      enrollment.memberId !== member.memberId)
  ) return { kind: "not-found" };

  if (course.access !== "free") return { kind: "entitlement-required" };
  if (enrollment?.status === "active") return { kind: "already-enrolled" };
  if (enrollment) return { kind: "reactivation-required" };
  return { kind: "eligible" };
}
