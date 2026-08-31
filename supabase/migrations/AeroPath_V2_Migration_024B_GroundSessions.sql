reset role;

begin;

-- ============================================================================
-- AeroPath V2
-- Migration 024B — Ground Sessions / Class Dates / Attendance / Classrooms
--
-- Builds on verified Migration 024.
-- Existing booking/session rules are NOT replaced.
-- Existing class-level attendance is retained for compatibility but is no
-- longer the source of truth for new Ground School attendance.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) CLASS-LEVEL EXTENSIONS
-- ---------------------------------------------------------------------------

alter table public.ground_classes
  add column if not exists minimum_required_sessions integer,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id);

alter table public.ground_classes
  drop constraint if exists ground_classes_minimum_required_sessions_valid;

alter table public.ground_classes
  add constraint ground_classes_minimum_required_sessions_valid
  check (minimum_required_sessions is null or minimum_required_sessions > 0);

-- Migration 024 treated one class as one dated event. 024B turns the class
-- into a reusable course/container and moves dates/instructors/locations to
-- ground_sessions. Legacy values remain on existing rows for compatibility.
alter table public.ground_classes
  alter column instructor_id drop not null,
  alter column starts_at drop not null,
  alter column ends_at drop not null;

alter table public.ground_classes
  drop constraint if exists ground_classes_time_valid;

alter table public.ground_classes
  add constraint ground_classes_time_valid
  check (
    (starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and ends_at > starts_at)
  );


-- ---------------------------------------------------------------------------
-- 2) CLASSROOMS
-- ---------------------------------------------------------------------------

create table if not exists public.ground_classrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  physical_location text,
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ground_classrooms_name_required check (btrim(name) <> '')
);

create unique index if not exists ground_classrooms_name_ci_key
  on public.ground_classrooms ((lower(btrim(name))));

drop trigger if exists ground_classrooms_updated_at on public.ground_classrooms;
create trigger ground_classrooms_updated_at
before update on public.ground_classrooms
for each row execute function public.set_updated_at();

insert into public.ground_classrooms (name, physical_location, description)
select x.name, x.physical_location, x.description
from (
  values
    ('Aero 01', null::text, 'Aeroviation ground classroom'),
    ('Aero 02', null::text, 'Aeroviation ground classroom'),
    ('Aero 03', null::text, 'Aeroviation ground classroom'),
    ('Aero 04', null::text, 'Aeroviation ground classroom')
) as x(name, physical_location, description)
where not exists (
  select 1
  from public.ground_classrooms c
  where lower(btrim(c.name)) = lower(btrim(x.name))
);


-- ---------------------------------------------------------------------------
-- 3) GROUND SESSION TABLES
-- ---------------------------------------------------------------------------

