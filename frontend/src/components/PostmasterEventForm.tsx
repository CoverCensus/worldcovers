/**
 * Add or correct one postmaster event on a Post Office page (Trello T71).
 *
 * Same shape as the Reference Works form: an inline card, one client-side
 * validation pass, the error focused for keyboard and screen-reader users, a
 * toast on success. The API enforces the Editor and region rules; this form
 * only keeps a non-editor from seeing an erroring card. A new person is
 * created first and then the event, two requests; a failure on the second
 * leaves a person with no event, which is harmless, reusable and logged.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { FieldHelp } from "@/components/FieldHelp";
import { PartialDateFields } from "@/components/PartialDateFields";
import { PostmasterPicker, type PersonChoice } from "@/components/PostmasterPicker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  POSTMASTER_DATE_HELP,
  POSTMASTER_EVENT_HELP,
  POSTMASTER_PERSON_HELP,
  POSTMASTER_SOURCE_NOTE_HELP,
} from "@/labels/guidelines";
import type { PartialDateInput } from "@/lib/partialDate";
import { partsFromTenureDate, tenurePayloadDate } from "@/lib/postmasterDate";
import {
  createPostmaster,
  createTenure,
  tenureEventLabel,
  updateTenure,
  type PostmasterTenure,
  type PostmasterTenurePayload,
} from "@/services/postmasters";

const EVENTS = ["appointment", "reappointment", "discontinued", "unknown"] as const;
const SOURCE_NOTE_MAX = 500;

export function PostmasterEventForm({
  postOfficeId,
  existing,
  onSaved,
  onCancel,
}: {
  postOfficeId: number;
  /** The row being corrected, or null for a new event. */
  existing: PostmasterTenure | null;
  onSaved: (row: PostmasterTenure) => void | Promise<void>;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [person, setPerson] = useState<PersonChoice>(() => {
    if (!existing) return { kind: "new", name: "", sortName: "" };
    if (existing.postmasterId == null) return { kind: "none" };
    return {
      kind: "existing",
      person: { id: existing.postmasterId, name: existing.postmasterName, sortName: "" },
    };
  });
  const [event, setEvent] = useState<string>(existing?.event ?? "appointment");
  const [date, setDate] = useState<PartialDateInput>(() =>
    existing ? partsFromTenureDate(existing.dateAppointed, existing.granularity) : { unknown: false, year: "", month: "", day: "" },
  );
  const [sourceNote, setSourceNote] = useState(existing?.sourceNote ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  const save = useMutation({
    mutationFn: async (payload: PostmasterTenurePayload) => {
      let postmasterId = payload.postmaster;
      if (person.kind === "new") {
        const created = await createPostmaster(person.name, person.sortName);
        postmasterId = created.id;
        // The person now exists; a retry after a failed event save reuses it
        // instead of creating a second row with the same name.
        setPerson({ kind: "existing", person: created });
      }
      const body = { ...payload, postmaster: postmasterId };
      return existing ? updateTenure(existing.id, body) : createTenure(body);
    },
    onSuccess: async (row) => {
      toast({
        title: existing ? "Postmaster event updated." : "Postmaster event added.",
        description: `${row.postmasterName || tenureEventLabel(row.event)} at ${row.postOfficeName || "this office"}`,
      });
      await onSaved(row);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
    },
  });

  const onSubmit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    const named = event === "appointment" || event === "reappointment";
    if (named && person.kind === "none") {
      setFormError("An appointment names a person. Choose Office-level event for a closure.");
      return;
    }
    if (person.kind === "new" && !person.name.trim()) {
      setFormError("Enter the person's name, or pick a matching person.");
      return;
    }
    const dateResult = tenurePayloadDate(date);
    if (dateResult.ok === false) {
      setFormError(dateResult.error);
      return;
    }
    if (!existing && !sourceNote.trim()) {
      setFormError("Say where this event comes from (the source note is required).");
      return;
    }
    setFormError(null);
    save.mutate({
      post_office: postOfficeId,
      postmaster: person.kind === "existing" ? person.person.id : null,
      event,
      ...dateResult.value,
      source_note: sourceNote.trim().slice(0, SOURCE_NOTE_MAX),
    });
  };

  return (
    <Card className="p-4 mb-4">
      <form onSubmit={onSubmit} noValidate aria-label={existing ? "Edit postmaster event" : "Add postmaster event"}>
        <h3 className="font-semibold mb-3">{existing ? "Edit postmaster event" : "Add postmaster event"}</h3>
        {existing?.origin === "IMPORT" && (
          <p className="text-xs text-muted-foreground mb-3">
            Imported row; your correction is logged.
            {existing.sourceRef ? ` Source cell: ${existing.sourceRef}.` : ""}
          </p>
        )}
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              {/* Heading only: the picker labels its own input (sr-only), so
                  there is exactly one accessible name for the field. */}
              <span className="text-sm font-medium leading-none">Person</span>
              <FieldHelp label="Person">{POSTMASTER_PERSON_HELP}</FieldHelp>
            </div>
            <PostmasterPicker value={person} onChange={setPerson} disabled={save.isPending} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label htmlFor="postmaster-event">Event</Label>
              <FieldHelp label="Event">{POSTMASTER_EVENT_HELP}</FieldHelp>
            </div>
            <Select value={event} onValueChange={setEvent} disabled={save.isPending}>
              <SelectTrigger id="postmaster-event">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENTS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {tenureEventLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label>Date</Label>
              <FieldHelp label="Date">{POSTMASTER_DATE_HELP}</FieldHelp>
            </div>
            <PartialDateFields idPrefix="postmaster-date" value={date} onChange={setDate} disabled={save.isPending} showUnknown />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label htmlFor="postmaster-source-note">
                Source note{existing ? "" : <span aria-hidden="true"> *</span>}
              </Label>
              <FieldHelp label="Source note">{POSTMASTER_SOURCE_NOTE_HELP}</FieldHelp>
            </div>
            <Textarea
              id="postmaster-source-note"
              value={sourceNote}
              maxLength={SOURCE_NOTE_MAX}
              rows={2}
              disabled={save.isPending}
              onChange={(changeEvent) => setSourceNote(changeEvent.target.value)}
            />
          </div>
        </div>
        {formError && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="mt-3 text-sm text-destructive">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving..." : existing ? "Save changes" : "Add event"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
