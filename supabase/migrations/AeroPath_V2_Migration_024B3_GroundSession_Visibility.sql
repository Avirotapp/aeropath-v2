reset role;

begin;

-- =========================================================
-- AeroPath V2
-- Migration 024B3 — Ground Session Visibility / Live Deck Fix
--
-- Student visibility rule:
--   • enrolled students continue to see published classes normally
--   • once a real Ground Session is scheduled/started/completed,
--     enrolled students can see that class/session even if the class
--     container was accidentally left in DRAFT
-- This prevents an operational session from being invisible to its students.
-- =========================================================

create or replace function public.list_ground_classes_v2()
returns table (
  ground_class_id uuid,
  title text,
  subject text,
  description text,
  programme_id uuid,
  programme_name text,
  capacity integer,
  minimum_required_sessions integer,
  class_status text,
  session_count bigint,
  completed_session_count bigint,
  upcoming_session_count bigint,
  first_session_at timestamptz,
  last_session_at timestamptz,
  enrolled_students bigint,
  can_manage boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_approved_user() then
    raise exception 'Approved AeroPath account required.';
  end if;

  return query
  select
    gc.id, gc.title, gc.subject, gc.description, gc.programme_id, tp.name,
    gc.capacity, gc.minimum_required_sessions, gc.status,
    count(gs.id) filter (where gs.status <> 'CANCELLED')::bigint,
    count(gs.id) filter (where gs.status = 'COMPLETED')::bigint,
    count(gs.id) filter (where gs.status = 'SCHEDULED' and gs.starts_at > now())::bigint,
    min(gs.starts_at) filter (where gs.status <> 'CANCELLED'),
    max(gs.starts_at) filter (where gs.status <> 'CANCELLED'),
    (select count(*) from public.ground_class_enrolments e
      where e.ground_class_id = gc.id and e.status = 'ENROLLED')::bigint,
    (public.is_admin() or public.is_instructor())
  from public.ground_classes gc
  left join public.training_programmes tp on tp.id = gc.programme_id
  left join public.ground_sessions gs on gs.ground_class_id = gc.id
  where gc.archived_at is null
    and (
      public.is_admin()
      or public.is_instructor()
      or (public.is_student()
          and (
            gc.status <> 'DRAFT'
            or exists (
              select 1
              from public.ground_sessions visible_gs
              where visible_gs.ground_class_id = gc.id
                and visible_gs.status in ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')
            )
          )
          and exists (
        select 1 from public.ground_class_enrolments e
        where e.ground_class_id = gc.id
          and e.student_id = auth.uid()
          and e.status = 'ENROLLED'
      ))
    )
  group by gc.id, tp.name
  order by min(gs.starts_at) nulls last, lower(gc.title);
end;
$$;

revoke all on function public.list_ground_classes_v2() from public;
grant execute on function public.list_ground_classes_v2() to authenticated;

create or replace function public.list_ground_sessions_v1(
  filter_start timestamptz default null,
  filter_end timestamptz default null,
  filter_class_id uuid default null
)
returns table (
  ground_session_id uuid,
  ground_class_id uuid,
  class_title text,
  class_subject text,
  programme_id uuid,
  programme_name text,
  scheduled_instructor_id uuid,
  scheduled_instructor_name text,
  conducted_by_id uuid,
  conducted_by_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  classroom_id uuid,
  classroom_name text,
  physical_location text,
  custom_location text,
  display_location text,
  session_status text,
  enrolled_students bigint,
  can_start boolean,
  can_manage boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_approved_user() then
    raise exception 'Approved AeroPath account required.';
  end if;

  return query
  select
    gs.id,
    gc.id,
    gc.title,
    gc.subject,
    gc.programme_id,
    tp.name,
    gs.scheduled_instructor_id,
    coalesce(si.display_name, si.full_name, si.email),
    gs.conducted_by,
    coalesce(ci.display_name, ci.full_name, ci.email),
    gs.starts_at,
    gs.ends_at,
    gs.classroom_id,
    cr.name,
    cr.physical_location,
    gs.custom_location,
    coalesce(
      cr.name || case when cr.physical_location is not null then ' — ' || cr.physical_location else '' end,
      gs.custom_location,
      'Location TBA'
    ),
    gs.status,
    (
      select count(*)
      from public.ground_class_enrolments e
      where e.ground_class_id = gc.id and e.status = 'ENROLLED'
    )::bigint,
    (
      gs.status = 'SCHEDULED'
      and (public.is_admin() or public.is_instructor())
    ),
    (public.is_admin() or public.is_instructor())
  from public.ground_sessions gs
  join public.ground_classes gc on gc.id = gs.ground_class_id
  left join public.training_programmes tp on tp.id = gc.programme_id
  left join public.profiles si on si.id = gs.scheduled_instructor_id
  left join public.profiles ci on ci.id = gs.conducted_by
  left join public.ground_classrooms cr on cr.id = gs.classroom_id
  where (filter_start is null or gs.ends_at >= filter_start)
    and (filter_end is null or gs.starts_at <= filter_end)
    and (filter_class_id is null or gs.ground_class_id = filter_class_id)
    and (
      public.is_admin()
      or public.is_instructor()
      or (
        public.is_student()
        and (
          gc.status <> 'DRAFT'
          or gs.status in ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')
        )
        and exists (
          select 1 from public.ground_class_enrolments e
          where e.ground_class_id = gc.id
            and e.student_id = auth.uid()
            and e.status = 'ENROLLED'
        )
      )
    )
  order by gs.starts_at asc, lower(gc.title);
end;
$$;

revoke all on function public.list_ground_sessions_v1(timestamptz, timestamptz, uuid) from public;
grant execute on function public.list_ground_sessions_v1(timestamptz, timestamptz, uuid) to authenticated;

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
    and (
      class_row.status <> 'DRAFT'
      or exists (
        select 1
        from public.ground_sessions visible_gs
        where visible_gs.ground_class_id = target_class_id
          and visible_gs.status in ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')
      )
    )
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

select jsonb_build_object(
  'migration', '024B3',
  'student_operational_ground_session_visibility', true,
  'published_class_visibility_preserved', true,
  'draft_without_sessions_stays_hidden', true,
  'ground_class_list_v2', to_regprocedure('public.list_ground_classes_v2()') is not null,
  'ground_sessions_v1', to_regprocedure('public.list_ground_sessions_v1(timestamp with time zone,timestamp with time zone,uuid)') is not null,
  'ground_class_detail_v2', to_regprocedure('public.get_ground_class_detail_v2(uuid)') is not null,
  'existing_booking_session_rules_changed', false
) as migration_024b3_verification;

commit;