create table if not exists public.ground_sessions (
  id uuid primary key default gen_random_uuid(),
  ground_class_id uuid not null references public.ground_classes(id) on delete cascade,
  scheduled_instructor_id uuid references public.profiles(id),
  conducted_by uuid references public.profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  classroom_id uuid references public.ground_classrooms(id),
  custom_location text,
  status text not null default 'SCHEDULED',
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancellation_reason text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ground_sessions_time_valid check (ends_at > starts_at),
  constraint ground_sessions_status_valid
    check (status in ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  constraint ground_sessions_location_valid
    check (classroom_id is not null or nullif(btrim(custom_location), '') is not null),
  constraint ground_sessions_cancel_reason_valid
    check (status <> 'CANCELLED' or cancellation_reason is not null)
);

create index if not exists ground_sessions_class_idx
  on public.ground_sessions(ground_class_id, starts_at);
create index if not exists ground_sessions_instructor_idx
  on public.ground_sessions(scheduled_instructor_id, starts_at);
create index if not exists ground_sessions_conducted_by_idx
  on public.ground_sessions(conducted_by, status);
create index if not exists ground_sessions_classroom_idx
  on public.ground_sessions(classroom_id, starts_at);
create index if not exists ground_sessions_status_start_idx
  on public.ground_sessions(status, starts_at);

drop trigger if exists ground_sessions_updated_at on public.ground_sessions;
create trigger ground_sessions_updated_at
before update on public.ground_sessions
for each row execute function public.set_updated_at();


-- Snapshot of expected attendees when a session starts.
create table if not exists public.ground_session_roster (
  id uuid primary key default gen_random_uuid(),
  ground_session_id uuid not null references public.ground_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  expected boolean not null default true,
  roster_source text not null default 'CLASS_ENROLMENT',
  added_by uuid references public.profiles(id),
  added_at timestamptz not null default now(),
  constraint ground_session_roster_unique unique (ground_session_id, student_id),
  constraint ground_session_roster_source_valid
    check (roster_source in ('CLASS_ENROLMENT', 'MAKEUP', 'MANUAL'))
);


-- Current attendance state per student/session.
create table if not exists public.ground_session_attendance (
  id uuid primary key default gen_random_uuid(),
  ground_session_id uuid not null references public.ground_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  attendance_status text not null default 'PENDING',
  late_arrival_time time,
  marked_by uuid references public.profiles(id),
  marked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint ground_session_attendance_unique unique (ground_session_id, student_id),
  constraint ground_session_attendance_status_valid
    check (attendance_status in ('PENDING', 'PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
  constraint ground_session_late_arrival_valid
    check (attendance_status = 'LATE' or late_arrival_time is null)
);

drop trigger if exists ground_session_attendance_updated_at on public.ground_session_attendance;
create trigger ground_session_attendance_updated_at
before update on public.ground_session_attendance
for each row execute function public.set_updated_at();


-- Immutable attendance change history.
create table if not exists public.ground_session_attendance_revisions (
  id uuid primary key default gen_random_uuid(),
  ground_session_id uuid not null references public.ground_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  old_status text,
  new_status text not null,
  old_late_arrival_time time,
  new_late_arrival_time time,
  reason text,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now(),
  constraint ground_session_attendance_revision_new_status_valid
    check (new_status in ('PENDING', 'PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
  constraint ground_session_attendance_revision_old_status_valid
    check (old_status is null or old_status in ('PENDING', 'PRESENT', 'ABSENT', 'LATE', 'EXCUSED'))
);

create index if not exists ground_session_attendance_revisions_idx
  on public.ground_session_attendance_revisions(ground_session_id, student_id, changed_at);


-- Append-only whole-session comments.
create table if not exists public.ground_session_comments (
  id uuid primary key default gen_random_uuid(),
  ground_session_id uuid not null references public.ground_sessions(id) on delete cascade,
  comment_text text not null,
  visibility text not null default 'INTERNAL',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint ground_session_comment_required check (btrim(comment_text) <> ''),
  constraint ground_session_comment_visibility_valid
    check (visibility in ('INTERNAL', 'STUDENT_VISIBLE'))
);

create index if not exists ground_session_comments_idx
  on public.ground_session_comments(ground_session_id, created_at);


-- Append-only individual student notes/feedback.
create table if not exists public.ground_session_student_comments (
  id uuid primary key default gen_random_uuid(),
  ground_session_id uuid not null references public.ground_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  comment_text text not null,
  visibility text not null default 'INTERNAL',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint ground_student_comment_required check (btrim(comment_text) <> ''),
  constraint ground_student_comment_visibility_valid
    check (visibility in ('INTERNAL', 'STUDENT_VISIBLE'))
);

create index if not exists ground_session_student_comments_idx
  on public.ground_session_student_comments(student_id, created_at);
create index if not exists ground_session_student_comments_session_idx
  on public.ground_session_student_comments(ground_session_id, student_id, created_at);


-- Session-specific files still link to existing AeroPath Files records.
create table if not exists public.ground_session_materials (
  id uuid primary key default gen_random_uuid(),
  ground_session_id uuid not null references public.ground_sessions(id) on delete cascade,
  file_id uuid not null references public.files(id),
  display_label text,
  attached_by uuid not null references public.profiles(id),
  attached_at timestamptz not null default now(),
  constraint ground_session_material_unique unique (ground_session_id, file_id)
);


-- One-shot 24-hour reminder tracking.
create table if not exists public.ground_session_reminders (
  id uuid primary key default gen_random_uuid(),
  ground_session_id uuid not null references public.ground_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reminder_type text not null default 'GROUND_SESSION_24H',
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ground_session_reminder_unique
    unique (ground_session_id, user_id, reminder_type)
);

create index if not exists ground_session_reminders_due_idx
  on public.ground_session_reminders(sent_at, scheduled_for);


-- ---------------------------------------------------------------------------
-- 4) MIGRATE EXISTING M024 CLASS DATE INTO ONE GROUND SESSION
-- ---------------------------------------------------------------------------

insert into public.ground_sessions (
  ground_class_id,
  scheduled_instructor_id,
  starts_at,
  ends_at,
  custom_location,
  status,
  created_by,
  created_at
)
select
  c.id,
  c.instructor_id,
  c.starts_at,
  c.ends_at,
  coalesce(nullif(btrim(c.location), ''), 'Location not specified'),
  case
    when c.status = 'COMPLETED' then 'COMPLETED'
    when c.status = 'CANCELLED' then 'CANCELLED'
    else 'SCHEDULED'
  end,
  c.created_by,
  c.created_at
from public.ground_classes c
where not exists (
  select 1
  from public.ground_sessions s
  where s.ground_class_id = c.id
);

-- Preserve old class attendance as the initial migrated session attendance.
insert into public.ground_session_attendance (
  ground_session_id,
  student_id,
  attendance_status,
  marked_by,
  marked_at
)
select
  s.id,
  a.student_id,
  a.attendance_status,
  a.marked_by,
  a.marked_at
from public.ground_class_attendance a
join lateral (
  select gs.id
  from public.ground_sessions gs
  where gs.ground_class_id = a.ground_class_id
  order by gs.starts_at asc, gs.created_at asc
  limit 1
) s on true
on conflict (ground_session_id, student_id) do nothing;


-- ---------------------------------------------------------------------------
-- 5) INTERNAL HELPERS
-- ---------------------------------------------------------------------------

create or replace function public.ground_session_staff_authorised_v1(
  target_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ground_sessions gs
    where gs.id = target_session_id
      and (
        public.is_admin()
        or public.is_instructor()
      )
  );
$$;


create or replace function public.assert_ground_session_schedule_clear_v1(
  target_session_id uuid,
  target_class_id uuid,
  target_instructor_id uuid,
  target_classroom_id uuid,
  target_start timestamptz,
  target_end timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict_student text;
begin
  if target_start is null or target_end is null or target_end <= target_start then
    raise exception 'Ground session end time must be after start time.';
  end if;

  -- Instructor schedule conflict with another non-cancelled Ground Session.
  if target_instructor_id is not null and exists (
    select 1
    from public.ground_sessions gs
    where gs.id is distinct from target_session_id
      and gs.status <> 'CANCELLED'
      and gs.scheduled_instructor_id = target_instructor_id
      and tstzrange(gs.starts_at, gs.ends_at, '[)') && tstzrange(target_start, target_end, '[)')
  ) then
    raise exception 'The selected instructor is already assigned to another Ground Session during this time.';
  end if;

  -- Instructor schedule conflict with APPROVED flight/simulator booking.
  if target_instructor_id is not null and exists (
    select 1
    from public.bookings b
    where b.deleted_at is null
      and b.status = 'APPROVED'::public.booking_status
      and b.assigned_instructor_id = target_instructor_id
      and b.approved_start is not null
      and b.approved_end is not null
      and tstzrange(b.approved_start, b.approved_end, '[)') && tstzrange(target_start, target_end, '[)')
  ) then
    raise exception 'The selected instructor already has an approved operational booking during this time.';
  end if;

  -- Classroom conflict.
  if target_classroom_id is not null and exists (
    select 1
    from public.ground_sessions gs
    where gs.id is distinct from target_session_id
      and gs.status <> 'CANCELLED'
      and gs.classroom_id = target_classroom_id
      and tstzrange(gs.starts_at, gs.ends_at, '[)') && tstzrange(target_start, target_end, '[)')
  ) then
    raise exception 'The selected classroom is already in use during this time.';
  end if;

  -- Existing enrolled student conflicts are blocked rather than silently hidden.
  select coalesce(p.display_name, p.full_name, p.email)
  into conflict_student
  from public.ground_class_enrolments e
  join public.profiles p on p.id = e.student_id
  where e.ground_class_id = target_class_id
    and e.status = 'ENROLLED'
    and (
      exists (
        select 1
        from public.bookings b
        where b.student_id = e.student_id
          and b.deleted_at is null
          and b.status = 'APPROVED'::public.booking_status
          and b.approved_start is not null
          and b.approved_end is not null
          and tstzrange(b.approved_start, b.approved_end, '[)') && tstzrange(target_start, target_end, '[)')
      )
      or exists (
        select 1
        from public.ground_class_enrolments oe
        join public.ground_sessions other_gs
          on other_gs.ground_class_id = oe.ground_class_id
        where oe.student_id = e.student_id
          and oe.status = 'ENROLLED'
          and other_gs.id is distinct from target_session_id
          and other_gs.status <> 'CANCELLED'
          and tstzrange(other_gs.starts_at, other_gs.ends_at, '[)') && tstzrange(target_start, target_end, '[)')
      )
    )
  limit 1;

  if conflict_student is not null then
    raise exception 'Student schedule conflict detected for %.', conflict_student;
  end if;
end;
$$;


create or replace function public.refresh_ground_session_reminder_recipients_v1(
  target_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.ground_sessions%rowtype;
begin
  select * into session_row
  from public.ground_sessions
  where id = target_session_id;

  if not found then
    raise exception 'Ground Session not found.';
  end if;

  delete from public.ground_session_reminders
  where ground_session_id = target_session_id
    and sent_at is null;

  if session_row.status <> 'SCHEDULED' then
    return;
  end if;

  -- Enrolled students.
  insert into public.ground_session_reminders (
    ground_session_id, user_id, scheduled_for
  )
  select
    session_row.id,
    e.student_id,
    session_row.starts_at - interval '24 hours'
  from public.ground_class_enrolments e
  where e.ground_class_id = session_row.ground_class_id
    and e.status = 'ENROLLED'
  on conflict (ground_session_id, user_id, reminder_type)
  do update set scheduled_for = excluded.scheduled_for, sent_at = null;

  -- Scheduled instructor.
  if session_row.scheduled_instructor_id is not null then
    insert into public.ground_session_reminders (
      ground_session_id, user_id, scheduled_for
    ) values (
      session_row.id,
      session_row.scheduled_instructor_id,
      session_row.starts_at - interval '24 hours'
    )
    on conflict (ground_session_id, user_id, reminder_type)
    do update set scheduled_for = excluded.scheduled_for, sent_at = null;
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 6) CLASS CONTAINER RPCs
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_ground_class_v2(
  class_title text,
  class_subject text,
  class_description text,
  class_programme_id uuid,
  class_capacity integer,
  class_minimum_required_sessions integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_approved_admin() then
    raise exception 'Admin or Safety Manager access required.';
  end if;

  if class_title is null or btrim(class_title) = '' then
    raise exception 'Class title is required.';
  end if;

  if class_capacity is not null and class_capacity <= 0 then
    raise exception 'Class capacity must be greater than zero.';
  end if;

  if class_minimum_required_sessions is not null
     and class_minimum_required_sessions <= 0 then
    raise exception 'Minimum required sessions must be greater than zero.';
  end if;

  if class_programme_id is not null and not exists (
    select 1 from public.training_programmes p
    where p.id = class_programme_id and p.active
  ) then
    raise exception 'Training programme not found or inactive.';
  end if;

  insert into public.ground_classes (
    programme_id, title, subject, description, instructor_id,
    starts_at, ends_at, location, capacity, minimum_required_sessions, created_by
  ) values (
    class_programme_id, btrim(class_title), nullif(btrim(class_subject), ''),
    nullif(btrim(class_description), ''), null, null, null, null,
    class_capacity, class_minimum_required_sessions, auth.uid()
  ) returning id into new_id;

  perform public.write_audit_log(
    'GROUND_CLASS_CREATED_V2', 'ground_class', new_id, null,
    jsonb_build_object(
      'title', btrim(class_title),
      'programme_id', class_programme_id,
      'capacity', class_capacity,
      'minimum_required_sessions', class_minimum_required_sessions,
      'schedule_model', 'GROUND_SESSIONS'
    ), '{}'::jsonb
  );

  return new_id;
end;
$$;


create or replace function public.admin_update_ground_class_v2(
  target_class_id uuid,
  class_title text,
  class_subject text,
  class_description text,
  class_programme_id uuid,
  class_capacity integer,
  class_minimum_required_sessions integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.ground_classes%rowtype;
  enrolled_count integer;
begin
  if not public.is_approved_admin() then
    raise exception 'Admin or Safety Manager access required.';
  end if;

  select * into old_row
  from public.ground_classes
  where id = target_class_id
  for update;

  if not found then raise exception 'Ground class not found.'; end if;
  if old_row.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'Completed or cancelled classes cannot be edited.';
  end if;
  if class_title is null or btrim(class_title) = '' then
    raise exception 'Class title is required.';
  end if;

  select count(*)::integer into enrolled_count
  from public.ground_class_enrolments e
  where e.ground_class_id = target_class_id and e.status = 'ENROLLED';

  if class_capacity is not null and class_capacity < enrolled_count then
    raise exception 'Capacity cannot be lower than the current enrolment count.';
  end if;

  update public.ground_classes
  set programme_id = class_programme_id,
      title = btrim(class_title),
      subject = nullif(btrim(class_subject), ''),
      description = nullif(btrim(class_description), ''),
      capacity = class_capacity,
      minimum_required_sessions = class_minimum_required_sessions
  where id = target_class_id;

  perform public.write_audit_log(
    'GROUND_CLASS_UPDATED_V2', 'ground_class', target_class_id,
    to_jsonb(old_row),
    jsonb_build_object(
      'title', btrim(class_title),
      'programme_id', class_programme_id,
      'capacity', class_capacity,
      'minimum_required_sessions', class_minimum_required_sessions
    ), '{}'::jsonb
  );
end;
$$;


create or replace function public.admin_publish_ground_class_v2(
  target_class_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  class_row public.ground_classes%rowtype;
begin
  if not public.is_approved_admin() then
    raise exception 'Admin or Safety Manager access required.';
  end if;

  select * into class_row
  from public.ground_classes
  where id = target_class_id
  for update;

  if not found then raise exception 'Ground class not found.'; end if;
  if class_row.status <> 'DRAFT' then
    raise exception 'Only draft classes can be published.';
  end if;
  if not exists (
    select 1 from public.ground_sessions gs
    where gs.ground_class_id = target_class_id and gs.status = 'SCHEDULED'
  ) then
    raise exception 'Add at least one Ground Session date before publishing the class.';
  end if;

  update public.ground_classes
  set status = 'SCHEDULED', published_at = now(), published_by = auth.uid()
  where id = target_class_id;

  perform public.refresh_ground_class_reminders_v1(target_class_id);

  perform public.create_notification(
    e.student_id,
    'GROUND_CLASS_ASSIGNED',
    'Ground class scheduled',
    class_row.title || ' has been added to your Ground School schedule.'
  )
  from public.ground_class_enrolments e
  where e.ground_class_id = target_class_id and e.status = 'ENROLLED';

  perform public.write_audit_log(
    'GROUND_CLASS_PUBLISHED_V2', 'ground_class', target_class_id,
    jsonb_build_object('status', 'DRAFT'),
    jsonb_build_object('status', 'SCHEDULED', 'published_at', now()),
    jsonb_build_object('schedule_model', 'GROUND_SESSIONS')
  );
end;
$$;


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
      or (public.is_student() and gc.status <> 'DRAFT' and exists (
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


-- ---------------------------------------------------------------------------
-- 7) CLASSROOM RPCs
-- ---------------------------------------------------------------------------

create or replace function public.list_ground_classrooms_v1()
returns table (
  classroom_id uuid,
  name text,
  physical_location text,
  description text,
  active boolean
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
  select c.id, c.name, c.physical_location, c.description, c.active
  from public.ground_classrooms c
  where c.active or public.is_admin()
  order by lower(c.name);
end;
$$;


create or replace function public.admin_save_ground_classroom_v1(
  target_classroom_id uuid,
  classroom_name text,
  classroom_physical_location text,
  classroom_description text,
  classroom_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.ground_classrooms%rowtype;
  new_id uuid;
begin
  if not public.is_approved_admin() then
    raise exception 'Admin or Safety Manager access required.';
  end if;

  if classroom_name is null or btrim(classroom_name) = '' then
    raise exception 'Classroom name is required.';
  end if;

  if target_classroom_id is null then
    insert into public.ground_classrooms (
      name, physical_location, description, active, created_by
    ) values (
      btrim(classroom_name),
      nullif(btrim(classroom_physical_location), ''),
      nullif(btrim(classroom_description), ''),
      coalesce(classroom_active, true),
      auth.uid()
    ) returning id into new_id;

    perform public.write_audit_log(
      'GROUND_CLASSROOM_CREATED', 'ground_classroom', new_id, null,
      jsonb_build_object('name', btrim(classroom_name)), '{}'::jsonb
    );
  else
    select * into old_row
    from public.ground_classrooms
    where id = target_classroom_id
    for update;

    if not found then
      raise exception 'Classroom not found.';
    end if;

    update public.ground_classrooms
    set name = btrim(classroom_name),
        physical_location = nullif(btrim(classroom_physical_location), ''),
        description = nullif(btrim(classroom_description), ''),
        active = coalesce(classroom_active, true)
    where id = target_classroom_id;

    new_id := target_classroom_id;

    perform public.write_audit_log(
      'GROUND_CLASSROOM_UPDATED', 'ground_classroom', new_id,
      to_jsonb(old_row),
      jsonb_build_object(
        'name', btrim(classroom_name),
        'physical_location', nullif(btrim(classroom_physical_location), ''),
        'active', coalesce(classroom_active, true)
      ), '{}'::jsonb
    );
  end if;

  return new_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- 7) GROUND SESSION SCHEDULING RPCs
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_ground_session_v1(
  target_class_id uuid,
  session_instructor_id uuid,
  session_starts_at timestamptz,
  session_ends_at timestamptz,
  session_classroom_id uuid,
  session_custom_location text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  class_row public.ground_classes%rowtype;
  new_id uuid;
begin
  if not public.is_approved_admin() then
    raise exception 'Admin or Safety Manager access required.';
  end if;

  select * into class_row
  from public.ground_classes
  where id = target_class_id
  for update;

  if not found then
    raise exception 'Ground class not found.';
  end if;

  if class_row.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'Cannot add sessions to a completed or cancelled class.';
  end if;

  if session_instructor_id is null or not exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.id = session_instructor_id
      and p.account_status = 'APPROVED'::public.account_status
      and ur.role = 'INSTRUCTOR'::public.app_role
  ) then
    raise exception 'Select an approved Instructor.';
  end if;

  if session_classroom_id is null
     and nullif(btrim(session_custom_location), '') is null then
    raise exception 'Select a classroom or enter an off-site/custom location.';
  end if;

  if session_classroom_id is not null and not exists (
    select 1 from public.ground_classrooms c
    where c.id = session_classroom_id and c.active
  ) then
    raise exception 'Selected classroom is not active.';
  end if;

  perform public.assert_ground_session_schedule_clear_v1(
    null, target_class_id, session_instructor_id, session_classroom_id,
    session_starts_at, session_ends_at
  );

  insert into public.ground_sessions (
    ground_class_id,
    scheduled_instructor_id,
    starts_at,
    ends_at,
    classroom_id,
    custom_location,
    created_by
  ) values (
    target_class_id,
    session_instructor_id,
    session_starts_at,
    session_ends_at,
    session_classroom_id,
    case when session_classroom_id is null then nullif(btrim(session_custom_location), '') else null end,
    auth.uid()
  ) returning id into new_id;

  perform public.refresh_ground_session_reminder_recipients_v1(new_id);

  perform public.write_audit_log(
    'GROUND_SESSION_SCHEDULED', 'ground_session', new_id, null,
    jsonb_build_object(
      'ground_class_id', target_class_id,
      'scheduled_instructor_id', session_instructor_id,
      'starts_at', session_starts_at,
      'ends_at', session_ends_at,
      'classroom_id', session_classroom_id,
      'custom_location', case when session_classroom_id is null then nullif(btrim(session_custom_location), '') else null end
    ), '{}'::jsonb
  );

  return new_id;
end;
$$;


create or replace function public.admin_update_ground_session_v1(
  target_session_id uuid,
  session_instructor_id uuid,
  session_starts_at timestamptz,
  session_ends_at timestamptz,
  session_classroom_id uuid,
  session_custom_location text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.ground_sessions%rowtype;
begin
  if not public.is_approved_admin() then
    raise exception 'Admin or Safety Manager access required.';
  end if;

  select * into old_row
  from public.ground_sessions
  where id = target_session_id
  for update;

  if not found then
    raise exception 'Ground Session not found.';
  end if;

  if old_row.status <> 'SCHEDULED' then
    raise exception 'Only scheduled Ground Sessions can be rescheduled.';
  end if;

  if session_instructor_id is null or not exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.id = session_instructor_id
      and p.account_status = 'APPROVED'::public.account_status
      and ur.role = 'INSTRUCTOR'::public.app_role
  ) then
    raise exception 'Select an approved Instructor.';
  end if;

  if session_classroom_id is null
     and nullif(btrim(session_custom_location), '') is null then
    raise exception 'Select a classroom or enter an off-site/custom location.';
  end if;

  perform public.assert_ground_session_schedule_clear_v1(
    target_session_id, old_row.ground_class_id, session_instructor_id,
    session_classroom_id, session_starts_at, session_ends_at
  );

  update public.ground_sessions
  set scheduled_instructor_id = session_instructor_id,
      starts_at = session_starts_at,
      ends_at = session_ends_at,
      classroom_id = session_classroom_id,
      custom_location = case when session_classroom_id is null then nullif(btrim(session_custom_location), '') else null end
  where id = target_session_id;

  perform public.refresh_ground_session_reminder_recipients_v1(target_session_id);

  perform public.write_audit_log(
    'GROUND_SESSION_RESCHEDULED', 'ground_session', target_session_id,
    to_jsonb(old_row),
    jsonb_build_object(
      'scheduled_instructor_id', session_instructor_id,
      'starts_at', session_starts_at,
      'ends_at', session_ends_at,
      'classroom_id', session_classroom_id,
      'custom_location', case when session_classroom_id is null then nullif(btrim(session_custom_location), '') else null end
    ), '{}'::jsonb
  );
end;
$$;


create or replace function public.admin_cancel_ground_session_v1(
  target_session_id uuid,
  reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.ground_sessions%rowtype;
begin
  if not public.is_approved_admin() then
    raise exception 'Admin or Safety Manager access required.';
  end if;

  if reason is null or btrim(reason) = '' then
    raise exception 'Cancellation reason is required.';
  end if;

  select * into old_row
  from public.ground_sessions
  where id = target_session_id
  for update;

  if not found then
    raise exception 'Ground Session not found.';
  end if;

  if old_row.status not in ('SCHEDULED', 'IN_PROGRESS') then
    raise exception 'This Ground Session cannot be cancelled.';
  end if;

  update public.ground_sessions
  set status = 'CANCELLED',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancellation_reason = btrim(reason)
  where id = target_session_id;

  delete from public.ground_session_reminders
  where ground_session_id = target_session_id
    and sent_at is null;

  perform public.write_audit_log(
    'GROUND_SESSION_CANCELLED', 'ground_session', target_session_id,
    to_jsonb(old_row),
    jsonb_build_object('status', 'CANCELLED', 'reason', btrim(reason)),
    '{}'::jsonb
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- 8) START / COMPLETE SESSION
-- ---------------------------------------------------------------------------

create or replace function public.staff_start_ground_session_v1(
  target_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_is_admin boolean;
  actor_is_instructor boolean;
  session_row public.ground_sessions%rowtype;
begin
  if actor_id is null or not public.is_approved_user() then
    raise exception 'Approved AeroPath account required.';
  end if;

  actor_is_admin := public.is_admin();
  actor_is_instructor := public.is_instructor();

  if not (actor_is_admin or actor_is_instructor) then
    raise exception 'Instructor, Admin or Safety Manager access required.';
  end if;

  select * into session_row
  from public.ground_sessions
  where id = target_session_id
  for update;

  if not found then
    raise exception 'Ground Session not found.';
  end if;

  if session_row.status <> 'SCHEDULED' then
    raise exception 'Only a scheduled Ground Session can be started.';
  end if;

  -- Ordinary instructors may conduct only one live operational/ground session.
  if not actor_is_admin then
    perform pg_advisory_xact_lock(8700009, hashtext(actor_id::text));

    if exists (
      select 1 from public.sessions s
      where s.started_by = actor_id
        and s.status = 'IN_PROGRESS'::public.session_status
    ) or exists (
      select 1 from public.ground_sessions gs
      where gs.conducted_by = actor_id
        and gs.status = 'IN_PROGRESS'
        and gs.id <> target_session_id
    ) then
      raise exception 'This instructor already has a session or class in progress.';
    end if;
  end if;

  -- Snapshot the roster from current class enrolments.
  insert into public.ground_session_roster (
    ground_session_id, student_id, roster_source, added_by
  )
  select
    target_session_id,
    e.student_id,
    'CLASS_ENROLMENT',
    actor_id
  from public.ground_class_enrolments e
  where e.ground_class_id = session_row.ground_class_id
    and e.status = 'ENROLLED'
  on conflict (ground_session_id, student_id) do nothing;

  insert into public.ground_session_attendance (
    ground_session_id, student_id, attendance_status
  )
  select target_session_id, r.student_id, 'PENDING'
  from public.ground_session_roster r
  where r.ground_session_id = target_session_id
  on conflict (ground_session_id, student_id) do nothing;

  update public.ground_sessions
  set status = 'IN_PROGRESS',
      conducted_by = actor_id,
      started_at = now()
  where id = target_session_id;

  delete from public.ground_session_reminders
  where ground_session_id = target_session_id
    and sent_at is null;

  perform public.write_audit_log(
    'GROUND_SESSION_STARTED', 'ground_session', target_session_id,
    to_jsonb(session_row),
    jsonb_build_object(
      'status', 'IN_PROGRESS',
      'conducted_by', actor_id,
      'scheduled_instructor_id', session_row.scheduled_instructor_id
    ), '{}'::jsonb
  );

  return target_session_id;
end;
$$;


create or replace function public.staff_complete_ground_session_v1(
  target_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  old_row public.ground_sessions%rowtype;
begin
  if actor_id is null or not public.is_approved_user() then
    raise exception 'Approved AeroPath account required.';
  end if;

  select * into old_row
  from public.ground_sessions
  where id = target_session_id
  for update;

  if not found then
    raise exception 'Ground Session not found.';
  end if;

  if old_row.status <> 'IN_PROGRESS' then
    raise exception 'Only an in-progress Ground Session can be completed.';
  end if;

  if not public.is_admin()
     and not (public.is_instructor() and old_row.conducted_by = actor_id) then
    raise exception 'Only the conducting instructor or Admin may complete this Ground Session.';
  end if;

  update public.ground_sessions
  set status = 'COMPLETED',
      completed_at = now(),
      completed_by = actor_id
  where id = target_session_id;

  perform public.write_audit_log(
    'GROUND_SESSION_COMPLETED', 'ground_session', target_session_id,
    to_jsonb(old_row),
    jsonb_build_object('status', 'COMPLETED', 'completed_by', actor_id),
    '{}'::jsonb
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- 9) ATTENDANCE + COMMENTS
-- ---------------------------------------------------------------------------

create or replace function public.staff_mark_ground_session_attendance_v1(
  target_session_id uuid,
  target_student_id uuid,
  new_attendance_status text,
  late_arrival_time_value time,
  correction_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  session_row public.ground_sessions%rowtype;
  current_row public.ground_session_attendance%rowtype;
  normalized_status text := upper(btrim(new_attendance_status));
begin
  if actor_id is null or not public.is_approved_user() then
    raise exception 'Approved AeroPath account required.';
  end if;

  select * into session_row
  from public.ground_sessions
  where id = target_session_id;

  if not found then
    raise exception 'Ground Session not found.';
  end if;

  if not public.is_admin()
     and not public.is_instructor() then
    raise exception 'Instructor or Admin access required.';
  end if;

  if session_row.status not in ('IN_PROGRESS', 'COMPLETED') then
    raise exception 'Attendance can be marked after the class has started.';
  end if;

  if normalized_status not in ('PENDING', 'PRESENT', 'ABSENT', 'LATE', 'EXCUSED') then
    raise exception 'Invalid attendance status.';
  end if;

  if normalized_status <> 'LATE' then
    late_arrival_time_value := null;
  end if;

  if not exists (
    select 1
    from public.ground_session_roster r
    where r.ground_session_id = target_session_id
      and r.student_id = target_student_id
  ) then
    raise exception 'Student is not on this Ground Session roster.';
  end if;

  select * into current_row
  from public.ground_session_attendance
  where ground_session_id = target_session_id
    and student_id = target_student_id
  for update;

  insert into public.ground_session_attendance (
    ground_session_id,
    student_id,
    attendance_status,
    late_arrival_time,
    marked_by,
    marked_at
  ) values (
    target_session_id,
    target_student_id,
    normalized_status,
    late_arrival_time_value,
    actor_id,
    now()
  )
  on conflict (ground_session_id, student_id)
  do update set
    attendance_status = excluded.attendance_status,
    late_arrival_time = excluded.late_arrival_time,
    marked_by = excluded.marked_by,
    marked_at = excluded.marked_at;

  if current_row.id is null
     or current_row.attendance_status is distinct from normalized_status
     or current_row.late_arrival_time is distinct from late_arrival_time_value then
    insert into public.ground_session_attendance_revisions (
      ground_session_id,
      student_id,
      old_status,
      new_status,
      old_late_arrival_time,
      new_late_arrival_time,
      reason,
      changed_by
    ) values (
      target_session_id,
      target_student_id,
      current_row.attendance_status,
      normalized_status,
      current_row.late_arrival_time,
      late_arrival_time_value,
      nullif(btrim(correction_reason), ''),
      actor_id
    );
  end if;

  perform public.write_audit_log(
    'GROUND_SESSION_ATTENDANCE_UPDATED', 'ground_session', target_session_id,
    case when current_row.id is null then null else to_jsonb(current_row) end,
    jsonb_build_object(
      'student_id', target_student_id,
      'attendance_status', normalized_status,
      'late_arrival_time', late_arrival_time_value
    ),
    jsonb_build_object('reason', nullif(btrim(correction_reason), ''))
  );
end;
$$;


create or replace function public.staff_add_ground_session_comment_v1(
  target_session_id uuid,
  comment_text_value text,
  comment_visibility text default 'INTERNAL'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  normalized_visibility text := upper(btrim(coalesce(comment_visibility, 'INTERNAL')));
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor or Admin access required.';
  end if;

  if comment_text_value is null or btrim(comment_text_value) = '' then
    raise exception 'Comment cannot be empty.';
  end if;

  if normalized_visibility not in ('INTERNAL', 'STUDENT_VISIBLE') then
    raise exception 'Invalid comment visibility.';
  end if;

  if not exists (select 1 from public.ground_sessions where id = target_session_id) then
    raise exception 'Ground Session not found.';
  end if;

  insert into public.ground_session_comments (
    ground_session_id, comment_text, visibility, created_by
  ) values (
    target_session_id, btrim(comment_text_value), normalized_visibility, auth.uid()
  ) returning id into new_id;

  perform public.write_audit_log(
    'GROUND_SESSION_COMMENT_ADDED', 'ground_session_comment', new_id,
    null,
    jsonb_build_object('ground_session_id', target_session_id, 'visibility', normalized_visibility),
    '{}'::jsonb
  );

  return new_id;
end;
$$;


create or replace function public.staff_add_ground_student_comment_v1(
  target_session_id uuid,
  target_student_id uuid,
  comment_text_value text,
  comment_visibility text default 'INTERNAL'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  normalized_visibility text := upper(btrim(coalesce(comment_visibility, 'INTERNAL')));
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor or Admin access required.';
  end if;

  if comment_text_value is null or btrim(comment_text_value) = '' then
    raise exception 'Comment cannot be empty.';
  end if;

  if normalized_visibility not in ('INTERNAL', 'STUDENT_VISIBLE') then
    raise exception 'Invalid comment visibility.';
  end if;

  if not exists (
    select 1 from public.ground_session_roster r
    where r.ground_session_id = target_session_id
      and r.student_id = target_student_id
  ) then
    raise exception 'Student is not on this Ground Session roster.';
  end if;

  insert into public.ground_session_student_comments (
    ground_session_id, student_id, comment_text, visibility, created_by
  ) values (
    target_session_id, target_student_id, btrim(comment_text_value), normalized_visibility, auth.uid()
  ) returning id into new_id;

  perform public.write_audit_log(
    'GROUND_STUDENT_COMMENT_ADDED', 'ground_student_comment', new_id,
    null,
    jsonb_build_object(
      'ground_session_id', target_session_id,
      'student_id', target_student_id,
      'visibility', normalized_visibility
    ), '{}'::jsonb
  );

  return new_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- 10) SESSION MATERIAL LINKS
-- ---------------------------------------------------------------------------

create or replace function public.staff_attach_ground_session_file_v1(
  target_session_id uuid,
  target_file_id uuid,
  material_label text
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
    raise exception 'Instructor or Admin access required.';
  end if;

  if not exists (select 1 from public.ground_sessions where id = target_session_id) then
    raise exception 'Ground Session not found.';
  end if;

  if not exists (
    select 1 from public.files f
    where f.id = target_file_id and not f.is_deleted
  ) then
    raise exception 'File not found.';
  end if;

  insert into public.ground_session_materials (
    ground_session_id, file_id, display_label, attached_by
  ) values (
    target_session_id, target_file_id, nullif(btrim(material_label), ''), auth.uid()
  )
  on conflict (ground_session_id, file_id)
  do update set display_label = excluded.display_label
  returning id into new_id;

  perform public.write_audit_log(
    'GROUND_SESSION_FILE_ATTACHED', 'ground_session', target_session_id,
    null,
    jsonb_build_object('file_id', target_file_id, 'material_label', nullif(btrim(material_label), '')),
    '{}'::jsonb
  );

  return new_id;
end;
$$;


create or replace function public.staff_detach_ground_session_file_v1(
  target_session_id uuid,
  target_file_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_approved_user()
     or not (public.is_admin() or public.is_instructor()) then
    raise exception 'Instructor or Admin access required.';
  end if;

  delete from public.ground_session_materials
  where ground_session_id = target_session_id
    and file_id = target_file_id;

  perform public.write_audit_log(
    'GROUND_SESSION_FILE_DETACHED', 'ground_session', target_session_id,
    jsonb_build_object('file_id', target_file_id), null, '{}'::jsonb
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- 11) REMINDER DISPATCH
--
-- This function is intentionally idempotent. For now it can be invoked by
-- AeroPath when an approved user opens/refreshes the app. M026 may attach it
-- to a scheduled Supabase job and mirror the same event to email.
-- ---------------------------------------------------------------------------

create or replace function public.dispatch_ground_session_reminders_v1()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder_row record;
  sent_count integer := 0;
  session_label text;
  location_label text;
begin
  if not public.is_approved_user() then
    raise exception 'Approved AeroPath account required.';
  end if;

  for reminder_row in
    select r.*, gs.ground_class_id, gs.starts_at, gs.classroom_id, gs.custom_location,
           gc.title as class_title, cr.name as classroom_name, cr.physical_location
    from public.ground_session_reminders r
    join public.ground_sessions gs on gs.id = r.ground_session_id
    join public.ground_classes gc on gc.id = gs.ground_class_id
    left join public.ground_classrooms cr on cr.id = gs.classroom_id
    where r.sent_at is null
      and r.scheduled_for <= now()
      and gs.starts_at > now()
      and gs.status = 'SCHEDULED'
    order by r.scheduled_for
    for update of r skip locked
  loop
    session_label := reminder_row.class_title;
    location_label := coalesce(
      reminder_row.classroom_name ||
        case when reminder_row.physical_location is not null
             then ' — ' || reminder_row.physical_location else '' end,
      reminder_row.custom_location,
      'Location TBA'
    );

    perform public.create_notification(
      reminder_row.user_id,
      'GROUND_CLASS_24H_REMINDER',
      'Ground class tomorrow',
      session_label || ' — ' ||
        to_char(reminder_row.starts_at at time zone 'Asia/Singapore', 'DD Mon YYYY HH24:MI') ||
        ' — ' || location_label,
      null,
      null
    );

    update public.ground_session_reminders
    set sent_at = now()
    where id = reminder_row.id;

    sent_count := sent_count + 1;
  end loop;

  return sent_count;
end;
$$;


-- ---------------------------------------------------------------------------
-- 12) LIST / DETAIL / PROGRESS RPCs
-- ---------------------------------------------------------------------------

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
        and gc.status <> 'DRAFT'
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


create or replace function public.get_ground_session_detail_v1(
  target_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gs public.ground_sessions%rowtype;
  gc public.ground_classes%rowtype;
  staff_view boolean;
  student_view boolean;
begin
  if not public.is_approved_user() then
    raise exception 'Approved AeroPath account required.';
  end if;

  select * into gs from public.ground_sessions where id = target_session_id;
  if not found then raise exception 'Ground Session not found.'; end if;

  select * into gc from public.ground_classes where id = gs.ground_class_id;

  staff_view := public.is_admin() or public.is_instructor();
  student_view := public.is_student() and exists (
    select 1 from public.ground_class_enrolments e
    where e.ground_class_id = gc.id
      and e.student_id = auth.uid()
      and e.status = 'ENROLLED'
  );

  if not (staff_view or student_view) then
    raise exception 'You are not authorised to view this Ground Session.';
  end if;

  return jsonb_build_object(
    'session', (
      select jsonb_build_object(
        'id', x.ground_session_id,
        'ground_class_id', x.ground_class_id,
        'class_title', x.class_title,
        'class_subject', x.class_subject,
        'programme_id', x.programme_id,
        'programme_name', x.programme_name,
        'scheduled_instructor_id', x.scheduled_instructor_id,
        'scheduled_instructor_name', x.scheduled_instructor_name,
        'conducted_by_id', x.conducted_by_id,
        'conducted_by_name', x.conducted_by_name,
        'starts_at', x.starts_at,
        'ends_at', x.ends_at,
        'classroom_id', x.classroom_id,
        'classroom_name', x.classroom_name,
        'physical_location', x.physical_location,
        'custom_location', x.custom_location,
        'display_location', x.display_location,
        'status', x.session_status,
        'can_start', x.can_start,
        'can_manage', x.can_manage
      )
      from public.list_ground_sessions_v1(null, null, gc.id) x
      where x.ground_session_id = target_session_id
    ),
    'roster', case when staff_view then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'student_id', r.student_id,
        'student_name', coalesce(p.display_name, p.full_name, p.email),
        'student_email', p.email,
        'attendance_status', coalesce(a.attendance_status, 'PENDING'),
        'late_arrival_time', a.late_arrival_time,
        'marked_at', a.marked_at
      ) order by lower(coalesce(p.display_name, p.full_name, p.email))), '[]'::jsonb)
      from public.ground_session_roster r
      join public.profiles p on p.id = r.student_id
      left join public.ground_session_attendance a
        on a.ground_session_id = r.ground_session_id
       and a.student_id = r.student_id
      where r.ground_session_id = target_session_id
    ) else '[]'::jsonb end,
    'class_comments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'comment_id', c.id,
        'comment_text', c.comment_text,
        'visibility', c.visibility,
        'created_by', c.created_by,
        'created_by_name', coalesce(p.display_name, p.full_name, p.email),
        'created_at', c.created_at
      ) order by c.created_at), '[]'::jsonb)
      from public.ground_session_comments c
      join public.profiles p on p.id = c.created_by
      where c.ground_session_id = target_session_id
        and (staff_view or c.visibility = 'STUDENT_VISIBLE')
    ),
    'student_comments', case when staff_view then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'comment_id', c.id,
        'student_id', c.student_id,
        'student_name', coalesce(sp.display_name, sp.full_name, sp.email),
        'comment_text', c.comment_text,
        'visibility', c.visibility,
        'created_by_name', coalesce(cp.display_name, cp.full_name, cp.email),
        'created_at', c.created_at
      ) order by c.created_at), '[]'::jsonb)
      from public.ground_session_student_comments c
      join public.profiles sp on sp.id = c.student_id
      join public.profiles cp on cp.id = c.created_by
      where c.ground_session_id = target_session_id
    ) else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'comment_id', c.id,
        'comment_text', c.comment_text,
        'visibility', c.visibility,
        'created_at', c.created_at
      ) order by c.created_at), '[]'::jsonb)
      from public.ground_session_student_comments c
      where c.ground_session_id = target_session_id
        and c.student_id = auth.uid()
        and c.visibility = 'STUDENT_VISIBLE'
    ) end,
    'session_files', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'material_id', m.id,
        'file_id', f.id,
        'file_name', f.file_name,
        'display_label', m.display_label,
        'description', f.description,
        'mime_type', f.mime_type,
        'file_size', f.file_size,
        'storage_path', f.storage_path
      ) order by m.attached_at), '[]'::jsonb)
      from public.ground_session_materials m
      join public.files f on f.id = m.file_id
      where m.ground_session_id = target_session_id
        and not f.is_deleted
    )
  );
