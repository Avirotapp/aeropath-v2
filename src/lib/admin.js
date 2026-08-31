import { supabase } from "./supabase";

/**
 * Return all AeroPath users visible to an approved administrator.
 */
export async function adminListUsers() {
  const { data, error } = await supabase.rpc(
    "admin_list_users"
  );

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Approve a pending AeroPath user and assign an operational role.
 */
export async function adminApproveUser(
  userId,
  role
) {
  const { error } = await supabase.rpc(
    "admin_approve_user",
    {
      target_user_id: userId,
      assigned_role: role,
    }
  );

  if (error) {
    throw error;
  }
}

/**
 * Reject an AeroPath account request.
 */
export async function adminRejectUser(
  userId,
  reason
) {
  const { error } = await supabase.rpc(
    "admin_reject_user",
    {
      target_user_id: userId,
      reason,
    }
  );

  if (error) {
    throw error;
  }
}