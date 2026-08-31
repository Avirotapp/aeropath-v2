reset role;

begin;

-- =========================================================
-- AeroPath V2
-- Migration 024B1 — Ground School UI Compatibility + Staff Test Authoring
--
-- Completes the M024B session-based Ground School model by:
--   • exposing a class detail API that no longer depends on the legacy
--     single class-level instructor/date model
--   • allowing approved Instructors, Admins and Safety Managers to
--     author/manage/assign Ground School tests
--   • preserving student privacy and all existing immutable attempts
-- =========================================================

create or replace function public.get_ground_class_detail_v2(
  target_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  class_row public.ground_classes%rowtype;
  staff_view boolean;
  student_view boolean;
begin
  if not public.is_approved_user() then
    raise exception 'Approved AeroPath account required.';
  end if;

  select * into class_row
  from public.ground_classes
  where id = target_class_id;

  if not found then
    raise exception 'Ground class not found.';
  end if;

  staff_view := public.is_admin() or public.is_instructor();
  student_view := public.is_student()
    and class_row.status <> 'DRAFT'
    and exists (
      select 1
      from public.ground_class_enrolments e
      where e.ground_class_id = target_class_id
        and e.student_id = auth.uid()
        and e.status = 'ENROLLED'
    );

  if not (staff_view or student_view) then
    raise exception 'You are not authorised to view this ground class.';
  end if;

  return jsonb_build_object(
    'class', (
      select jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'subject', c.subject,
        'description', c.description,
        'programme_id', c.programme_id,
        'programme_name', tp.name,
        'capacity', c.capacity,
        'minimum_required_sessions', c.minimum_required_sessions,
        'status', c.status,
        'can_manage', staff_view
      )
      from public.ground_classes c
      left join public.training_programmes tp on tp.id = c.programme_id
      where c.id = target_class_id
    ),
    'students', case when staff_view then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'student_id', e.student_id,
        'student_name', coalesce(p.display_name, p.full_name, p.email, 'Student'),
        'student_email', p.email,
        'enrolment_status', e.status
      ) order by lower(coalesce(p.display_name, p.full_name, p.email))), '[]'::jsonb)
      from public.ground_class_enrolments e
      join public.profiles p on p.id = e.student_id
      where e.ground_class_id = target_class_id
        and e.status = 'ENROLLED'
    ) else '[]'::jsonb end,
    'materials', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'material_id', m.id,
        'file_id', f.id,
        'file_name', f.file_name,
        'display_label', m.display_label,
        'description', f.description,
        'mime_type', f.mime_type,
        'file_size', f.file_size,
        'required', m.is_required,
        'storage_path', f.storage_path
      ) order by m.sort_order, lower(coalesce(m.display_label, f.file_name))), '[]'::jsonb)
      from public.ground_class_materials m
      join public.files f on f.id = m.file_id
      where m.ground_class_id = target_class_id
        and not f.is_deleted
    ),
    'tests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'assignment_id', a.id,
        'test_id', t.id,
        'title', t.title,
        'description', t.description,
        'required', a.required,
        'requires_pass', a.requires_pass,
        'availability_mode', a.availability_mode,
        'available_from', a.available_from,
        'due_at', a.due_at,
        'pass_mark_percent', t.pass_mark_percent,
        'time_limit_minutes', t.time_limit_minutes
      ) order by lower(t.title)), '[]'::jsonb)
      from public.knowledge_test_assignments a
      join public.knowledge_tests t on t.id = a.test_id
      where a.ground_class_id = target_class_id
        and a.active
        and t.status = 'PUBLISHED'
    ),
    'sessions', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at), '[]'::jsonb)
      from public.list_ground_sessions_v1(null, null, target_class_id) x
    )
  );
end;
$$;

