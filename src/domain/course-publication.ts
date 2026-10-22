import type { Course, Lesson } from "./types.js";

/** Locale-neutral course section. Titles belong to separate localized records. */
export interface CourseSection {
  readonly id: string;
  readonly courseId: string;
  readonly publicationId: string;
  readonly position: number;
}

export type PublicationRejection =
  | "archived-course"
  | "invalid-course"
  | "missing-default-locale"
  | "invalid-translation"
  | "duplicate-translation"
  | "invalid-section"
  | "duplicate-section"
  | "invalid-lesson"
  | "duplicate-lesson"
  | "empty-curriculum"
  | "no-required-lesson"
  | "untranslated-lesson";

export type CoursePublicationDecision =
  | { readonly kind: "ready" }
  | { readonly kind: "invalid"; readonly reason: PublicationRejection };

const reject = (reason: PublicationRejection): CoursePublicationDecision => ({
  kind: "invalid",
  reason,
});

function canonicalLocale(locale: string): boolean {
  if (typeof locale !== "string" || locale.length === 0 || locale.length > 35) return false;
  try {
    const [canonical] = Intl.getCanonicalLocales(locale);
    return canonical === locale;
  } catch {
    return false;
  }
}

/**
 * Validate a proposed publication without mutating records. The host must
 * independently authorize Staff, validate every input and commit changes in a
 * scoped transaction. This is NOT a public request handler or a migration.
 *
 * Only exact published locale variants are served. To avoid advertising a
 * broken published catalog, each published course locale must cover every
 * published lesson. Draft translations may remain incomplete.
 */
export function decideCoursePublication(
  course: Course,
  sections: readonly CourseSection[],
  lessons: readonly Lesson[],
  defaultLocale: string,
): CoursePublicationDecision {
  if (course.status === "archived") return reject("archived-course");
  if (
    !course.id || !course.publicationId ||
    !Number.isSafeInteger(course.curriculumRevision) ||
    course.curriculumRevision < 1
  ) return reject("invalid-course");
  if (!canonicalLocale(defaultLocale)) return reject("missing-default-locale");

  const publishedLocales = new Set<string>();
  const locales = new Set<string>();
  for (const translation of course.translations) {
    if (
      !canonicalLocale(translation.locale) ||
      (translation.status === "published" &&
        (!translation.title.trim() || !translation.slug.trim()))
    ) return reject("invalid-translation");
    if (locales.has(translation.locale)) return reject("duplicate-translation");
    locales.add(translation.locale);
    if (translation.status === "published") publishedLocales.add(translation.locale);
  }
  if (!publishedLocales.has(defaultLocale)) return reject("missing-default-locale");

  const sectionIds = new Set<string>();
  const positions = new Set<number>();
  for (const section of sections) {
    if (
      !section.id ||
      section.courseId !== course.id ||
      section.publicationId !== course.publicationId ||
      !Number.isSafeInteger(section.position) || section.position < 0
    ) return reject("invalid-section");
    if (sectionIds.has(section.id) || positions.has(section.position)) {
      return reject("duplicate-section");
    }
    sectionIds.add(section.id);
    positions.add(section.position);
  }

  const lessonIds = new Set<string>();
  let published = 0;
  let required = 0;
  for (const lesson of lessons) {
    if (
      !lesson.id || lesson.courseId !== course.id ||
      lesson.publicationId !== course.publicationId ||
      !sectionIds.has(lesson.sectionId)
    ) return reject("invalid-lesson");
    if (lessonIds.has(lesson.id)) return reject("duplicate-lesson");
    lessonIds.add(lesson.id);
    if (lesson.status !== "published") continue;
    published += 1;
    if (lesson.required) required += 1;

    const lessonLocales = new Set<string>();
    for (const translation of lesson.translations) {
      if (!canonicalLocale(translation.locale)) return reject("invalid-translation");
      if (lessonLocales.has(translation.locale)) return reject("duplicate-translation");
      lessonLocales.add(translation.locale);
    }
    for (const locale of publishedLocales) {
      const translation = lesson.translations.find((value) => value.locale === locale);
      if (!translation || translation.status !== "published" || !translation.title.trim()) {
        return reject("untranslated-lesson");
      }
    }
  }
  if (published === 0) return reject("empty-curriculum");
  if (required === 0) return reject("no-required-lesson");
  return { kind: "ready" };
}
