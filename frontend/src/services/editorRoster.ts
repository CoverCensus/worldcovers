/**
 * Editors-only roster: GET /editor-roster/ (issues.md 177, Trello T46).
 *
 * Built by the server from CollectionAssignment, so it reflects current
 * assignments and never a proposed appointment. The endpoint is restricted to
 * Editors and Administrators and returns names and states, without emails.
 */
import apiClient from "@/lib/api";

export interface RosterEditor {
  displayName: string;
  states: string[];
}

export interface RosterState {
  abbrev: string;
  name: string;
  editors: RosterEditor[];
}

interface RosterApiEditor {
  display_name?: unknown;
  states?: unknown;
}

interface RosterApiState {
  abbrev?: unknown;
  name?: unknown;
  editors?: unknown;
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function mapEditor(raw: RosterApiEditor): RosterEditor {
  return {
    displayName: text(raw.display_name),
    states: Array.isArray(raw.states) ? raw.states.map(text).filter(Boolean) : [],
  };
}

export async function getEditorRoster(): Promise<RosterState[]> {
  const res = await apiClient.get<RosterApiState[]>("/editor-roster/");
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map((r) => ({
    abbrev: text(r.abbrev),
    name: text(r.name),
    editors: Array.isArray(r.editors) ? (r.editors as RosterApiEditor[]).map(mapEditor) : [],
  }));
}
