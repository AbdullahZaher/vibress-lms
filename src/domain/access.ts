import type {
  Course,
  CourseTranslation,
  Enrollment,
  Lesson,
  LessonTranslation,
  VerifiedMemberScope,
} from "./types.js";

/** Only intentionally public metadata. No lesson/body/media/member identifiers. */
export interface PublicCourse {
  readonly id: string;
  readonly locale: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly access: "free" | "paid";
}

/** Protected lesson details: only returned following all learner checks. */
export interface AuthorizedLesson {
  readonly id: string;
  readonly courseId: string;
  readonly locale: string;
  readonly title: string;
  readonly bodyRef: string | null;
  readonly mediaRef: string | null;
}

export type LessonAccess =
  | { readonly kind: "allowed"; readonly lesson: AuthorizedLesson }
  | { readonly kind: "not-found" }
  | { readonly kind: "entitlement-required" };

function publishedCourseTranslation(
  course: Course,
  locale: string,
): CourseTranslation | undefined {
  // No implicit language fallback: only published requested-locale variants are visible.
  return course.translations.find(
    (item) =>
      item.locale === locale &&
      item.status === "published" &&
      item.slug.trim().length > 0 &&
      item.title.trim().length > 0,
  );
}

function publishedLessonTranslation(
  lesson: Lesson,
  locale: string,
): LessonTranslation | undefined {
  return lesson.translations.find(
    (item) =>
      item.locale === locale &&
      item.status === "published" &&
      item.title.trim().length > 0,
  );
}

/** The publication ID must originate from host site resolution, NEVER a URL/query. */
export function projectPublicCourse(
  course: Course,
  publicationId: string,
  locale: string,
): PublicCourse | null {
  if (!publicationId || course.publicationId !== publicationId || course.status !== "published") {
    return null;
  }
  const translation = publishedCourseTranslation(course, locale);
  if (!translation) return null;
  return {
    id: course.id,
    locale: translation.locale,
    slug: translation.slug,
    title: translation.title,
    description: translation.description,
    access: course.access,
  };
}

/**
 * Pure domain decision, NOT an authentication boundary. The host MUST first
 * authenticate Member and independently match session.publicationId to the
 * resolved publication. Persistence must use scoped repositories/composite FKs.
 */
export function authorizeLesson(
  course: Course,
  lesson: Lesson,
  enrollment: Enrollment | null,
  member: VerifiedMemberScope,
  locale: string,
): LessonAccess {
  if (
    !member.publicationId ||
    !member.memberId ||
    course.publicationId !== member.publicationId ||
    lesson.publicationId !== course.publicationId ||
    lesson.courseId !== course.id ||
    course.status !== "published" ||
    lesson.status !== "published" ||
    !enrollment ||
    enrollment.publicationId !== member.publicationId ||
    enrollment.courseId !== course.id ||
    enrollment.memberId !== member.memberId ||
    enrollment.status !== "active" ||
    !publishedCourseTranslation(course, locale)
  ) {
    return { kind: "not-found" };
  }

  const translation = publishedLessonTranslation(lesson, locale);
  if (!translation) return { kind: "not-found" };

  // An enrollment does not prove payment. Never accept caller-supplied
  // "paid=true" or trust a billing webhook as an entitlement grant.
  if (course.access === "paid") return { kind: "entitlement-required" };

  return {
    kind: "allowed",
    lesson: {
      id: lesson.id,
      courseId: course.id,
      locale,
      title: translation.title,
      bodyRef: translation.bodyRef,
      mediaRef: translation.mediaRef,
    },
  };
}
