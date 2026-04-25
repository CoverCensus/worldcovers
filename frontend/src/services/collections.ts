/**
 * Collections (v2 Collection entity): /collections/.
 *
 * A Collection is an institutional curatorial unit wrapping exactly one Region
 * with many Editor assignments. Administrators (superusers) create / update
 * Collections and assign Editors; Editors and Contributors can list/retrieve.
 */
import apiClient from "@/lib/api";

export interface CollectionRegion {
  id: number;
  name: string;
  abbrev: string;
  region_tier: string;
}

export interface CollectionRecord {
  id: number;
  name: string;
  description: string;
  region: CollectionRegion;
  is_active: boolean;
  editor_count: number;
  created_date: string;
  modified_date: string;
}

export interface CollectionListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CollectionRecord[];
}

export interface CollectionEditor {
  id: number;
  user_id: number;
  username: string;
  email: string;
}

export async function listCollections(): Promise<CollectionRecord[]> {
  const res = await apiClient.get<CollectionListResponse | CollectionRecord[]>("/collections/");
  const data = res.data;
  if (Array.isArray(data)) return data;
  return Array.isArray(data.results) ? data.results : [];
}

export async function createCollection(payload: {
  name: string;
  description?: string;
  region_id: number;
  is_active?: boolean;
}): Promise<CollectionRecord> {
  const res = await apiClient.post<CollectionRecord>("/collections/", payload);
  return res.data;
}

export async function updateCollection(
  id: number,
  payload: Partial<{ name: string; description: string; region_id: number; is_active: boolean }>,
): Promise<CollectionRecord> {
  const res = await apiClient.patch<CollectionRecord>(`/collections/${id}/`, payload);
  return res.data;
}

export async function deleteCollection(id: number): Promise<void> {
  await apiClient.delete(`/collections/${id}/`);
}

export async function listCollectionEditors(id: number): Promise<CollectionEditor[]> {
  const res = await apiClient.get<CollectionEditor[]>(`/collections/${id}/editors/`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function assignEditor(collectionId: number, userId: number): Promise<void> {
  await apiClient.post(`/collections/${collectionId}/assign-editor/`, { user_id: userId });
}

export async function unassignEditor(collectionId: number, userId: number): Promise<void> {
  await apiClient.delete(`/collections/${collectionId}/unassign-editor/${userId}/`);
}
