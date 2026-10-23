/**
 * Choose the person for a postmaster event (Trello T71).
 *
 * Searches existing people as the Editor types and always offers "Add new
 * person" beside the matches, even when a row with the same name exists: a
 * matching name is a hint, never an identity, so nothing here merges by name.
 * An office-level event (a closure) has no person at all.
 */
import { useEffect, useId, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchPostmasters, type PostmasterPerson } from "@/services/postmasters";

export type PersonChoice =
  | { kind: "none" }
  | { kind: "existing"; person: PostmasterPerson }
  | { kind: "new"; name: string; sortName: string };

const SEARCH_DELAY_MS = 300;

export function PostmasterPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: PersonChoice;
  onChange: (next: PersonChoice) => void;
  disabled?: boolean;
}) {
  const idPrefix = useId();
  // The typed name IS the search needle: one source of truth, so toggling the
  // office-level box or pressing Change never leaves stale text in the input.
  const query = value.kind === "new" ? value.name : "";
  const [matches, setMatches] = useState<PostmasterPerson[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    // Every keystroke drops the previous matches first, so a list for an
    // older needle never sits under the new text.
    setMatches([]);
    const needle = query.trim();
    if (!needle) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const rows = await searchPostmasters(needle);
        if (!cancelled) setMatches(rows);
      } catch {
        if (!cancelled) setMatches([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setSearching(false);
    };
  }, [query]);

  const officeLevel = value.kind === "none";

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={officeLevel}
          onCheckedChange={(checked) => onChange(checked === true ? { kind: "none" } : { kind: "new", name: "", sortName: "" })}
          disabled={disabled}
          aria-label="Office-level event (no person)"
        />
        Office-level event (no person)
      </label>

      {!officeLevel && (
        <>
          {value.kind === "existing" && (
            <p className="text-sm">
              <span className="font-medium">{value.person.name}</span>
              <span className="text-muted-foreground"> (existing person)</span>{" "}
              <button
                type="button"
                className="underline text-sm"
                onClick={() => onChange({ kind: "new", name: "", sortName: "" })}
                disabled={disabled}
              >
                Change
              </button>
            </p>
          )}
          {value.kind === "new" && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-search`} className="sr-only">
                  Person
                </Label>
                <Input
                  id={`${idPrefix}-search`}
                  placeholder="Type a name to search"
                  value={query}
                  disabled={disabled}
                  onChange={(event) => onChange({ kind: "new", name: event.target.value, sortName: value.sortName })}
                  autoComplete="off"
                />
              </div>
              {query.trim() && (
                <ul className="rounded border divide-y text-sm" aria-label="Matching people">
                  {searching && <li className="px-3 py-2 text-muted-foreground">Searching...</li>}
                  {!searching &&
                    matches.map((person) => (
                      <li key={person.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted"
                          onClick={() => {
                            onChange({ kind: "existing", person });
                            setMatches([]);
                          }}
                        >
                          {person.name}
                          <span className="text-muted-foreground"> ({person.sortName})</span>
                        </button>
                      </li>
                    ))}
                  <li className="px-3 py-2 text-muted-foreground">
                    Add new person: <span className="text-foreground">{query.trim()}</span>
                    {matches.length > 0 && " (a matching name is not proof of the same person)"}
                  </li>
                </ul>
              )}
              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-sort`} className="text-xs text-muted-foreground">
                  Sort name for a new person (optional, surname first)
                </Label>
                <Input
                  id={`${idPrefix}-sort`}
                  placeholder="Derived from the name when blank"
                  value={value.sortName}
                  disabled={disabled}
                  onChange={(event) => onChange({ kind: "new", name: value.name, sortName: event.target.value })}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
