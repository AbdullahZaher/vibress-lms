/** Canonical identity is locale-neutral; translations never own enrollment/progress. */
export type PublicationId = string;
export type CourseStatus = "draft" | "published" | "archived";
export type TranslationStatus = "draft" | "published";

export interface CourseTranslation {
  readonly locale: string;
  readonly status: TranslationStatus;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
}

export interface Course {
  readonly id: string;
  readonly publicationId: PublicationId;
  readonly status: CourseStatus;
  /** Paid lessons fail closed until the host's entitlement bridge is available. */
  readonly access: "free" | "paid";
  readonly curriculumRevision: number;
  readonly translations: readonly CourseTranslation[];
}

export interface LessonTranslation {
  readonly locale: string;
  readonly status: TranslationStatus;
  readonly title: string;
  /** These private identifiers are never part of public course projections. */
  readonly bodyRef: string | null;
  readonly mediaRef: string | null;
}

export interface Lesson {
  readonly id: string;
  readonly publicationId: PublicationId;
  readonly courseId: string;
  readonly sectionId: string;
  readonly status: CourseStatus;
  readonly required: boolean;
  readonly translations: readonly LessonTranslation[];
}

export interface Enrollment {
  readonly id: string;
  readonly publicationId: PublicationId;
  readonly courseId: string;
  readonly memberId: string;
  readonly status: "active" | "suspended" | "revoked";
}

export interface LessonCompletion {
  readonly publicationId: PublicationId;
  readonly courseId: string;
  readonly enrollmentId: string;
  readonly lessonId: string;
}

/** MUST be constructed from host-authenticated, publication-matched session context. */
export interface VerifiedMemberScope {
  readonly publicationId: PublicationId;
  readonly memberId: string;
}
