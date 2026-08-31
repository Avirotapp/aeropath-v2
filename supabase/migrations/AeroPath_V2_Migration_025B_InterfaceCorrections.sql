-- ============================================================
-- AEROPATH V2
-- MIGRATION 025B
-- INTERFACE / SELF-SERVICE BOOKING CORRECTIONS
--
-- M018A already authorises approved Students and Instructors to manage
-- their own booking requests. M025 introduced resource-aware wrappers but
-- accidentally narrowed those two wrappers back to Student-only access.
-- This restores the locked M018A capability without expanding Admin or
-- Safety Manager permissions unless they also hold Student/Instructor role.
-- ============================================================

reset role;
begin;

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
     or not (
       public.is_student()
       or public.is_instructor()
     ) then
    raise exception 'Only approved Students or Instructors can request training bookings.'
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
    select 1
    from public.simulators resource
    where resource.id = requested_resource_id
      and resource.active = true
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
     or not (
       public.is_student()
       or public.is_instructor()
     ) then
    raise exception 'Only approved Students or Instructors can view their training bookings.'
      using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(row_data) order by row_data.requested_start desc)
    from (
      select
        booking.id,
        resource.id as resource_id,
        resource.id as simulator_id,
        resource.resource_type,
        resource.name as resource_name,
        resource.name as simulator_name,
        resource.type as resource_model,
        resource.identifier as resource_identifier,
        resource.callsign as resource_callsign,
        booking.assigned_instructor_id,
        instructor.full_name as instructor_name,
        booking.requested_start,
        booking.requested_end,
        booking.approved_start,
        booking.approved_end,
        booking.status,
        booking.purpose,
        booking.rejection_reason,
        booking.cancellation_reason,
        booking.requested_at,
        booking.approved_at
      from public.bookings booking
      join public.simulators resource
        on resource.id = booking.simulator_id
      left join public.profiles instructor
        on instructor.id = booking.assigned_instructor_id
      where booking.student_id = auth.uid()
        and booking.deleted_at is null
    ) row_data
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.student_request_training_booking_v1(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text
) from public;

revoke all on function public.student_list_training_bookings_v1()
from public;

grant execute on function public.student_request_training_booking_v1(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text
) to authenticated;

grant execute on function public.student_list_training_bookings_v1()
to authenticated;

comment on function public.student_request_training_booking_v1(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text
) is
  'M025B resource-aware self-service booking for approved Student or Instructor capability, restoring the locked M018A rule.';

commit;
