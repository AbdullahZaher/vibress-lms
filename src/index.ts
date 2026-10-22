export { projectPublicCourse, authorizeLesson } from "./domain/access.js";
export type { PublicCourse, AuthorizedLesson, LessonAccess } from "./domain/access.js";
export {
  calculateCourseProgress,
  decideLessonCompletion,
  LmsIntegrityError,
} from "./domain/progress.js";
export type { CourseProgress, CompletionDecision } from "./domain/progress.js";
export type {
  Course,
  CourseTranslation,
  CourseStatus,
  Lesson,
  LessonTranslation,
  Enrollment,
  LessonCompletion,
  VerifiedMemberScope,
} from "./domain/types.js";
export { decideCoursePublication } from "./domain/course-publication.js";
export type {
  CourseSection,
  CoursePublicationDecision,
  PublicationRejection,
} from "./domain/course-publication.js";
export { decideFreeEnrollment } from "./domain/enrollment.js";
export type { FreeEnrollmentDecision } from "./domain/enrollment.js";

export { LmsHostApplication } from "./application/host-operations.js";
export type {
  AuthenticatedLmsRequest, PublicationScopedLmsRepository, EnrollmentOutcome,
} from "./application/host-operations.js";