end;
$$;


create or replace function public.list_student_ground_progress_v1(
  target_student_id uuid default null
)
returns table (
  programme_id uuid,
  programme_name text,
  scheduled_sessions bigint,
  completed_sessions bigint,
  present_sessions bigint,
  late_sessions bigint,
  absent_sessions bigint,
  excused_sessions bigint,
  upcoming_sessions bigint,
  attendance_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_student_id uuid := coalesce(target_student_id, auth.uid());
begin
  if not public.is_approved_user() then
    raise exception 'Approved AeroPath account required.';
  end if;

  if resolved_student_id <> auth.uid()
     and not (public.is_admin() or public.is_instructor()) then
    raise exception 'You are not authorised to view this student.';
  end if;

  return query
  with enrolled_classes as (
    select e.ground_class_id, gc.programme_id
    from public.ground_class_enrolments e
    join public.ground_classes gc on gc.id = e.ground_class_id
    where e.student_id = resolved_student_id
      and e.status = 'ENROLLED'
  ), sessions as (
    select gs.*, ec.programme_id
    from enrolled_classes ec
    join public.ground_sessions gs on gs.ground_class_id = ec.ground_class_id
    where gs.status <> 'CANCELLED'
  ), attendance as (
    select a.*
    from public.ground_session_attendance a
    where a.student_id = resolved_student_id
  )
  select
    p.id,
    p.name,
    count(s.id)::bigint,
    count(s.id) filter (where s.status = 'COMPLETED')::bigint,
    count(s.id) filter (where a.attendance_status = 'PRESENT')::bigint,
    count(s.id) filter (where a.attendance_status = 'LATE')::bigint,
    count(s.id) filter (where a.attendance_status = 'ABSENT')::bigint,
    count(s.id) filter (where a.attendance_status = 'EXCUSED')::bigint,
    count(s.id) filter (where s.status = 'SCHEDULED' and s.starts_at > now())::bigint,
    case
      when count(s.id) filter (where s.status = 'COMPLETED') > 0 then
        round(
          100.0 * count(s.id) filter (where a.attendance_status in ('PRESENT', 'LATE'))
          / nullif(count(s.id) filter (where s.status = 'COMPLETED'), 0),
          1
        )
      else 0::numeric
    end
  from public.training_programmes p
  join sessions s on s.programme_id = p.id
  left join attendance a on a.ground_session_id = s.id
  group by p.id, p.name
  order by lower(p.name);
end;
$$;


create or replace function public.list_student_ground_timeline_v1(
  target_student_id uuid default null
)
returns table (
  occurred_at timestamptz,
  event_type text,
  title text,
  subtitle text,
  status text,
  score_percent numeric,
  comment_text text,
  internal boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_student_id uuid := coalesce(target_student_id, auth.uid());
  staff_view boolean := public.is_admin() or public.is_instructor();
begin
  if not public.is_approved_user() then
    raise exception 'Approved AeroPath account required.';
  end if;

  if resolved_student_id <> auth.uid() and not staff_view then
    raise exception 'You are not authorised to view this student.';
  end if;

  return query
  select *
  from (
    select
      coalesce(gs.completed_at, gs.starts_at) as occurred_at,
      'GROUND_SESSION'::text as event_type,
      gc.title::text as title,
      coalesce(tp.name, gc.subject, 'Ground School')::text as subtitle,
      coalesce(a.attendance_status, gs.status)::text as status,
      null::numeric as score_percent,
      null::text as comment_text,
      false as internal
    from public.ground_class_enrolments e
    join public.ground_classes gc on gc.id = e.ground_class_id
    join public.ground_sessions gs on gs.ground_class_id = gc.id
    left join public.training_programmes tp on tp.id = gc.programme_id
    left join public.ground_session_attendance a
      on a.ground_session_id = gs.id and a.student_id = resolved_student_id
    where e.student_id = resolved_student_id and e.status = 'ENROLLED'

    union all

    select
      c.created_at,
      'GROUND_STUDENT_COMMENT',
      gc.title,
      case when c.visibility = 'INTERNAL' then 'Internal note' else 'Student feedback' end,
      null::text,
      null::numeric,
      c.comment_text,
      (c.visibility = 'INTERNAL')
    from public.ground_session_student_comments c
    join public.ground_sessions gs on gs.id = c.ground_session_id
    join public.ground_classes gc on gc.id = gs.ground_class_id
    where c.student_id = resolved_student_id
      and (staff_view or c.visibility = 'STUDENT_VISIBLE')

    union all

    select
      coalesce(a.submitted_at, a.started_at),
      'TEST_ATTEMPT',
      t.title,
      'Knowledge Test',
      case when a.passed is true then 'PASS'
           when a.passed is false then 'FAIL'
           else a.status end,
      a.percentage,
      case when a.result_released then a.overall_feedback else null end,
      false
    from public.knowledge_test_attempts a
    join public.knowledge_test_assignments ka on ka.id = a.assignment_id
    join public.knowledge_tests t on t.id = ka.test_id
    where a.student_id = resolved_student_id
  ) q
  order by occurred_at desc nulls last;
end;
$$;


-- ---------------------------------------------------------------------------
-- 13) REFRESH REMINDERS WHEN ENROLMENT CHANGES
-- ---------------------------------------------------------------------------

create or replace function public.refresh_ground_class_reminders_v1(
  target_class_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  for s in
    select id from public.ground_sessions
    where ground_class_id = target_class_id and status = 'SCHEDULED'
  loop
    perform public.refresh_ground_session_reminder_recipients_v1(s.id);
  end loop;
end;
$$;

create or replace function public.assert_ground_student_enrolment_clear_v1(
  target_class_id uuid,
  target_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_session record;
begin
  for target_session in
    select gs.id, gs.starts_at, gs.ends_at
    from public.ground_sessions gs
    where gs.ground_class_id = target_class_id
      and gs.status <> 'CANCELLED'
  loop
    if exists (
      select 1
      from public.bookings b
      where b.student_id = target_student_id
        and b.deleted_at is null
        and b.status = 'APPROVED'::public.booking_status
        and b.approved_start is not null
        and b.approved_end is not null
        and tstzrange(b.approved_start, b.approved_end, '[)')
            && tstzrange(target_session.starts_at, target_session.ends_at, '[)')
    ) then
      raise exception 'Student has an approved operational booking that conflicts with this Ground Class schedule.';
    end if;

    if exists (
      select 1
      from public.ground_class_enrolments e
      join public.ground_sessions other_gs
        on other_gs.ground_class_id = e.ground_class_id
      where e.student_id = target_student_id
        and e.status = 'ENROLLED'
        and e.ground_class_id <> target_class_id
        and other_gs.status <> 'CANCELLED'
        and tstzrange(other_gs.starts_at, other_gs.ends_at, '[)')
            && tstzrange(target_session.starts_at, target_session.ends_at, '[)')
    ) then
      raise exception 'Student is already enrolled in another Ground Session during this time.';
    end if;
  end loop;
end;
$$;

-- Wrap existing enrolment RPCs so conflicts are checked and 24-hour reminder
-- recipients stay synchronized.
create or replace function public.admin_enrol_ground_class_students_v2(
  target_class_id uuid,
  target_student_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  result integer;
  student_id_value uuid;
begin
  if not public.is_approved_admin() then
    raise exception 'Admin or Safety Manager access required.';
  end if;

  if target_student_ids is null or cardinality(target_student_ids) = 0 then
    raise exception 'Select at least one student.';
  end if;

  foreach student_id_value in array target_student_ids loop
    perform public.assert_ground_student_enrolment_clear_v1(target_class_id, student_id_value);
  end loop;

  result := public.admin_enrol_ground_class_students_v1(target_class_id, target_student_ids);
  perform public.refresh_ground_class_reminders_v1(target_class_id);
  return result;
end;
$$;

create or replace function public.admin_enrol_ground_class_programme_v2(
  target_class_id uuid,
  target_programme_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  student_ids uuid[];
begin
  if not public.is_approved_admin() then
    raise exception 'Admin or Safety Manager access required.';
  end if;

  select coalesce(array_agg(a.student_id), '{}'::uuid[])
  into student_ids
  from public.student_programme_assignments a
  join public.profiles p on p.id = a.student_id
  where a.programme_id = target_programme_id
    and a.active
    and p.account_status = 'APPROVED'::public.account_status
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = a.student_id
        and ur.role = 'STUDENT'::public.app_role
    );

  if cardinality(student_ids) = 0 then
    return 0;
  end if;

  return public.admin_enrol_ground_class_students_v2(target_class_id, student_ids);
end;
$$;

create or replace function public.admin_withdraw_ground_class_student_v2(
  target_class_id uuid,
  target_student_id uuid,
  reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_withdraw_ground_class_student_v1(target_class_id, target_student_id, reason);
  perform public.refresh_ground_class_reminders_v1(target_class_id);
end;
$$;


-- ---------------------------------------------------------------------------
-- 14) RLS / GRANTS
-- ---------------------------------------------------------------------------

alter table public.ground_classrooms enable row level security;
alter table public.ground_sessions enable row level security;
alter table public.ground_session_roster enable row level security;
alter table public.ground_session_attendance enable row level security;
alter table public.ground_session_attendance_revisions enable row level security;
alter table public.ground_session_comments enable row level security;
alter table public.ground_session_student_comments enable row level security;
alter table public.ground_session_materials enable row level security;
alter table public.ground_session_reminders enable row level security;

-- RPCs are the intended mutation path. Read access is conservative.
drop policy if exists ground_classrooms_select on public.ground_classrooms;
create policy ground_classrooms_select
on public.ground_classrooms for select to authenticated
using (public.is_approved_user());

drop policy if exists ground_sessions_select on public.ground_sessions;
create policy ground_sessions_select
on public.ground_sessions for select to authenticated
using (
  public.is_approved_admin()
  or (public.is_instructor() and public.is_approved_user())
  or exists (
    select 1
    from public.ground_class_enrolments e
    where e.ground_class_id = ground_sessions.ground_class_id
      and e.student_id = auth.uid()
      and e.status = 'ENROLLED'
  )
);

drop policy if exists ground_session_roster_select on public.ground_session_roster;
create policy ground_session_roster_select
on public.ground_session_roster for select to authenticated
using (
  public.is_approved_admin()
  or (public.is_instructor() and public.is_approved_user())
  or student_id = auth.uid()
);

drop policy if exists ground_session_attendance_select on public.ground_session_attendance;
create policy ground_session_attendance_select
on public.ground_session_attendance for select to authenticated
using (
  public.is_approved_admin()
  or (public.is_instructor() and public.is_approved_user())
  or student_id = auth.uid()
);

drop policy if exists ground_session_comments_select on public.ground_session_comments;
create policy ground_session_comments_select
on public.ground_session_comments for select to authenticated
using (
  public.is_approved_admin()
  or (public.is_instructor() and public.is_approved_user())
  or visibility = 'STUDENT_VISIBLE'
);

drop policy if exists ground_session_student_comments_select on public.ground_session_student_comments;
create policy ground_session_student_comments_select
on public.ground_session_student_comments for select to authenticated
using (
  public.is_approved_admin()
  or (public.is_instructor() and public.is_approved_user())
  or (student_id = auth.uid() and visibility = 'STUDENT_VISIBLE')
);

drop policy if exists ground_session_materials_select on public.ground_session_materials;
create policy ground_session_materials_select
on public.ground_session_materials for select to authenticated
using (public.is_approved_user());

-- Internal audit/reminder tables are not directly exposed to normal reads.
revoke all on public.ground_session_attendance_revisions from anon, authenticated;
revoke all on public.ground_session_reminders from anon, authenticated;

-- Function grants. Apply by exact regprocedure so signatures are preserved.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_create_ground_class_v2',
        'admin_update_ground_class_v2',
        'admin_publish_ground_class_v2',
        'list_ground_classes_v2',
        'list_ground_classrooms_v1',
        'admin_save_ground_classroom_v1',
        'admin_create_ground_session_v1',
        'admin_update_ground_session_v1',
        'admin_cancel_ground_session_v1',
        'staff_start_ground_session_v1',
        'staff_complete_ground_session_v1',
        'staff_mark_ground_session_attendance_v1',
        'staff_add_ground_session_comment_v1',
        'staff_add_ground_student_comment_v1',
        'staff_attach_ground_session_file_v1',
        'staff_detach_ground_session_file_v1',
        'dispatch_ground_session_reminders_v1',
        'list_ground_sessions_v1',
        'get_ground_session_detail_v1',
        'list_student_ground_progress_v1',
        'list_student_ground_timeline_v1',
        'admin_enrol_ground_class_students_v2',
        'admin_enrol_ground_class_programme_v2',
        'admin_withdraw_ground_class_student_v2'
      )
  loop
    execute format('revoke all on function %s from public', fn.signature);
    execute format('grant execute on function %s to authenticated', fn.signature);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 15) VERIFICATION
-- ---------------------------------------------------------------------------

select jsonb_build_object(
  'migration', '024B',
  'ground_class_is_container', true,
  'ground_sessions_table', to_regclass('public.ground_sessions') is not null,
  'classrooms_table', to_regclass('public.ground_classrooms') is not null,
  'seeded_classrooms', (
    select coalesce(jsonb_agg(name order by name), '[]'::jsonb)
    from public.ground_classrooms
    where lower(name) in ('aero 01','aero 02','aero 03','aero 04')
  ),
  'per_session_attendance', to_regclass('public.ground_session_attendance') is not null,
  'attendance_revision_history', to_regclass('public.ground_session_attendance_revisions') is not null,
  'roster_snapshot', to_regclass('public.ground_session_roster') is not null,
  'class_comments', to_regclass('public.ground_session_comments') is not null,
  'student_internal_notes', to_regclass('public.ground_session_student_comments') is not null,
  'class_materials_preserved', to_regclass('public.ground_class_materials') is not null,
  'session_materials', to_regclass('public.ground_session_materials') is not null,
  'fixed_reminder_hours', 24,
  'reminder_tracking', to_regclass('public.ground_session_reminders') is not null,
  'ordinary_instructor_cross_session_guard', true,
  'classroom_conflict_protection', true,
  'instructor_schedule_conflict_protection', true,
  'student_schedule_conflict_protection', true,
  'legacy_ground_class_attendance_preserved', to_regclass('public.ground_class_attendance') is not null,
  'existing_booking_session_rules_changed', false,
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'arguments', pg_get_function_identity_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef
    ) order by p.proname), '[]'::jsonb)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_create_ground_session_v1',
        'admin_update_ground_session_v1',
        'staff_start_ground_session_v1',
        'staff_complete_ground_session_v1',
        'staff_mark_ground_session_attendance_v1',
        'list_ground_sessions_v1',
        'get_ground_session_detail_v1',
        'dispatch_ground_session_reminders_v1',
        'list_student_ground_progress_v1',
        'list_student_ground_timeline_v1'
      )
  )
) as migration_024b_verification;

commit;
