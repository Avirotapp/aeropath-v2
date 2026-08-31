-- ============================================================
-- AEROPATH V2
-- MIGRATION 025
-- TRAINING RESOURCES / AIRCRAFT
--
-- Compatibility strategy:
--   The deployed `simulators` table and `simulator_id` foreign-key
--   columns are retained as stable storage identifiers. They now hold
--   either a SIMULATOR or AIRCRAFT resource. New RPCs expose generic
--   resource names, so existing simulator history and functions remain
--   valid while all new UI is resource-aware.
-- ============================================================

reset role;

begin;

-- ============================================================
-- 1. RESOURCE CLASSIFICATION
-- ============================================================

alter table public.simulators
  add column if not exists resource_type text;

alter table public.simulators
  add column if not exists callsign text;

update public.simulators
set resource_type = 'SIMULATOR'
where resource_type is null;

alter table public.simulators
  alter column resource_type set default 'SIMULATOR',
  alter column resource_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.simulators'::regclass
      and conname = 'simulators_resource_type_check'
  ) then
    alter table public.simulators
      add constraint simulators_resource_type_check
      check (resource_type in ('SIMULATOR', 'AIRCRAFT'));
  end if;
end $$;

create unique index if not exists
  idx_training_resources_callsign_unique
on public.simulators (lower(callsign))
where callsign is not null;

create index if not exists
  idx_training_resources_type_active
on public.simulators (resource_type, active);

comment on column public.simulators.resource_type is
  'M025 training-resource discriminator. SIMULATOR preserves legacy rows; AIRCRAFT enables flight bookings and sessions.';

comment on column public.simulators.callsign is
  'Optional operational callsign, primarily used by aircraft resources.';

create or replace view public.training_resources
with (security_invoker = true)
as
select
  id as resource_id,
  resource_type,
  name,
  type,
  identifier,
  callsign,
  description,
  active,
  created_at,
  updated_at
from public.simulators;

comment on view public.training_resources is
  'Canonical M025 read model for simulator and aircraft training resources. The legacy simulators table remains the compatibility storage layer.';

-- ============================================================
-- 2. TRAINING MODE ON IMMUTABLE RECORDS
-- ============================================================

alter table public.training_records
  add column if not exists training_mode text
  default 'SIMULATOR';

alter table public.training_record_versions
  add column if not exists training_mode text
  default 'SIMULATOR';

-- Completed training records are protected by the existing immutable-record
-- trigger. This one-time owner migration must classify historical rows without
-- weakening that application rule. USER triggers are disabled only inside this
-- transaction, then immediately restored before constraints/RPCs are installed.

alter table public.training_records
  disable trigger user;

update public.training_records tr
set training_mode = case
  when r.resource_type = 'AIRCRAFT' then 'FLIGHT'
  else 'SIMULATOR'
end
from public.sessions s
join public.simulators r on r.id = s.simulator_id
where s.id = tr.session_id
  and tr.training_mode is null;

update public.training_records
set training_mode = 'SIMULATOR'
where training_mode is null;

alter table public.training_records
  enable trigger user;

alter table public.training_record_versions
  disable trigger user;

update public.training_record_versions trv
set training_mode = tr.training_mode
from public.training_records tr
where tr.id = trv.training_record_id
  and trv.training_mode is null;

update public.training_record_versions
set training_mode = 'SIMULATOR'
where training_mode is null;

alter table public.training_record_versions
  enable trigger user;

alter table public.training_records
  alter column training_mode set default 'SIMULATOR',
  alter column training_mode set not null;

