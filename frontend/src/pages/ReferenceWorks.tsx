/**
 * Editors' Reference Works page (Trello S19): list, add, and edit the
 * citable publications that Citations point at. There is no delete; the API
 * refuses it. The route is wrapped in RequireEditor and the API enforces the
 * same Editor rule, so the page is a convenience, not the guard.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { EditorNavigation } from "@/components/EditorNavigation";
import { Footer } from "@/components/Footer";
import { FieldHelp } from "@/components/FieldHelp";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import {
  REFERENCE_WORK_AUTHORSHIP_HELP,
  REFERENCE_WORK_CODE_HELP,
  REFERENCE_WORK_EDITION_HELP,
  REFERENCE_WORK_ISBN_HELP,
  REFERENCE_WORK_PUBLISHER_HELP,
  REFERENCE_WORK_TITLE_HELP,
  REFERENCE_WORK_URL_HELP,
  REFERENCE_WORK_VOLUME_HELP,
  REFERENCE_WORK_YEAR_HELP,
} from "@/labels/guidelines";
import { compactReferenceWorkLine, formatAuthorsCompact } from "@/lib/referenceWorkDisplay";
import {
  createReferenceWork,
  formatReferenceWorkLabel,
  getReferenceWorks,
  updateReferenceWork,
  type ReferenceWorkPayload,
  type ReferenceWorkRecord,
} from "@/services/referenceWorks";

const REFERENCE_WORKS_QUERY_KEY = ["reference-works"];

interface FormState {
  code: string;
  title: string;
  authorship: string;
  publisher: string;
  publicationYear: string;
  edition: string;
  volume: string;
  isbn: string;
  url: string;
}

const EMPTY_FORM: FormState = {
  code: "",
  title: "",
  authorship: "",
  publisher: "",
  publicationYear: "",
  edition: "",
  volume: "",
  isbn: "",
  url: "",
};

function formFromRecord(work: ReferenceWorkRecord): FormState {
  return {
    code: work.code ?? "",
    title: work.title,
    authorship: work.authorship,
    publisher: work.publisher,
    publicationYear: work.publicationYear ? String(work.publicationYear) : "",
    edition: work.edition,
    volume: work.volume,
    isbn: work.isbn,
    url: work.url,
  };
}

function payloadFromForm(form: FormState): ReferenceWorkPayload {
  const optional = (value: string) => (value.trim() ? value.trim() : null);
  return {
    code: optional(form.code),
    title: form.title.trim(),
    authorship: form.authorship.trim(),
    publisher: form.publisher.trim(),
    publication_year: Number.parseInt(form.publicationYear, 10),
    edition: optional(form.edition),
    volume: optional(form.volume),
    isbn: optional(form.isbn),
    url: optional(form.url),
  };
}

/** The one client-side check: required fields and a plausible year. */
function validateForm(form: FormState): string | null {
  if (!form.title.trim()) return "Title is required.";
  if (!form.authorship.trim()) return "Authorship is required.";
  if (!form.publisher.trim()) return "Publisher is required.";
  if (!/^\d{4}$/.test(form.publicationYear.trim())) return "Publication year must be a four-digit year.";
  return null;
}

interface FieldProps {
  id: keyof FormState;
  label: string;
  help: string;
  form: FormState;
  onChange: (id: keyof FormState, value: string) => void;
  required?: boolean;
  inputMode?: "numeric";
}

function Field({ id, label, help, form, onChange, required, inputMode }: FieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Label htmlFor={`reference-work-${id}`}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </Label>
        <FieldHelp label={label}>{help}</FieldHelp>
      </div>
      <Input
        id={`reference-work-${id}`}
        value={form[id]}
        inputMode={inputMode}
        required={required}
        onChange={(event) => onChange(id, event.target.value)}
      />
    </div>
  );
}

