import {
  authorizeLesson, projectPublicCourse,
  type LessonAccess, type PublicCourse,
} from "../domain/access.js";
import { decideFreeEnrollment } from "../domain/enrollment.js";
import type { Course, Enrollment, Lesson } from "../domain/types.js";

/**
 * Application-level Host port for a separate, operator-approved LMS extension.
 * A real adapter must use Host-provided, publication-scoped operations. It MUST
 * NOT access Vibress PostgreSQL directly or accept member/tenant IDs from HTTP.
 */
export interface AuthenticatedLmsRequest {
  /** From the authoritative Host publication resolver, NOT a client field. */
  readonly publicationId: string;
  /** Gets the actual Host-authenticated Member, not a claimed ID. */
  readonly currentMember: () => Promise<{
    readonly id: string;
    readonly publicationId: string;
  } | null>;
}

export interface PublicationScopedLmsRepository {
  getCourse(publicationId: string, courseId: string): Promise<Course | null>;
  getLesson(publicationId: string, courseId: string, lessonId: string): Promise<Lesson | null>;
  getEnrollment(
    publicationId: string, courseId: string, memberId: string,
  ): Promise<Enrollment | null>;

  /**
   * Must be one *atomic* transaction using a unique
   * (publication_id,course_id,member_id) constraint. It MUST NOT update,
   * reactivate or overwrite an existing enrollment, including revoked rows.
   * It must recheck course status/access inside the same transaction to avoid
   * enrollments after unpublish or a price/access change. Return whether the
   * row was newly inserted. The caller verifies every returned row against
   * Host Member scope.
   */
  insertFreeEnrollmentIfAbsent(input: {
    readonly publicationId: string;
    readonly courseId: string;
    readonly memberId: string;
  }): Promise<{ readonly enrollment: Enrollment; readonly inserted: boolean }>;
}

export type EnrollmentOutcome =
  | { readonly kind: "created" | "already-enrolled" }
  | { readonly kind: "not-found" | "unauthenticated" |
    "reactivation-required" | "entitlement-required" };

/** Fails closed if an adapter accidentally returns a cross-tenant or
 * cross-member row. A data-store error must propagate, never look like
 * permission to create a new enrollment. */
function boundEnrollment(
  enrollment: Enrollment,
  publicationId: string, courseId: string, memberId: string,
): boolean {
  return Boolean(
    enrollment.id && enrollment.publicationId === publicationId &&
    enrollment.courseId === courseId && enrollment.memberId === memberId,
  );
}

async function authenticatedMember(context: AuthenticatedLmsRequest) {
  if (!context.publicationId) return null;
  const member = await context.currentMember();
  if (!member || !member.id || member.publicationId !== context.publicationId) return null;
  return { publicationId: context.publicationId, memberId: member.id };
}

export class LmsHostApplication {
  constructor(private readonly repository: PublicationScopedLmsRepository) {}

  async getPublicCourse(
    publicationId: string, courseId: string, locale: string,
  ): Promise<PublicCourse | null> {
    if (!publicationId || !courseId) return null;
    const course = await this.repository.getCourse(publicationId, courseId);
    return course ? projectPublicCourse(course, publicationId, locale) : null;
  }

  async enrollFree(
    context: AuthenticatedLmsRequest, courseId: string, locale: string,
  ): Promise<EnrollmentOutcome> {
    const member = await authenticatedMember(context);
    if (!member) return { kind: "unauthenticated" };
    if (!courseId) return { kind: "not-found" };
    const course = await this.repository.getCourse(member.publicationId, courseId);
    if (!course) return { kind: "not-found" };
    const existing = await this.repository.getEnrollment(
      member.publicationId, courseId, member.memberId,
    );
    const decision = decideFreeEnrollment(course, existing, member, locale);
    if (decision.kind !== "eligible") return decision;

    // Atomic repository admission is still authoritative for concurrent
    // self-enrolls and revoked/suspended rows. Domain prechecks are not enough.
    const result = await this.repository.insertFreeEnrollmentIfAbsent({
      publicationId: member.publicationId, courseId, memberId: member.memberId,
    });
    if (!boundEnrollment(
      result.enrollment, member.publicationId, courseId, member.memberId,
    )) return { kind: "not-found" };
    if (result.enrollment.status !== "active") return { kind: "reactivation-required" };
    // Callers receive no enrollment or member identifiers.
    return { kind: result.inserted ? "created" : "already-enrolled" };
  }

  async getProtectedLesson(
    context: AuthenticatedLmsRequest,
    courseId: string, lessonId: string, locale: string,
  ): Promise<LessonAccess> {
    const member = await authenticatedMember(context);
    if (!member || !courseId || !lessonId) return { kind: "not-found" };
    const pub = member.publicationId;
    const course = await this.repository.getCourse(pub, courseId);
    if (!course) return { kind: "not-found" };
    const lesson = await this.repository.getLesson(pub, courseId, lessonId);
    if (!lesson) return { kind: "not-found" };
    const enrollment = await this.repository.getEnrollment(pub, courseId, member.memberId);
    return authorizeLesson(course, lesson, enrollment, member, locale);
  }
}