alter table public.training_record_versions
  alter column training_mode set default 'SIMULATOR',
  alter column training_mode set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.training_records'::regclass
      and conname = 'training_records_mode_check'
  ) then
    alter table public.training_records
      add constraint training_records_mode_check
      check (training_mode in ('SIMULATOR', 'FLIGHT'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.training_record_versions'::regclass
      and conname = 'training_record_versions_mode_check'
  ) then
    alter table public.training_record_versions
      add constraint training_record_versions_mode_check
      check (training_mode in ('SIMULATOR', 'FLIGHT'));
  end if;
end $$;

create or replace function public.set_training_record_mode_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resource_type text;
begin
  select r.resource_type
  into v_resource_type
  from public.sessions s
  join public.simulators r on r.id = s.simulator_id
  where s.id = new.session_id;

  if v_resource_type is null then
    raise exception 'Training resource for session was not found.'
      using errcode = 'P0002';
  end if;

  new.training_mode := case
    when v_resource_type = 'AIRCRAFT' then 'FLIGHT'
    else 'SIMULATOR'
  end;

  return new;
end;
$$;

drop trigger if exists trg_set_training_record_mode_v1
on public.training_records;

create trigger trg_set_training_record_mode_v1
before insert or update of session_id, training_mode
on public.training_records
for each row
execute function public.set_training_record_mode_v1();

create or replace function public.set_training_record_version_mode_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_training_mode text;
begin
  select tr.training_mode
  into v_training_mode
  from public.training_records tr
  where tr.id = new.training_record_id;

  if v_training_mode is null then
    raise exception 'Parent training record was not found.'
      using errcode = 'P0002';
  end if;

  new.training_mode := v_training_mode;

  return new;
end;
$$;

drop trigger if exists trg_set_training_record_version_mode_v1
on public.training_record_versions;

create trigger trg_set_training_record_version_mode_v1
before insert or update of training_record_id, training_mode
on public.training_record_versions
for each row
execute function public.set_training_record_version_mode_v1();

-- ============================================================
-- 3. GENERIC APPROVED-BOOKING CONFLICT PROTECTION
-- ============================================================

create or replace function public.enforce_approved_booking_conflicts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conflict_id uuid;
begin
  if new.status <> 'APPROVED' then
    return new;
  end if;

  if new.simulator_id is null then
    raise exception 'Approved booking must have a training resource.'
      using errcode = '22023';
  end if;

  if new.approved_start is null
     or new.approved_end is null
     or new.approved_end <= new.approved_start then
    raise exception 'Approved booking must have a valid approved time window.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(8700025);

  select b.id
  into v_conflict_id
  from public.bookings b
  where b.id <> new.id
    and b.status = 'APPROVED'
    and b.simulator_id = new.simulator_id
    and b.approved_start < new.approved_end
    and b.approved_end > new.approved_start
  order by b.approved_start
  limit 1;

  if v_conflict_id is not null then
    raise exception 'Training resource conflict: this resource already has an approved booking during that time.'
      using
        errcode = '23P01',
        detail = format('Conflicting booking ID: %s', v_conflict_id),
        hint = 'Choose a non-overlapping time or another training resource.';
  end if;

  if new.assigned_instructor_id is not null then
    v_conflict_id := null;

    select b.id
    into v_conflict_id
    from public.bookings b
    where b.id <> new.id
      and b.status = 'APPROVED'
      and b.assigned_instructor_id = new.assigned_instructor_id
      and b.approved_start < new.approved_end
      and b.approved_end > new.approved_start
    order by b.approved_start
    limit 1;

    if v_conflict_id is not null then
      raise exception 'Instructor conflict: this instructor already has an approved booking during that time.'
        using
          errcode = '23P01',
          detail = format('Conflicting booking ID: %s', v_conflict_id),
          hint = 'Choose a non-overlapping time or another instructor.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_approved_booking_conflicts() is
  'M025 generic booking guard. Prevents overlapping APPROVED training-resource and instructor reservations.';

-- ============================================================
-- 4. RESOURCE CATALOGUE RPCS
-- ============================================================

create or replace function public.list_training_resource_catalog_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_approved_user() then
    raise exception 'Approved AeroPath account required.'
      using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'resource_id', r.id,
        'resource_type', r.resource_type,
        'name', r.name,
        'type', r.type,
        'identifier', r.identifier,
        'callsign', r.callsign,
        'description', r.description,
        'active', r.active
      ) order by r.resource_type, r.name, r.identifier
    )
    from public.simulators r
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_active_training_resources_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_approved_user() then
    raise exception 'Approved AeroPath account required.'
      using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'resource_id', r.id,
        'resource_type', r.resource_type,
        'name', r.name,
        'type', r.type,
        'identifier', r.identifier,
        'callsign', r.callsign,
        'description', r.description,
        'active', r.active
      ) order by r.resource_type, r.name, r.identifier
    )
    from public.simulators r
    where r.active = true
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_training_resources_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or not public.is_approved_user()
     or not public.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(row_data) order by row_data.resource_type, row_data.name)
    from (
      select
        r.id as resource_id,
        r.resource_type,
        r.name,
        r.type,
        r.identifier,
        r.callsign,
        r.description,
        r.active,
        r.created_at,
        r.updated_at,
        count(distinct b.id) filter (
          where b.status = 'APPROVED'
            and b.approved_end > now()
        )::integer as future_approved_bookings,
        count(distinct s.id) filter (
          where s.status = 'IN_PROGRESS'
        )::integer as in_progress_sessions,
        count(distinct s.id)::integer as total_sessions
      from public.simulators r
      left join public.bookings b on b.simulator_id = r.id
      left join public.sessions s on s.simulator_id = r.id
      group by r.id
    ) row_data
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_create_training_resource_v1(
  requested_resource_type text,
  resource_name text,
  resource_model text,
  resource_identifier text,
  resource_callsign text default null,
  resource_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_type text := upper(trim(requested_resource_type));
begin
  if auth.uid() is null
     or not public.is_approved_user()
     or not public.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  if v_type is null or v_type not in ('SIMULATOR', 'AIRCRAFT') then
    raise exception 'Resource type must be SIMULATOR or AIRCRAFT.'
      using errcode = '22023';
  end if;

  if nullif(trim(resource_name), '') is null
     or nullif(trim(resource_model), '') is null
     or nullif(trim(resource_identifier), '') is null then
    raise exception 'Name, model/type and identifier are required.'
      using errcode = '22023';
  end if;

  insert into public.simulators (
    resource_type,
    name,
    type,
    identifier,
    callsign,
    description,
    active,
    created_at,
    updated_at
  ) values (
    v_type,
    trim(resource_name),
    trim(resource_model),
    upper(trim(resource_identifier)),
    nullif(upper(trim(resource_callsign)), ''),
    nullif(trim(resource_description), ''),
    true,
    now(),
    now()
  )
  returning id into v_id;

  perform public.write_audit_log(
    'TRAINING_RESOURCE_CREATED',
    'training_resource',
    v_id,
    null,
    jsonb_build_object(
      'resource_type', v_type,
      'name', trim(resource_name),
      'identifier', upper(trim(resource_identifier))
    )
  );

  return v_id;
exception
  when unique_violation then
    raise exception 'That identifier or callsign is already in use.'
      using errcode = '23505';
end;
$$;

create or replace function public.admin_update_training_resource_v1(
  target_resource_id uuid,
  requested_resource_type text,
  resource_name text,
  resource_model text,
  resource_identifier text,
  resource_callsign text,
  resource_description text,
  resource_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.simulators%rowtype;
  v_type text := upper(trim(requested_resource_type));
begin
  if auth.uid() is null
     or not public.is_approved_user()
     or not public.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select * into v_old
  from public.simulators
  where id = target_resource_id
  for update;

  if not found then
    raise exception 'Training resource not found.' using errcode = 'P0002';
  end if;

  if v_type is null or v_type not in ('SIMULATOR', 'AIRCRAFT') then
    raise exception 'Resource type must be SIMULATOR or AIRCRAFT.'
      using errcode = '22023';
  end if;

  if nullif(trim(resource_name), '') is null
     or nullif(trim(resource_model), '') is null
     or nullif(trim(resource_identifier), '') is null then
    raise exception 'Name, model/type and identifier are required.'
      using errcode = '22023';
  end if;

  if v_type <> v_old.resource_type
     and exists (
       select 1 from public.bookings b
       where b.simulator_id = target_resource_id
     ) then
    raise exception 'Resource type cannot be changed after booking history exists.'
      using errcode = '23514';
  end if;

  if resource_active = false and v_old.active = true then
    if exists (
      select 1 from public.bookings b
      where b.simulator_id = target_resource_id
        and b.status = 'APPROVED'
        and b.approved_end > now()
    ) then
      raise exception 'Resource has a future approved booking and cannot be deactivated.'
        using errcode = '23514';
    end if;

    if exists (
      select 1 from public.sessions s
      where s.simulator_id = target_resource_id
        and s.status = 'IN_PROGRESS'
    ) then
      raise exception 'Resource has an in-progress session and cannot be deactivated.'
        using errcode = '23514';
    end if;
  end if;

  update public.simulators
  set
    resource_type = v_type,
    name = trim(resource_name),
    type = trim(resource_model),
    identifier = upper(trim(resource_identifier)),
    callsign = nullif(upper(trim(resource_callsign)), ''),
    description = nullif(trim(resource_description), ''),
    active = resource_active,
    updated_at = now()
  where id = target_resource_id;

  perform public.write_audit_log(
    'TRAINING_RESOURCE_UPDATED',
    'training_resource',
    target_resource_id,
    to_jsonb(v_old),
    jsonb_build_object(
      'resource_type', v_type,
      'name', trim(resource_name),
      'identifier', upper(trim(resource_identifier)),
      'callsign', nullif(upper(trim(resource_callsign)), ''),
      'active', resource_active
    )
  );

  return target_resource_id;
exception
  when unique_violation then
    raise exception 'That identifier or callsign is already in use.'
      using errcode = '23505';
end;
$$;

-- ============================================================
-- 5. RESOURCE-AWARE BOOKING RPCS
-- ============================================================

create or replace function public.student_request_training_booking_v1(
  requested_resource_id uuid,
  requested_instructor_id uuid,
  requested_start_time timestamptz,
  requested_end_time timestamptz,
  booking_purpose text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or not public.is_approved_user()
     or not public.is_student() then
    raise exception 'Only approved students can request training bookings.'
      using errcode = '42501';
  end if;

  if requested_start_time is null
     or requested_end_time is null
     or requested_end_time <= requested_start_time then
    raise exception 'A valid booking time window is required.'
      using errcode = '22023';
  end if;

  if requested_start_time <= now() then
    raise exception 'Booking must be requested for a future time.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.simulators r
    where r.id = requested_resource_id
      and r.active = true
  ) then
    raise exception 'Selected training resource is unavailable.'
      using errcode = '22023';
  end if;

  return public.request_booking(
    p_simulator_id => requested_resource_id,
    p_requested_start => requested_start_time,
    p_requested_end => requested_end_time,
    p_purpose => nullif(trim(booking_purpose), ''),
    p_assigned_instructor_id => requested_instructor_id
  );
end;
$$;

create or replace function public.student_list_training_bookings_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or not public.is_approved_user()
     or not public.is_student() then
    raise exception 'Only approved students can view student bookings.'
      using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(row_data) order by row_data.requested_start desc)
    from (
      select
        b.id,
        r.id as resource_id,
        r.id as simulator_id,
        r.resource_type,
        r.name as resource_name,
        r.name as simulator_name,
        r.type as resource_model,
        r.identifier as resource_identifier,
        r.callsign as resource_callsign,
        b.assigned_instructor_id,
        instructor.full_name as instructor_name,
        b.requested_start,
        b.requested_end,
        b.approved_start,
        b.approved_end,
        b.status,
        b.purpose,
        b.rejection_reason,
        b.cancellation_reason,
        b.requested_at,
        b.approved_at
      from public.bookings b
      join public.simulators r on r.id = b.simulator_id
      left join public.profiles instructor on instructor.id = b.assigned_instructor_id
      where b.student_id = auth.uid()
        and b.deleted_at is null
    ) row_data
  ), '[]'::jsonb);
