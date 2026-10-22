import {
  authorizeLesson, projectPublicCourse,
  type LessonAccess, type PublicCourse,
} from "../domain/access.js";
import { decideFreeEnrollment } from "../domain/enrollment.js";
import { calculateCourseProgress, decideLessonCompletion, type CourseProgress } from "../domain/progress.js";
import type {
  Course, Enrollment, Lesson, LessonCompletion,
} from "../domain/types.js";

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
  /** Cursor pagination is publication-scoped in the Host repository. Returns
   * at most the requested number of courses in stable canonical-ID order. */
  listCourses?(
    publicationId: string, limit: number, cursor?: string,
  ): Promise<{ readonly items: readonly Course[]; readonly nextCursor?: string }>;
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
  /** Optional until a Host-approved Member progress contract is installed.
   * Each lookup MUST filter by the full Host publication+course+enrollment. */
  listLessons?(publicationId: string, courseId: string): Promise<readonly Lesson[]>;
  listCompletions?(
    publicationId: string, courseId: string, enrollmentId: string,
  ): Promise<readonly LessonCompletion[]>;
  /** Must atomically verify active current Member enrollment, published/free
   * course+lesson, and UNIQUE(pub,course,enrollment,lesson). No caller member
   * or publication IDs may be substituted by the repository implementation. */
  insertLessonCompletionIfAbsent?(input: {
    readonly publicationId: string;
    readonly courseId: string;
    readonly enrollmentId: string;
    readonly lessonId: string;
    readonly memberId: string;
  }): Promise<{ readonly completion: LessonCompletion; readonly inserted: boolean }>;
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

  /**
   * Public catalog projection. Both the Host repository's query and the
   * projection enforce the publication boundary. Drafts, archived courses,
   * unpublished locale variants and private lesson data never cross it.
   */
  async listPublicCourses(
    publicationId: string, locale: string, limit = 12, cursor?: string,
  ): Promise<{ readonly items: readonly PublicCourse[]; readonly nextCursor?: string }> {
    if (!publicationId || !/^[a-zA-Z0-9_-]{1,128}$/.test(publicationId)) {
      return { items: [] };
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
        (cursor !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(cursor))) {
      throw new Error("Invalid course catalog pagination");
    }
    if (!this.repository.listCourses) {
      throw new Error("The Host has not admitted a publication-scoped catalog repository");
    }
    const page = await this.repository.listCourses(publicationId, limit, cursor);
    if (!page || !Array.isArray(page.items) || page.items.length > limit ||
        (page.nextCursor !== undefined &&
          !/^[a-zA-Z0-9_-]{1,128}$/.test(page.nextCursor))) {
      throw new Error("Invalid Host course catalog response");
    }
    const items = page.items.flatMap((row) => {
      const publicCourse = projectPublicCourse(row, publicationId, locale);
      return publicCourse ? [publicCourse] : [];
    });
    return page.nextCursor ? { items, nextCursor: page.nextCursor } : { items };
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

  /** No progress result is returned without the authenticated learner's
   * active enrollment. Paid-course progress remains private until entitlement
   * admission is implemented and independently verified by Host. */
  async getCourseProgress(
    context: AuthenticatedLmsRequest,
    courseId: string,
  ): Promise<CourseProgress | null> {
    const member = await authenticatedMember(context);
    if (!member || !courseId) return null;
    if (!this.repository.listLessons || !this.repository.listCompletions) {
      throw new Error("Member progress repository has not been admitted by Host");
    }
    const course = await this.repository.getCourse(member.publicationId, courseId);
    if (!course || course.status !== "published" ||
        course.access !== "free") return null;
    const enrollment = await this.repository.getEnrollment(
      member.publicationId, courseId, member.memberId,
    );
    if (!enrollment || enrollment.status !== "active" ||
        enrollment.publicationId !== member.publicationId ||
        enrollment.memberId !== member.memberId ||
        enrollment.courseId !== courseId) return null;
    const [lessons, completions] = await Promise.all([
      this.repository.listLessons(member.publicationId, courseId),
      this.repository.listCompletions(member.publicationId, courseId, enrollment.id),
    ]);
    if (lessons.length > 1000 || completions.length > 1000) {
      throw new Error("Course progress bounds exceeded");
    }
    return calculateCourseProgress(course, enrollment, lessons, completions, member);
  }

  /** Completes a lesson only after Host member binding and domain admission.
   * This is a decision/orchestration port, NOT a substitute for atomic DB
   * constraints and live authorization inside the repository transaction. */
  async completeLesson(
    context: AuthenticatedLmsRequest,
    courseId: string, lessonId: string, locale: string,
  ): Promise<{ readonly kind: "completed" | "already-completed" | "not-authorized" }> {
    const member = await authenticatedMember(context);
    if (!member || !courseId || !lessonId) return { kind: "not-authorized" };
    if (!this.repository.listCompletions ||
        !this.repository.insertLessonCompletionIfAbsent) {
      throw new Error("Member completion repository has not been admitted by Host");
    }
    const pub = member.publicationId;
    const course = await this.repository.getCourse(pub, courseId);
    const lesson = await this.repository.getLesson(pub, courseId, lessonId);
    const enrollment = await this.repository.getEnrollment(pub, courseId, member.memberId);
    if (!course || !lesson || !enrollment) return { kind: "not-authorized" };
    const existing = await this.repository.listCompletions(pub, courseId, enrollment.id);
    if (existing.length > 1000) throw new Error("Lesson completion bounds exceeded");
    const admission = decideLessonCompletion(
      course, lesson, enrollment, member, locale, existing,
    );
    if (admission.kind !== "eligible") return admission;
    const result = await this.repository.insertLessonCompletionIfAbsent({
      publicationId: pub, courseId, enrollmentId: enrollment.id,
      lessonId, memberId: member.memberId,
    });
    if (result.completion.publicationId !== pub ||
        result.completion.courseId !== courseId ||
        result.completion.enrollmentId !== enrollment.id ||
        result.completion.lessonId !== lessonId) {
      throw new Error("Host returned an unauthorized lesson completion");
    }
    return { kind: result.inserted ? "completed" : "already-completed" };
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