revoke all on function public.get_ground_class_detail_v2(uuid) from public;
grant execute on function public.get_ground_class_detail_v2(uuid) to authenticated;
create or replace function public.admin_create_knowledge_test_v1(
  test_title text,
  test_description text,
  test_programme_id uuid,
  test_pass_mark_percent numeric,
  test_time_limit_minutes integer,
  test_max_attempts integer,
  randomize_question_order boolean,
  randomize_answer_order boolean,
  release_results_immediately boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor, Admin or Safety Manager access required.';
  end if;

  if test_title is null or btrim(test_title) = '' then
    raise exception 'Test title is required.';
  end if;

  if test_pass_mark_percent is null
     or test_pass_mark_percent < 0
     or test_pass_mark_percent > 100 then
    raise exception 'Pass mark must be between 0 and 100 percent.';
  end if;

  if test_time_limit_minutes is not null and test_time_limit_minutes <= 0 then
    raise exception 'Time limit must be greater than zero.';
  end if;

  if test_max_attempts is not null and test_max_attempts <= 0 then
    raise exception 'Maximum attempts must be greater than zero.';
  end if;

  if test_programme_id is not null
     and not exists (
       select 1 from public.training_programmes p
       where p.id = test_programme_id and p.active
     ) then
    raise exception 'Training programme not found or inactive.';
  end if;

  insert into public.knowledge_tests (
    programme_id,
    title,
    description,
    pass_mark_percent,
    time_limit_minutes,
    max_attempts,
    randomize_questions,
    randomize_answers,
    release_results_immediately,
    created_by
  ) values (
    test_programme_id,
    btrim(test_title),
    nullif(btrim(test_description), ''),
    test_pass_mark_percent,
    test_time_limit_minutes,
    test_max_attempts,
    coalesce(randomize_question_order, false),
    coalesce(randomize_answer_order, false),
    coalesce(release_results_immediately, true),
    auth.uid()
  ) returning id into new_id;

  perform public.write_audit_log(
    'KNOWLEDGE_TEST_CREATED',
    'knowledge_test',
    new_id,
    null,
    jsonb_build_object('title', btrim(test_title), 'status', 'DRAFT'),
    '{}'::jsonb
  );

  return new_id;
end;
$$;

create or replace function public.admin_update_knowledge_test_v1(
  target_test_id uuid,
  test_title text,
  test_description text,
  test_programme_id uuid,
  test_pass_mark_percent numeric,
  test_time_limit_minutes integer,
  test_max_attempts integer,
  randomize_question_order boolean,
  randomize_answer_order boolean,
  release_results_immediately boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.knowledge_tests%rowtype;
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor, Admin or Safety Manager access required.';
  end if;

  select * into old_row
  from public.knowledge_tests
  where id = target_test_id
  for update;

  if not found then
    raise exception 'Test not found.';
  end if;

  if old_row.status <> 'DRAFT' then
    raise exception 'Only draft tests can be edited.';
  end if;

  if test_title is null or btrim(test_title) = '' then
    raise exception 'Test title is required.';
  end if;

  if test_pass_mark_percent is null
     or test_pass_mark_percent < 0
     or test_pass_mark_percent > 100 then
    raise exception 'Pass mark must be between 0 and 100 percent.';
  end if;

  if test_time_limit_minutes is not null and test_time_limit_minutes <= 0 then
    raise exception 'Time limit must be greater than zero.';
  end if;

  if test_max_attempts is not null and test_max_attempts <= 0 then
    raise exception 'Maximum attempts must be greater than zero.';
  end if;

  update public.knowledge_tests
  set programme_id = test_programme_id,
      title = btrim(test_title),
      description = nullif(btrim(test_description), ''),
      pass_mark_percent = test_pass_mark_percent,
      time_limit_minutes = test_time_limit_minutes,
      max_attempts = test_max_attempts,
      randomize_questions = coalesce(randomize_question_order, false),
      randomize_answers = coalesce(randomize_answer_order, false),
      release_results_immediately = coalesce(release_results_immediately, true)
  where id = target_test_id;

  perform public.write_audit_log(
    'KNOWLEDGE_TEST_UPDATED',
    'knowledge_test',
    target_test_id,
    to_jsonb(old_row),
    jsonb_build_object(
      'title', btrim(test_title),
      'programme_id', test_programme_id,
      'pass_mark_percent', test_pass_mark_percent,
      'time_limit_minutes', test_time_limit_minutes,
      'max_attempts', test_max_attempts,
      'randomize_questions', coalesce(randomize_question_order, false),
      'randomize_answers', coalesce(randomize_answer_order, false),
      'release_results_immediately', coalesce(release_results_immediately, true)
    ),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.admin_save_knowledge_test_question_v1(
  target_test_id uuid,
  target_question_id uuid,
  question_position integer,
  question_type_value text,
  question_prompt text,
  question_points numeric,
  question_options jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  test_row public.knowledge_tests%rowtype;
  normalized_type text := upper(btrim(question_type_value));
  question_id_value uuid;
  option_item jsonb;
  option_count integer;
  correct_count integer;
  option_position integer := 0;
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor, Admin or Safety Manager access required.';
  end if;

  select * into test_row
  from public.knowledge_tests
  where id = target_test_id
  for update;

  if not found then
    raise exception 'Test not found.';
  end if;

  if test_row.status <> 'DRAFT' then
    raise exception 'Only draft tests can be edited.';
  end if;

  if question_position is null or question_position <= 0 then
    raise exception 'Question position must be greater than zero.';
  end if;

  if normalized_type not in ('SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'SHORT_TEXT') then
    raise exception 'Invalid question type.';
  end if;

  if question_prompt is null or btrim(question_prompt) = '' then
    raise exception 'Question text is required.';
  end if;

  if question_points is null or question_points <= 0 then
    raise exception 'Question points must be greater than zero.';
  end if;

  if normalized_type = 'SHORT_TEXT' then
    if question_options is not null
       and jsonb_typeof(question_options) = 'array'
       and jsonb_array_length(question_options) > 0 then
      raise exception 'Short written questions cannot have answer options.';
    end if;
  else
    if question_options is null or jsonb_typeof(question_options) <> 'array' then
      raise exception 'Objective questions require answer options.';
    end if;

    option_count := jsonb_array_length(question_options);
    select count(*)::integer into correct_count
    from jsonb_array_elements(question_options) x
    where coalesce((x->>'is_correct')::boolean, false);

    if normalized_type = 'TRUE_FALSE' and option_count <> 2 then
      raise exception 'True/False questions must contain exactly two options.';
    end if;

    if normalized_type in ('SINGLE_CHOICE', 'TRUE_FALSE') and correct_count <> 1 then
      raise exception 'Single-answer questions must contain exactly one correct option.';
    end if;

    if normalized_type = 'MULTI_CHOICE' and (option_count < 2 or correct_count < 1) then
      raise exception 'Multiple-answer questions require at least two options and at least one correct option.';
    end if;

    if normalized_type = 'SINGLE_CHOICE' and option_count < 2 then
      raise exception 'Single-choice questions require at least two options.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(question_options) x
      where nullif(btrim(x->>'label'), '') is null
    ) then
      raise exception 'Every answer option must have text.';
    end if;
  end if;

  if target_question_id is null then
    insert into public.knowledge_test_questions (
      test_id,
      position,
      question_type,
      prompt,
      points
    ) values (
      target_test_id,
      question_position,
      normalized_type,
      btrim(question_prompt),
      question_points
    ) returning id into question_id_value;
  else
    if not exists (
      select 1 from public.knowledge_test_questions q
      where q.id = target_question_id
        and q.test_id = target_test_id
    ) then
      raise exception 'Question not found in this test.';
    end if;

    update public.knowledge_test_questions
    set position = question_position,
        question_type = normalized_type,
        prompt = btrim(question_prompt),
        points = question_points
    where id = target_question_id;

    question_id_value := target_question_id;
    delete from public.knowledge_test_options where question_id = question_id_value;
  end if;

  if normalized_type <> 'SHORT_TEXT' then
    for option_item in
      select value from jsonb_array_elements(question_options)
    loop
      option_position := option_position + 1;
      insert into public.knowledge_test_options (
        question_id,
        position,
        option_text,
        is_correct
      ) values (
        question_id_value,
        option_position,
        btrim(option_item->>'label'),
        coalesce((option_item->>'is_correct')::boolean, false)
      );
    end loop;
  end if;

  perform public.write_audit_log(
    'KNOWLEDGE_TEST_QUESTION_SAVED',
    'knowledge_test_question',
    question_id_value,
    null,
    jsonb_build_object(
      'test_id', target_test_id,
      'position', question_position,
      'question_type', normalized_type,
      'points', question_points
    ),
    '{}'::jsonb
  );

  return question_id_value;
end;
$$;

create or replace function public.admin_delete_knowledge_test_question_v1(
  target_question_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  question_row public.knowledge_test_questions%rowtype;
  test_status text;
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor, Admin or Safety Manager access required.';
  end if;

  select q.*
  into question_row
  from public.knowledge_test_questions q
  where q.id = target_question_id
  for update;

  if not found then
    raise exception 'Question not found.';
  end if;

  select t.status
  into test_status
  from public.knowledge_tests t
  where t.id = question_row.test_id;

  if test_status <> 'DRAFT' then
    raise exception 'Only draft tests can be edited.';
  end if;

  delete from public.knowledge_test_questions
  where id = target_question_id;

  perform public.write_audit_log(
    'KNOWLEDGE_TEST_QUESTION_DELETED',
    'knowledge_test_question',
    target_question_id,
    to_jsonb(question_row),
    null,
    '{}'::jsonb
  );
end;
$$;

create or replace function public.admin_publish_knowledge_test_v1(
  target_test_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  test_row public.knowledge_tests%rowtype;
  question_count integer;
  invalid_question_count integer;
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor, Admin or Safety Manager access required.';
  end if;

  select * into test_row
  from public.knowledge_tests
  where id = target_test_id
  for update;

  if not found then
    raise exception 'Test not found.';
  end if;

  if test_row.status <> 'DRAFT' then
    raise exception 'Only draft tests can be published.';
  end if;

  select count(*)::integer into question_count
  from public.knowledge_test_questions q
  where q.test_id = target_test_id;

  if question_count = 0 then
    raise exception 'Add at least one question before publishing the test.';
  end if;

  select count(*)::integer into invalid_question_count
  from public.knowledge_test_questions q
  where q.test_id = target_test_id
    and (
      (q.question_type = 'SHORT_TEXT' and exists (
        select 1 from public.knowledge_test_options o where o.question_id = q.id
      ))
      or
      (q.question_type = 'TRUE_FALSE' and (
        (select count(*) from public.knowledge_test_options o where o.question_id = q.id) <> 2
        or (select count(*) from public.knowledge_test_options o where o.question_id = q.id and o.is_correct) <> 1
      ))
      or
      (q.question_type = 'SINGLE_CHOICE' and (
        (select count(*) from public.knowledge_test_options o where o.question_id = q.id) < 2
        or (select count(*) from public.knowledge_test_options o where o.question_id = q.id and o.is_correct) <> 1
      ))
      or
      (q.question_type = 'MULTI_CHOICE' and (
        (select count(*) from public.knowledge_test_options o where o.question_id = q.id) < 2
        or (select count(*) from public.knowledge_test_options o where o.question_id = q.id and o.is_correct) < 1
      ))
    );

  if invalid_question_count > 0 then
    raise exception 'One or more questions are incomplete or invalid.';
  end if;

  update public.knowledge_tests
  set status = 'PUBLISHED',
      published_at = now(),
      published_by = auth.uid()
  where id = target_test_id;

  perform public.write_audit_log(
    'KNOWLEDGE_TEST_PUBLISHED',
    'knowledge_test',
    target_test_id,
    jsonb_build_object('status', 'DRAFT'),
    jsonb_build_object('status', 'PUBLISHED', 'published_at', now()),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.admin_archive_knowledge_test_v1(
  target_test_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.knowledge_tests%rowtype;
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor, Admin or Safety Manager access required.';
  end if;

  select * into old_row
  from public.knowledge_tests
  where id = target_test_id
  for update;

  if not found then
    raise exception 'Test not found.';
  end if;

  if old_row.status = 'ARCHIVED' then
    raise exception 'Test is already archived.';
  end if;

  update public.knowledge_tests
  set status = 'ARCHIVED',
      archived_at = now(),
      archived_by = auth.uid()
  where id = target_test_id;

  perform public.write_audit_log(
    'KNOWLEDGE_TEST_ARCHIVED',
    'knowledge_test',
    target_test_id,
    to_jsonb(old_row),
    jsonb_build_object('status', 'ARCHIVED', 'archived_at', now()),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.admin_duplicate_knowledge_test_v1(
  source_test_id uuid,
  duplicate_title text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row public.knowledge_tests%rowtype;
  new_test_id uuid;
  q record;
  new_question_id uuid;
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor, Admin or Safety Manager access required.';
  end if;

  select * into source_row
  from public.knowledge_tests
  where id = source_test_id;

  if not found then
    raise exception 'Source test not found.';
  end if;

  if duplicate_title is null or btrim(duplicate_title) = '' then
    raise exception 'Duplicate test title is required.';
  end if;

  insert into public.knowledge_tests (
    programme_id,
    title,
    description,
    status,
    pass_mark_percent,
    time_limit_minutes,
    max_attempts,
    randomize_questions,
    randomize_answers,
    release_results_immediately,
    created_by
  ) values (
    source_row.programme_id,
    btrim(duplicate_title),
    source_row.description,
    'DRAFT',
    source_row.pass_mark_percent,
    source_row.time_limit_minutes,
    source_row.max_attempts,
    source_row.randomize_questions,
    source_row.randomize_answers,
    source_row.release_results_immediately,
    auth.uid()
  ) returning id into new_test_id;

  for q in
    select *
    from public.knowledge_test_questions
    where test_id = source_test_id
    order by position
  loop
    insert into public.knowledge_test_questions (
      test_id,
      position,
      question_type,
      prompt,
      points
    ) values (
      new_test_id,
      q.position,
      q.question_type,
      q.prompt,
      q.points
    ) returning id into new_question_id;

    insert into public.knowledge_test_options (
      question_id,
      position,
      option_text,
      is_correct
    )
    select
      new_question_id,
      o.position,
      o.option_text,
      o.is_correct
    from public.knowledge_test_options o
    where o.question_id = q.id
    order by o.position;
  end loop;

  perform public.write_audit_log(
    'KNOWLEDGE_TEST_DUPLICATED',
    'knowledge_test',
    new_test_id,
    null,
    jsonb_build_object('source_test_id', source_test_id, 'title', btrim(duplicate_title)),
    '{}'::jsonb
  );

  return new_test_id;
end;
$$;

create or replace function public.admin_assign_knowledge_test_v1(
  target_test_id uuid,
  target_type text,
  target_ids uuid[],
  assignment_required boolean,
  assignment_requires_pass boolean,
  assignment_availability_mode text,
  assignment_available_from timestamptz,
  assignment_due_at timestamptz,
  assignment_max_attempts integer
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  test_row public.knowledge_tests%rowtype;
  normalized_target text := upper(btrim(target_type));
  normalized_mode text := upper(btrim(assignment_availability_mode));
  target_id_value uuid;
  new_assignment_id uuid;
  assignment_ids uuid[] := '{}'::uuid[];
  class_row public.ground_classes%rowtype;
  resolved_available_from timestamptz;
  resolved_due_at timestamptz;
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor, Admin or Safety Manager access required.';
  end if;

  select * into test_row
  from public.knowledge_tests
  where id = target_test_id;

  if not found then
    raise exception 'Test not found.';
  end if;

  if test_row.status <> 'PUBLISHED' then
    raise exception 'Only published tests can be assigned.';
  end if;

  if normalized_target not in ('STUDENT', 'PROGRAMME', 'CLASS') then
    raise exception 'Target type must be STUDENT, PROGRAMME, or CLASS.';
  end if;

  if target_ids is null or cardinality(target_ids) = 0 then
    raise exception 'Select at least one assignment target.';
  end if;

  if normalized_target in ('PROGRAMME', 'CLASS') and cardinality(target_ids) <> 1 then
    raise exception 'Programme and class assignments accept one target at a time.';
  end if;

  if normalized_mode not in ('IMMEDIATE', 'SCHEDULED', 'BEFORE_CLASS', 'AFTER_CLASS') then
    raise exception 'Invalid availability mode.';
  end if;

  if normalized_mode = 'SCHEDULED' and assignment_available_from is null then
    raise exception 'Scheduled availability requires an available-from time.';
  end if;

  if normalized_mode in ('BEFORE_CLASS', 'AFTER_CLASS') and normalized_target <> 'CLASS' then
    raise exception 'Before/after class availability can only be used with a class assignment.';
  end if;

  if assignment_max_attempts is not null and assignment_max_attempts <= 0 then
    raise exception 'Maximum attempts must be greater than zero.';
  end if;

  foreach target_id_value in array target_ids
  loop
    resolved_available_from := assignment_available_from;
    resolved_due_at := assignment_due_at;

    if normalized_target = 'STUDENT' then
      if not exists (
        select 1
        from public.profiles p
        join public.user_roles ur on ur.user_id = p.id
        where p.id = target_id_value
          and p.account_status = 'APPROVED'::public.account_status
          and ur.role = 'STUDENT'::public.app_role
      ) then
        raise exception 'Selected user is not an approved Student.';
      end if;

      insert into public.knowledge_test_assignments (
        test_id,
        student_id,
        required,
        requires_pass,
        availability_mode,
        available_from,
        due_at,
        max_attempts_override,
        assigned_by
      ) values (
        target_test_id,
        target_id_value,
        coalesce(assignment_required, true),
        coalesce(assignment_requires_pass, false),
        normalized_mode,
        resolved_available_from,
        resolved_due_at,
        assignment_max_attempts,
        auth.uid()
      ) returning id into new_assignment_id;

      perform public.create_notification(
        target_id_value,
        'KNOWLEDGE_TEST_ASSIGNED',
        'Test assigned',
        test_row.title || ' has been assigned to you.'
      );

    elsif normalized_target = 'PROGRAMME' then
      if not exists (
        select 1 from public.training_programmes p
        where p.id = target_id_value and p.active
      ) then
        raise exception 'Training programme not found or inactive.';
      end if;

      insert into public.knowledge_test_assignments (
        test_id,
        programme_id,
        required,
        requires_pass,
        availability_mode,
        available_from,
        due_at,
        max_attempts_override,
        assigned_by
      ) values (
        target_test_id,
        target_id_value,
        coalesce(assignment_required, true),
        coalesce(assignment_requires_pass, false),
        normalized_mode,
        resolved_available_from,
        resolved_due_at,
        assignment_max_attempts,
        auth.uid()
      ) returning id into new_assignment_id;

      perform public.create_notification(
        spa.student_id,
        'KNOWLEDGE_TEST_ASSIGNED',
        'Test assigned',
        test_row.title || ' has been assigned to your training programme.'
      )
      from public.student_programme_assignments spa
      join public.profiles sp on sp.id = spa.student_id
      where spa.programme_id = target_id_value
        and spa.active
        and sp.account_status = 'APPROVED'::public.account_status;

    else
      select * into class_row
      from public.ground_classes
      where id = target_id_value;

      if not found then
        raise exception 'Ground class not found.';
      end if;

      if normalized_mode = 'AFTER_CLASS' then
        resolved_available_from := class_row.ends_at;
      elsif normalized_mode = 'BEFORE_CLASS' then
        resolved_available_from := coalesce(assignment_available_from, now());
        resolved_due_at := coalesce(assignment_due_at, class_row.starts_at);
      end if;

      insert into public.knowledge_test_assignments (
        test_id,
        ground_class_id,
        required,
        requires_pass,
        availability_mode,
        available_from,
        due_at,
        max_attempts_override,
        assigned_by
      ) values (
        target_test_id,
        target_id_value,
        coalesce(assignment_required, true),
        coalesce(assignment_requires_pass, false),
        normalized_mode,
        resolved_available_from,
        resolved_due_at,
        assignment_max_attempts,
        auth.uid()
      ) returning id into new_assignment_id;

      if class_row.status = 'SCHEDULED' then
        perform public.create_notification(
          e.student_id,
          'KNOWLEDGE_TEST_ASSIGNED',
          'Test assigned',
          test_row.title || ' has been attached to ' || class_row.title || '.'
        )
        from public.ground_class_enrolments e
        where e.ground_class_id = class_row.id
          and e.status = 'ENROLLED';
      end if;
    end if;

    assignment_ids := array_append(assignment_ids, new_assignment_id);

    perform public.write_audit_log(
      'KNOWLEDGE_TEST_ASSIGNED',
      'knowledge_test_assignment',
      new_assignment_id,
      null,
      jsonb_build_object(
        'test_id', target_test_id,
        'target_type', normalized_target,
        'target_id', target_id_value,
        'required', coalesce(assignment_required, true),
        'requires_pass', coalesce(assignment_requires_pass, false),
        'availability_mode', normalized_mode,
        'available_from', resolved_available_from,
        'due_at', resolved_due_at,
        'max_attempts_override', assignment_max_attempts
      ),
      '{}'::jsonb
    );
  end loop;

  return assignment_ids;
end;
$$;

create or replace function public.admin_deactivate_knowledge_test_assignment_v1(
  target_assignment_id uuid,
  reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.knowledge_test_assignments%rowtype;
  cleaned_reason text := nullif(btrim(reason), '');
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor, Admin or Safety Manager access required.';
  end if;

  if cleaned_reason is null then
    raise exception 'A deactivation reason is required.';
  end if;

  select * into old_row
  from public.knowledge_test_assignments
  where id = target_assignment_id
  for update;

  if not found or not old_row.active then
    raise exception 'Active test assignment not found.';
  end if;

  update public.knowledge_test_assignments
  set active = false,
      deactivated_at = now(),
      deactivated_by = auth.uid(),
      deactivation_reason = cleaned_reason
  where id = target_assignment_id;

  perform public.write_audit_log(
    'KNOWLEDGE_TEST_ASSIGNMENT_DEACTIVATED',
    'knowledge_test_assignment',
    target_assignment_id,
    to_jsonb(old_row),
    jsonb_build_object('active', false, 'reason', cleaned_reason),
    '{}'::jsonb
  );
end;
$$;

create or replace function public.admin_list_knowledge_tests_v1()
returns table (
  test_id uuid,
  title text,
  description text,
  programme_id uuid,
  programme_name text,
  test_status text,
  pass_mark_percent numeric,
  time_limit_minutes integer,
  max_attempts integer,
  randomize_questions boolean,
  randomize_answers boolean,
  release_results_immediately boolean,
  question_count bigint,
  active_assignment_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor, Admin or Safety Manager access required.';
  end if;

  return query
  select
    t.id,
    t.title,
    t.description,
    t.programme_id,
    tp.name,
    t.status,
    t.pass_mark_percent,
    t.time_limit_minutes,
    t.max_attempts,
    t.randomize_questions,
    t.randomize_answers,
    t.release_results_immediately,
    (select count(*) from public.knowledge_test_questions q where q.test_id = t.id)::bigint,
    (select count(*) from public.knowledge_test_assignments a where a.test_id = t.id and a.active)::bigint,
    t.created_at,
    t.updated_at
  from public.knowledge_tests t
  left join public.training_programmes tp on tp.id = t.programme_id
  order by t.updated_at desc, lower(t.title);
end;
$$;

create or replace function public.admin_get_knowledge_test_editor_v1(
  target_test_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor, Admin or Safety Manager access required.';
  end if;

  if not exists (select 1 from public.knowledge_tests t where t.id = target_test_id) then
    raise exception 'Test not found.';
  end if;

  return jsonb_build_object(
    'test', (
      select to_jsonb(t)
      from public.knowledge_tests t
      where t.id = target_test_id
    ),
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'question_id', q.id,
        'position', q.position,
        'question_type', q.question_type,
        'prompt', q.prompt,
        'points', q.points,
        'options', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'option_id', o.id,
            'position', o.position,
            'label', o.option_text,
            'is_correct', o.is_correct
          ) order by o.position), '[]'::jsonb)
          from public.knowledge_test_options o
          where o.question_id = q.id
        )
      ) order by q.position), '[]'::jsonb)
      from public.knowledge_test_questions q
      where q.test_id = target_test_id
    ),
    'assignments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'assignment_id', a.id,
        'student_id', a.student_id,
        'programme_id', a.programme_id,
        'ground_class_id', a.ground_class_id,
        'required', a.required,
        'requires_pass', a.requires_pass,
        'availability_mode', a.availability_mode,
        'available_from', a.available_from,
        'due_at', a.due_at,
        'max_attempts_override', a.max_attempts_override,
        'active', a.active,
        'assigned_at', a.assigned_at
      ) order by a.assigned_at desc), '[]'::jsonb)
      from public.knowledge_test_assignments a
      where a.test_id = target_test_id
    )
  );
end;
$$;
select jsonb_build_object(
  'migration', '024B1',
  'ground_class_detail_v2', to_regprocedure('public.get_ground_class_detail_v2(uuid)') is not null,
  'staff_test_authoring', true,
  'approved_instructor_can_author_tests', true,
  'safety_manager_admin_equivalent', true,
  'legacy_ground_class_detail_preserved', to_regprocedure('public.get_ground_class_detail_v1(uuid)') is not null,
  'knowledge_test_functions_recreated', (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'admin_create_knowledge_test_v1',
        'admin_update_knowledge_test_v1',
        'admin_save_knowledge_test_question_v1',
        'admin_delete_knowledge_test_question_v1',
        'admin_publish_knowledge_test_v1',
        'admin_archive_knowledge_test_v1',
        'admin_duplicate_knowledge_test_v1',
        'admin_assign_knowledge_test_v1',
        'admin_deactivate_knowledge_test_assignment_v1',
        'admin_list_knowledge_tests_v1',
        'admin_get_knowledge_test_editor_v1'
      ])
  )
) as migration_024b1_verification;

commit;
