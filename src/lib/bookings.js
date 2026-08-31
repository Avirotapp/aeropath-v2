import { supabase } from "./supabase";

export async function listActiveSimulators() {
  const { data, error } = await supabase.rpc(
    "list_active_training_resources_v1"
  );

  if (error) {
    throw error;
  }

  return (data ?? []).map((resource) => ({
    ...resource,
    id: resource.resource_id,
  }));
}

export async function listApprovedInstructors() {
  const { data, error } = await supabase.rpc(
    "list_approved_instructors"
  );

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function studentListBookings() {
  const { data, error } = await supabase.rpc(
    "student_list_training_bookings_v1"
  );

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function studentRequestBooking({
  simulatorId,
  instructorId,
  startTime,
  endTime,
  purpose,
}) {
  const { data, error } = await supabase.rpc(
    "student_request_training_booking_v1",
    {
      requested_resource_id: simulatorId,
      requested_instructor_id:
        instructorId || null,
      requested_start_time: startTime,
      requested_end_time: endTime,
      booking_purpose:
        purpose?.trim() || null,
    }
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function studentCancelRequestedBooking(
  bookingId,
  reason = null
) {
  const { error } = await supabase.rpc(
    "student_cancel_requested_booking",
    {
      target_booking_id: bookingId,
      reason:
        reason?.trim() || null,
    }
  );

  if (error) {
    throw error;
  }
}
