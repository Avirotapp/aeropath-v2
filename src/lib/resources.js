import { supabase } from "./supabase";

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);

  if (error) {
    throw error;
  }

  return data;
}

export async function listTrainingResourceCatalog() {
  return (await rpc("list_training_resource_catalog_v1")) ?? [];
}

export async function listActiveTrainingResources() {
  return (await rpc("list_active_training_resources_v1")) ?? [];
}

export async function adminListTrainingResources() {
  return (await rpc("admin_list_training_resources_v1")) ?? [];
}

export async function adminCreateTrainingResource(values) {
  return rpc("admin_create_training_resource_v1", {
    requested_resource_type: values.resourceType,
    resource_name: values.name,
    resource_model: values.model,
    resource_identifier: values.identifier,
    resource_callsign: values.callsign || null,
    resource_description: values.description || null,
  });
}

export async function adminUpdateTrainingResource(resourceId, values) {
  return rpc("admin_update_training_resource_v1", {
    target_resource_id: resourceId,
    requested_resource_type: values.resourceType,
    resource_name: values.name,
    resource_model: values.model,
    resource_identifier: values.identifier,
    resource_callsign: values.callsign || null,
    resource_description: values.description || null,
    resource_active: values.active,
  });
}

export async function listVisibleSessionResources() {
  return (await rpc("list_visible_session_resources_v1")) ?? [];
}

export function indexResources(resources) {
  return new Map(
    (resources ?? []).map((resource) => [
      resource.resource_id,
      resource,
    ])
  );
}

export function resourceBadge(resourceOrType) {
  const type =
    typeof resourceOrType === "string"
      ? resourceOrType
      : resourceOrType?.resource_type;

  return type === "AIRCRAFT" ? "FLT" : "SIM";
}

export function resourceLabel(resource) {
  if (!resource) {
    return "Training resource";
  }

  const name = resource.resource_name || resource.name || "Training resource";
  const identifier =
    resource.resource_identifier || resource.identifier;

  return identifier ? `${name} · ${identifier}` : name;
}