end;
$$;

-- ============================================================
-- 6. RESOURCE MAPS FOR DEPLOYED V2 RPC RESULTS
-- ============================================================

create or replace function public.list_visible_session_resources_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_staff boolean;
begin
  if auth.uid() is null or not public.is_approved_user() then
    raise exception 'Approved AeroPath account required.' using errcode = '42501';
  end if;

  v_is_staff := public.is_admin() or public.is_instructor();

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'session_id', s.id,
        'booking_id', s.booking_id,
        'resource_id', r.id,
        'resource_type', r.resource_type,
        'resource_name', r.name,
        'resource_model', r.type,
        'resource_identifier', r.identifier,
        'resource_callsign', r.callsign,
        'training_mode', case when r.resource_type = 'AIRCRAFT' then 'FLIGHT' else 'SIMULATOR' end
      ) order by s.started_at desc
    )
    from public.sessions s
    join public.bookings b on b.id = s.booking_id
    join public.simulators r on r.id = s.simulator_id
    where v_is_staff or b.student_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

-- ============================================================
-- 7. PERMISSIONS
-- ============================================================

revoke all on function public.list_training_resource_catalog_v1() from public;
revoke all on function public.list_active_training_resources_v1() from public;
revoke all on function public.admin_list_training_resources_v1() from public;
revoke all on function public.admin_create_training_resource_v1(text, text, text, text, text, text) from public;
revoke all on function public.admin_update_training_resource_v1(uuid, text, text, text, text, text, text, boolean) from public;
revoke all on function public.student_request_training_booking_v1(uuid, uuid, timestamptz, timestamptz, text) from public;
revoke all on function public.student_list_training_bookings_v1() from public;
revoke all on function public.list_visible_session_resources_v1() from public;

grant execute on function public.list_training_resource_catalog_v1() to authenticated;
grant execute on function public.list_active_training_resources_v1() to authenticated;
grant execute on function public.admin_list_training_resources_v1() to authenticated;
grant execute on function public.admin_create_training_resource_v1(text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_update_training_resource_v1(uuid, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.student_request_training_booking_v1(uuid, uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.student_list_training_bookings_v1() to authenticated;
grant execute on function public.list_visible_session_resources_v1() to authenticated;

comment on function public.student_request_training_booking_v1(uuid, uuid, timestamptz, timestamptz, text) is
  'M025 resource-aware student booking entry point. Existing request_booking remains the controlled transactional operation.';

comment on function public.list_visible_session_resources_v1() is
  'M025 compatibility map used to classify deployed V2 session and immutable training-record RPC results as SIMULATOR or FLIGHT.';

commit;
