import { authorizeLesson } from "./access.js";
import type {
  Course,
  Enrollment,
  Lesson,
  LessonCompletion,
  VerifiedMemberScope,
} from "./types.js";

export class LmsIntegrityError extends Error {
  constructor() {
    super("Inconsistent course-scoped LMS records");
    this.name = "LmsIntegrityError";
  }
}

export interface CourseProgress {
  readonly required: number;
  readonly completed: number;
  readonly percent: number;
  readonly isComplete: boolean;
  readonly curriculumRevision: number;
}

/**
 * Read-model calculation only. The caller must fetch records through the
 * host-mediated, publication-scoped repositories, never via unbounded SQL.
 * Progress uses canonical lesson IDs, not translated slugs or locale.
 */
export function calculateCourseProgress(
  course: Course,
  enrollment: Enrollment,
  lessons: readonly Lesson[],
  completions: readonly LessonCompletion[],
  member: VerifiedMemberScope,
): CourseProgress | null {
  if (
    !member.publicationId || !member.memberId ||
    course.publicationId !== member.publicationId ||
    enrollment.publicationId !== member.publicationId ||
    enrollment.courseId !== course.id ||
    enrollment.memberId !== member.memberId ||
    enrollment.status !== "active"
  ) return null;

  const lessonIds = new Set<string>();
  const required = new Set<string>();
  for (const lesson of lessons) {
    if (
      lesson.publicationId !== course.publicationId ||
      lesson.courseId !== course.id ||
      lessonIds.has(lesson.id)
    ) throw new LmsIntegrityError();
    lessonIds.add(lesson.id);
    if (lesson.required && lesson.status === "published") required.add(lesson.id);
  }

  const completed = new Set<string>();
  for (const row of completions) {
    if (
      row.publicationId !== course.publicationId ||
      row.courseId !== course.id ||
      row.enrollmentId !== enrollment.id
    ) throw new LmsIntegrityError();
    if (required.has(row.lessonId)) completed.add(row.lessonId);
  }

  const done = completed.size;
  const total = required.size;
  return {
    required: total,
    completed: done,
    percent: total === 0 ? 0 : Math.floor((done / total) * 100),
    isComplete: total > 0 && done === total,
    curriculumRevision: course.curriculumRevision,
  };
}

export type CompletionDecision =
  | { readonly kind: "not-authorized" }
  | { readonly kind: "already-completed" }
  | { readonly kind: "eligible" };

/**
 * Admission check ONLY: a transaction + UNIQUE(pub,course,enrollment,lesson)
 * must enforce idempotency under concurrent requests. This function does not write.
 */
export function decideLessonCompletion(
  course: Course,
  lesson: Lesson,
  enrollment: Enrollment | null,
  member: VerifiedMemberScope,
  locale: string,
  existing: readonly LessonCompletion[],
): CompletionDecision {
  if (authorizeLesson(course, lesson, enrollment, member, locale).kind !== "allowed") {
    return { kind: "not-authorized" };
  }
  if (!enrollment) return { kind: "not-authorized" };
  for (const row of existing) {
    if (
      row.publicationId !== course.publicationId ||
      row.courseId !== course.id ||
      row.enrollmentId !== enrollment.id
    ) throw new LmsIntegrityError();
    if (row.lessonId === lesson.id) return { kind: "already-completed" };
  }
  return { kind: "eligible" };
}
