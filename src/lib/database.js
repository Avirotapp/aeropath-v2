import { supabase } from "./supabase";

/**
 * Get the currently authenticated user.
 */
export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return user;
}

/**
 * Get the current user's AeroPath profile.
 */
export async function getCurrentProfile() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get all roles assigned to the current user.
 */
export async function getCurrentUserRoles() {
  const user = await getCurrentUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Get the current user's complete AeroPath identity.
 */
export async function getCurrentUserContext() {
  const user = await getCurrentUser();

  if (!user) {
    return {
      user: null,
      profile: null,
      roles: [],
    };
  }

  const [profile, roles] = await Promise.all([
    getCurrentProfile(),
    getCurrentUserRoles(),
  ]);

  return {
    user,
    profile,
    roles,
  };
}