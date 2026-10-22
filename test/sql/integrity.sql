-- Executed only in ephemeral vibress_lms_test after candidate 0001.
-- PostgreSQL must enforce these constraints regardless of application code.
CREATE FUNCTION pg_temp.expect_error(statement text, expected_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $function$
DECLARE received text;
BEGIN
  BEGIN
    EXECUTE statement;
    RAISE EXCEPTION 'unexpected successful invalid SQL';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS received = RETURNED_SQLSTATE;
    IF received <> expected_sqlstate THEN
      RAISE EXCEPTION 'Expected SQLSTATE %, received % for %',
        expected_sqlstate, received, statement;
    END IF;
  END;
END;
$function$;

INSERT INTO vibress_lms.courses(publication_id,id,status,access,default_locale)
VALUES
 ('pub-a','course-a','published','free','en'),
 ('pub-a','course-2','draft','free','en'),
 ('pub-b','course-b','published','free','ar');

INSERT INTO vibress_lms.course_translations
 (publication_id,course_id,locale,status,slug,title)
VALUES
 ('pub-a','course-a','en','published','course','Course'),
 ('pub-a','course-a','ar','published','dawra','دورة'),
 ('pub-a','course-2','en','draft','other-course','Other'),
 ('pub-b','course-b','ar','published','course','دورة');

INSERT INTO vibress_lms.sections(publication_id,course_id,id,position)
VALUES ('pub-a','course-a','section-1',0),('pub-a','course-2','section-2',0);

INSERT INTO vibress_lms.section_translations
 (publication_id,course_id,section_id,locale,title)
VALUES ('pub-a','course-a','section-1','en','Section');

INSERT INTO vibress_lms.lessons(publication_id,course_id,id,section_id,position,status)
VALUES ('pub-a','course-a','lesson-1','section-1',0,'published'),
       ('pub-a','course-2','lesson-2','section-2',0,'draft');

INSERT INTO vibress_lms.lesson_translations
 (publication_id,course_id,lesson_id,locale,status,title,body_ref,media_ref)
VALUES ('pub-a','course-a','lesson-1','en','published','Lesson','body-en','media-en'),
       ('pub-a','course-a','lesson-1','ar','published','درس','body-ar','media-ar');

INSERT INTO vibress_lms.enrollments
 (publication_id,course_id,id,member_id,status)
VALUES ('pub-a','course-a','enroll-1','member-a','active');

INSERT INTO vibress_lms.lesson_progress
 (publication_id,course_id,enrollment_id,lesson_id)
VALUES ('pub-a','course-a','enroll-1','lesson-1');

-- A different publication cannot use course-a.
SELECT pg_temp.expect_error(
 $q$INSERT INTO vibress_lms.sections(publication_id,course_id,id,position)
 VALUES ('pub-b','course-a','foreign-section',0)$q$, '23503');
-- A different course in the SAME publication cannot borrow a section.
SELECT pg_temp.expect_error(
 $q$INSERT INTO vibress_lms.lessons(publication_id,course_id,id,section_id,position)
 VALUES ('pub-a','course-2','foreign-lesson','section-1',0)$q$, '23503');
-- A different course cannot borrow a lesson translation or locale.
SELECT pg_temp.expect_error(
 $q$INSERT INTO vibress_lms.lesson_translations
 (publication_id,course_id,lesson_id,locale,title)
 VALUES ('pub-a','course-2','lesson-1','en','Foreign')$q$, '23503');
SELECT pg_temp.expect_error(
 $q$INSERT INTO vibress_lms.lesson_translations
 (publication_id,course_id,lesson_id,locale,title)
 VALUES ('pub-a','course-a','lesson-1','fr','Unknown locale')$q$, '23503');
-- Course slug uniqueness is publication + locale scoped, including same site different courses.
SELECT pg_temp.expect_error(
 $q$INSERT INTO vibress_lms.course_translations
 (publication_id,course_id,locale,status,slug,title)
 VALUES ('pub-a','course-2','ar','draft','dawra','Duplicate')$q$, '23505');
-- Enrollment uniqueness handles repeated concurrent enrollment attempts.
SELECT pg_temp.expect_error(
 $q$INSERT INTO vibress_lms.enrollments(publication_id,course_id,id,member_id)
 VALUES ('pub-a','course-a','enroll-2','member-a')$q$, '23505');
-- Cross-course progress cannot reference a lesson or enrollment from another course.
SELECT pg_temp.expect_error(
 $q$INSERT INTO vibress_lms.lesson_progress
 (publication_id,course_id,enrollment_id,lesson_id)
 VALUES ('pub-a','course-2','enroll-1','lesson-2')$q$, '23503');
SELECT pg_temp.expect_error(
 $q$INSERT INTO vibress_lms.lesson_progress
 (publication_id,course_id,enrollment_id,lesson_id)
 VALUES ('pub-b','course-a','enroll-1','lesson-1')$q$, '23503');
-- Progress is idempotently keyed even when a caller repeats a write.
SELECT pg_temp.expect_error(
 $q$INSERT INTO vibress_lms.lesson_progress
 (publication_id,course_id,enrollment_id,lesson_id)
 VALUES ('pub-a','course-a','enroll-1','lesson-1')$q$, '23505');
-- Invalid publication/status inputs and duplicate section positions are rejected.
SELECT pg_temp.expect_error(
 $q$INSERT INTO vibress_lms.courses(publication_id,id,default_locale)
 VALUES ('missing-publication','bad','en')$q$, '23503');
SELECT pg_temp.expect_error(
 $q$INSERT INTO vibress_lms.courses(publication_id,id,status,default_locale)
 VALUES ('pub-a','bad','deleted','en')$q$, '23514');
SELECT pg_temp.expect_error(
 $q$INSERT INTO vibress_lms.sections(publication_id,course_id,id,position)
 VALUES ('pub-a','course-a','duplicate-position',0)$q$, '23505');
-- Publishing cannot silently delete valuable learning data.
SELECT pg_temp.expect_error(
 $q$DELETE FROM public.publications WHERE id='pub-a'$q$, '23503');

DO $check$
BEGIN
 IF (SELECT count(*) FROM vibress_lms.courses) <> 3 THEN RAISE EXCEPTION 'course count mismatch'; END IF;
 IF (SELECT count(*) FROM vibress_lms.lesson_progress) <> 1 THEN RAISE EXCEPTION 'progress changed'; END IF;
 IF (SELECT count(*) FROM vibress_lms.lesson_translations
     WHERE publication_id='pub-a' AND course_id='course-a') <> 2 THEN
   RAISE EXCEPTION 'localized protected references missing';
 END IF;
END
$check$;
