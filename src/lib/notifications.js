import { supabase } from "./supabase";

export async function listMyNotifications() {
  const { data, error } = await supabase.rpc("list_my_notifications");
  if (error) throw error;
  return data ?? [];
}

export async function getUnreadCount() {
  const { data, error } = await supabase.rpc("my_unread_notification_count");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase.rpc("mark_notification_read", {
    target_notification_id: notificationId,
  });
  if (error) throw error;
}

export async function markNotificationUnread(notificationId) {
  const { error } = await supabase.rpc("mark_notification_unread", {
    target_notification_id: notificationId,
  });
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { data, error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function dismissNotification(notificationId) {
  const { error } = await supabase.rpc("dismiss_notification", {
    target_notification_id: notificationId,
  });
  if (error) throw error;
}