const ReferenceWorks = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Keyboard and screen-reader users land on the error instead of hunting for it.
  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  const { data: works = [], isLoading, error } = useQuery({
    queryKey: REFERENCE_WORKS_QUERY_KEY,
    queryFn: getReferenceWorks,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: REFERENCE_WORKS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["reference-work-options"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async (input: { id: number | null; payload: ReferenceWorkPayload }) =>
      input.id === null
        ? createReferenceWork(input.payload)
        : updateReferenceWork(input.id, input.payload),
    onSuccess: async (saved, input) => {
      await invalidate();
      toast({
        title: input.id === null ? "Reference Work added." : "Reference Work updated.",
        description: formatReferenceWorkLabel(saved),
      });
      closeForm();
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
      toast({ title: "Could not save the Reference Work", description: message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return works;
    return works.filter((work) =>
      [work.code ?? "", work.title, work.authorship, work.publisher]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [works, search]);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (work: ReferenceWorkRecord) => {
    setEditingId(work.id);
    setForm(formFromRecord(work));
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const onFieldChange = (id: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [id]: value }));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const problem = validateForm(form);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    saveMutation.mutate({ id: editingId, payload: payloadFromForm(form) });
  };

  const editingWork = editingId === null ? null : works.find((work) => work.id === editingId) ?? null;

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <div className="flex-1 bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h1 className="text-2xl font-heading font-semibold">Reference Works</h1>
              <p className="text-muted-foreground text-sm mt-1">
                The citable publications that Citations point at. Add a work before citing it;
                existing works can be edited but not removed.
              </p>
            </div>
            <Button onClick={formOpen ? closeForm : openNew}>
              {formOpen ? "Cancel" : "New Reference Work"}
            </Button>
          </div>

          <div className="mb-6">
            <EditorNavigation active="reference-works" />
          </div>

          {formOpen && (
            <Card className="p-4 mb-6">
              <form onSubmit={onSubmit} noValidate aria-label={editingId === null ? "New Reference Work" : "Edit Reference Work"}>
                <h2 className="font-semibold mb-3">
                  {editingId === null
                    ? "New Reference Work"
                    : `Edit ${editingWork ? formatReferenceWorkLabel(editingWork) : "Reference Work"}`}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field id="title" label="Title" help={REFERENCE_WORK_TITLE_HELP} form={form} onChange={onFieldChange} required />
                  <Field id="code" label="Code" help={REFERENCE_WORK_CODE_HELP} form={form} onChange={onFieldChange} />
                  <div className="space-y-1">
                    <Field id="authorship" label="Authorship" help={REFERENCE_WORK_AUTHORSHIP_HELP} form={form} onChange={onFieldChange} required />
                    <p className="text-xs text-muted-foreground" data-testid="authorship-preview">
                      Shown on submission forms as: {formatAuthorsCompact(form.authorship) || "(first author)"}
                    </p>
                  </div>
                  <Field id="publisher" label="Publisher" help={REFERENCE_WORK_PUBLISHER_HELP} form={form} onChange={onFieldChange} required />
                  <Field id="publicationYear" label="Publication year" help={REFERENCE_WORK_YEAR_HELP} form={form} onChange={onFieldChange} required inputMode="numeric" />
                  <Field id="edition" label="Edition" help={REFERENCE_WORK_EDITION_HELP} form={form} onChange={onFieldChange} />
                  <Field id="volume" label="Volume" help={REFERENCE_WORK_VOLUME_HELP} form={form} onChange={onFieldChange} />
                  <Field id="isbn" label="ISBN" help={REFERENCE_WORK_ISBN_HELP} form={form} onChange={onFieldChange} />
                  <Field id="url" label="URL" help={REFERENCE_WORK_URL_HELP} form={form} onChange={onFieldChange} />
                </div>
                {formError && (
                  <p ref={errorRef} tabIndex={-1} role="alert" className="mt-3 text-sm text-destructive">
                    {formError}
                  </p>
                )}
                <div className="flex justify-end gap-2 mt-4">
                  <Button type="button" variant="ghost" onClick={closeForm} disabled={saveMutation.isPending}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Saving..." : editingId === null ? "Add Reference Work" : "Save changes"}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
              <h2 className="font-semibold">All Reference Works ({works.length})</h2>
              <div className="sm:w-72">
                <Label htmlFor="reference-work-search" className="sr-only">
                  Search Reference Works
                </Label>
                <Input
                  id="reference-work-search"
                  placeholder="Search code, title, author, publisher"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            {isLoading ? (
              <Spinner />
            ) : error ? (
              <p role="alert" className="text-sm text-destructive">
                Could not load Reference Works: {error instanceof Error ? error.message : String(error)}
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {works.length === 0 ? "No Reference Works yet." : "No Reference Work matches the search."}
              </p>
            ) : (
              <ul className="divide-y">
                {filtered.map((work) => (
                  <li key={work.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{formatReferenceWorkLabel(work)}</p>
                      <p className="text-xs text-muted-foreground">
                        {work.authorship}
                        {work.publisher ? ` -- ${work.publisher}` : ""}
                      </p>
                      {compactReferenceWorkLine(work) !== work.authorship && (
                        <p className="text-xs text-muted-foreground">
                          On submission forms: {compactReferenceWorkLine(work)}
                        </p>
                      )}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => openEdit(work)} aria-label={`Edit ${formatReferenceWorkLabel(work)}`}>
                      Edit
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ReferenceWorks;
