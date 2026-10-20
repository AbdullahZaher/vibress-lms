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
