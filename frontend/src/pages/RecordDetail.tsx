import { useState, useEffect, useRef } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Upload, FileEdit } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CatalogEntryDetailView, type CatalogEntry } from "@/components/CatalogEntryDetailView";
import { getColors, type ColorOption } from "@/services/colors";
import {
  STATE_OPTIONS,
  TYPE_OPTIONS,
  RARITY_OPTIONS,
  MANUSCRIPT_OPTIONS,
  SUBMISSION_IMAGES_BUCKET,
  MAX_IMAGE_SIZE_MB,
  ALLOWED_IMAGE_TYPES,
} from "@/lib/catalogFormOptions";
import type { Tables } from "@/integrations/supabase/types";

type CatalogRecordRow = Tables<"catalog_records">;
type CatalogEditRequestRow = Tables<"catalog_edit_requests">;

function parseDateRange(dateRange: string): { firstSeen: string; lastSeen: string } {
  const s = (dateRange ?? "").trim();
  if (!s) return { firstSeen: "", lastSeen: "" };
  const dash = s.indexOf("-");
  if (dash === -1) return { firstSeen: s, lastSeen: "" };
  return { firstSeen: s.slice(0, dash).trim(), lastSeen: s.slice(dash + 1).trim() };
}

function buildDateRange(firstSeen: string, lastSeen: string): string {
  const f = firstSeen.trim();
  const l = lastSeen.trim();
  if (!f) return "";
  return l ? `${f}-${l}` : f;
}

const RecordDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const isAdmin = useIsAdmin();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const [record, setRecord] = useState<CatalogRecordRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [colorOptions, setColorOptions] = useState<ColorOption[]>([]);
  const [pendingEditRequest, setPendingEditRequest] = useState<CatalogEditRequestRow | null>(null);

  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [town, setTown] = useState("");
  const [firstSeen, setFirstSeen] = useState("");
  const [lastSeen, setLastSeen] = useState("");
  const [type, setType] = useState("");
  const [color, setColor] = useState("");
  const [valuation, setValuation] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [manuscript, setManuscript] = useState("");
  const [description, setDescription] = useState("");
  const [citationReferences, setCitationReferences] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    getColors().then(setColorOptions).catch(() => setColorOptions([{ id: 0, name: "Black", value: "" }]));
  }, []);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setRecord(null);
      return;
    }
    const fetchRecord = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("catalog_records")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw error;
        setRecord(data);

        // Fetch pending edit request for this record (admins see it on detail page)
        const { data: reqData } = await supabase
          .from("catalog_edit_requests")
          .select("*")
          .eq("catalog_record_id", id)
          .eq("status", "pending")
          .limit(1)
          .maybeSingle();
        setPendingEditRequest(reqData ?? null);
      } catch {
        setRecord(null);
        setPendingEditRequest(null);
      } finally {
        setLoading(false);
      }
    };
    fetchRecord();
  }, [id]);

  const canEdit = user && record && (isAdmin === true || record.submitted_by === String(user.id));

  const handleEditRequestApprove = async () => {
    if (!pendingEditRequest || !user || !record) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("approve_catalog_edit_request", {
        p_request_id: pendingEditRequest.id,
        p_admin_uid: String(user.id),
      });
      const result = data as unknown as { ok?: boolean; error?: string } | null;
      if (error) throw error;
      if (result && result.ok === false) {
        throw new Error(result.error ?? "Approval failed");
      }
      setPendingEditRequest(null);
      setRecord((prev) =>
        prev && pendingEditRequest
          ? {
              ...prev,
              name: pendingEditRequest.name,
              state: pendingEditRequest.state,
              town: pendingEditRequest.town,
              date_range: pendingEditRequest.date_range,
              type: pendingEditRequest.type,
              color: pendingEditRequest.color,
              image_url: pendingEditRequest.image_url,
              valuation: pendingEditRequest.valuation ?? prev.valuation,
              description: pendingEditRequest.description ?? prev.description,
              citation_references: pendingEditRequest.citation_references ?? prev.citation_references,
              dimensions: pendingEditRequest.dimensions ?? prev.dimensions,
              manuscript: pendingEditRequest.manuscript ?? prev.manuscript,
              rarity: pendingEditRequest.rarity ?? prev.rarity,
            }
          : null
      );
      toast({ title: "Edit request approved", description: "Catalog and submission updated." });
    } catch (e: unknown) {
      toast({
        title: "Failed to approve",
        description: e instanceof Error ? e.message : "Failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEditRequestReject = async () => {
    if (!pendingEditRequest || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("catalog_edit_requests")
        .update({ status: "rejected", reviewed_by: String(user.id), reviewed_at: new Date().toISOString() })
        .eq("id", pendingEditRequest.id);
      if (error) throw error;
      setPendingEditRequest(null);
      toast({ title: "Edit request rejected" });
    } catch (e: unknown) {
      toast({
        title: "Failed to reject",
        description: e instanceof Error ? e.message : "Failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = () => {
    if (!record) return;
    const { firstSeen: f, lastSeen: l } = parseDateRange(record.date_range);
    setName(record.name);
    setState(record.state);
    setTown(record.town);
    setFirstSeen(f);
    setLastSeen(l);
    setType(record.type);
    setColor(record.color);
    setValuation(record.valuation ?? "Common");
    setDimensions(record.dimensions ?? "");
    setManuscript(record.manuscript ?? "");
    setDescription(record.description ?? "");
    setCitationReferences(record.citation_references ?? "");
    setImageUrl(record.image_url);
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setEditOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      toast({ title: "Image too large", description: `Max ${MAX_IMAGE_SIZE_MB}MB`, variant: "destructive" });
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast({ title: "Invalid type", description: "Use PNG, JPG, WebP or TIFF", variant: "destructive" });
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleEditSubmit = async () => {
    if (!record || !user) return;
    const dateRange = buildDateRange(firstSeen, lastSeen);
    if (!name.trim() || !state || !town || !dateRange || !type || !color) {
      toast({ title: "Missing required fields", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      let finalImageUrl = imageUrl;
      if (imageFile) {
        const path = `${user.id}/${crypto.randomUUID()}-${imageFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from(SUBMISSION_IMAGES_BUCKET)
          .upload(path, imageFile, { upsert: false });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from(SUBMISSION_IMAGES_BUCKET).getPublicUrl(path);
        finalImageUrl = urlData.publicUrl;
      }

      const payload = {
        name: name.trim(),
        state,
        town: town.trim(),
        date_range: dateRange,
        type,
        color,
        image_url: finalImageUrl,
        valuation: valuation || "Common",
        description: description.trim() || null,
        citation_references: citationReferences.trim() || null,
        dimensions: dimensions.trim() || null,
        manuscript: manuscript || null,
        rarity: valuation || null,
      };

      if (isAdmin) {
        const { error } = await supabase
          .from("catalog_records")
          .update(payload)
          .eq("id", record.id);
        if (error) throw error;
        toast({ title: "Catalog updated" });
        setRecord((prev) => (prev ? { ...prev, ...payload } : null));
        setEditOpen(false);
      } else {
        const { error } = await supabase.from("catalog_edit_requests").insert({
          catalog_record_id: record.id,
          requested_by: String(user.id),
          status: "pending",
          ...payload,
        });
        if (error) throw error;
        toast({ title: "Update request sent", description: "An admin will review your changes." });
        setEditOpen(false);
      }
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to save",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const entry: CatalogEntry | null = record
    ? {
        name: record.name,
        town: record.town,
        state: record.state,
        date_range: record.date_range,
        type: record.type,
        color: record.color,
        image_url: record.image_url,
        valuation: record.valuation ?? undefined,
        description: record.description ?? undefined,
        citation_references: record.citation_references ?? undefined,
        dimensions: record.dimensions ?? undefined,
        manuscript: record.manuscript ?? undefined,
        rarity: record.rarity ?? record.valuation ?? undefined,
      }
    : null;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex items-center justify-center max-w-7xl mx-auto px-4 py-8">
          <p className="text-muted-foreground">Loading record...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!id || !record) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex items-center justify-center max-w-7xl mx-auto px-4 py-8">
          <p className="text-muted-foreground">Record not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/search")}>
            Back to Search
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <div className="flex-1 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {isAdmin && pendingEditRequest && record && (() => {
            const req = pendingEditRequest;
            const cur = record;
            const fields: { label: string; current: string | null; requested: string | null }[] = [
              { label: "Name", current: cur.name ?? null, requested: req.name },
              { label: "State", current: cur.state ?? null, requested: req.state },
              { label: "Town", current: cur.town ?? null, requested: req.town },
              { label: "Date Range", current: cur.date_range ?? null, requested: req.date_range },
              { label: "Type", current: cur.type ?? null, requested: req.type },
              { label: "Color", current: cur.color ?? null, requested: req.color },
              { label: "Valuation", current: cur.valuation ?? null, requested: req.valuation ?? null },
              { label: "Dimensions", current: cur.dimensions ?? null, requested: req.dimensions ?? null },
              { label: "Manuscript", current: cur.manuscript ?? null, requested: req.manuscript ?? null },
              { label: "Rarity", current: cur.rarity ?? null, requested: req.rarity ?? null },
              { label: "Description", current: cur.description ?? null, requested: req.description ?? null },
              { label: "Citation Refs", current: cur.citation_references ?? null, requested: req.citation_references ?? null },
            ];
            const changed = fields.filter((f) => (f.current ?? "") !== (f.requested ?? ""));
            const imageChanged = (cur.image_url ?? "") !== (req.image_url ?? "");
            const fmt = (v: string | null) => (v == null || v === "" ? "—" : String(v).length > 80 ? String(v).slice(0, 80) + "…" : v);

            return (
              <Card className="mb-6 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileEdit className="h-5 w-5" />
                    Pending edit request
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Requested {new Date(req.created_at).toLocaleString()}. Review changes below and approve or reject.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-border bg-background overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-2 text-left font-medium">Field</th>
                          <th className="p-2 text-left font-medium text-muted-foreground">Current</th>
                          <th className="p-2 text-left font-medium text-green-700 dark:text-green-400">Requested</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changed.length === 0 && !imageChanged ? (
                          <tr>
                            <td colSpan={3} className="p-2 text-muted-foreground text-center">No field changes</td>
                          </tr>
                        ) : (
                          changed.map((f) => (
                          <tr key={f.label} className="border-b last:border-0">
                            <td className="p-2 font-medium">{f.label}</td>
                            <td className="p-2 text-muted-foreground break-words">{fmt(f.current)}</td>
                            <td className="p-2 text-green-700 dark:text-green-400 font-medium break-words">{fmt(f.requested)}</td>
                          </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    {imageChanged && (
                      <div className="p-2 border-t flex flex-wrap gap-4">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Current</p>
                          {cur.image_url ? <img src={cur.image_url} alt="Current" className="h-20 object-contain rounded border" /> : <span className="text-xs">—</span>}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Requested</p>
                          {req.image_url ? <img src={req.image_url} alt="Requested" className="h-20 object-contain rounded border" /> : <span className="text-xs">—</span>}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleEditRequestApprove} disabled={saving}>
                      {saving ? "Saving…" : "Approve"}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleEditRequestReject} disabled={saving}>
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
          {entry && (
            <CatalogEntryDetailView
              entry={entry}
              backLabel="Back to Search"
              onBack={() => navigate("/search")}
              detailsCardTitle="Record Details"
              extraAction={canEdit ? (
                <Button variant="outline" size="sm" onClick={openEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              ) : undefined}
            />
          )}
        </div>
      </div>
      <Footer />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isAdmin ? "Edit catalog record" : "Request catalog update"}</DialogTitle>
            <DialogDescription>
              {isAdmin
                ? "Changes are saved immediately."
                : "Your changes will be sent for admin approval. All fields are shown so you can add or edit any detail, including Citation References."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Boston, Mass. - Circular Date Stamp" />
            </div>
            <div className="space-y-2">
              <Label>State *</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger><SelectValue placeholder="Select state..." /></SelectTrigger>
                <SelectContent>
                  {STATE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Town/City *</Label>
              <Input value={town} onChange={(e) => setTown(e.target.value)} placeholder="e.g., Boston" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Seen Year *</Label>
                <Input type="number" placeholder="1825" value={firstSeen} onChange={(e) => setFirstSeen(e.target.value)} min={1700} max={1861} />
              </div>
              <div className="space-y-2">
                <Label>Last Seen Year</Label>
                <Input type="number" placeholder="1845" value={lastSeen} onChange={(e) => setLastSeen(e.target.value)} min={1700} max={1861} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Postmark Type *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color *</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger><SelectValue placeholder="Select color..." /></SelectTrigger>
                <SelectContent>
                  {colorOptions.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valuation / Rarity</Label>
              <Select value={valuation} onValueChange={setValuation}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RARITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Dimensions</Label>
              <Input value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="e.g., 32mm diameter" />
            </div>
            <div className="space-y-2">
              <Label>Manuscript</Label>
              <Select value={manuscript} onValueChange={setManuscript}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {MANUSCRIPT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Details about the postmark..." />
            </div>
            <div className="space-y-2">
              <Label>Citation References</Label>
              <Textarea value={citationReferences} onChange={(e) => setCitationReferences(e.target.value)} rows={3} placeholder="Catalog numbers, publications, references..." />
            </div>
            <div className="space-y-2">
              <Label>Image</Label>
              <input
                ref={fileInputRef}
                id="record-edit-image-input"
                type="file"
                accept={ALLOWED_IMAGE_TYPES.join(",")}
                className="sr-only"
                onChange={handleImageChange}
              />
              <label
                htmlFor="record-edit-image-input"
                className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 cursor-pointer min-h-[160px]"
              >
                {imagePreview ? (
                  <div className="space-y-2 w-full">
                    <img src={imagePreview} alt="Preview" className="mx-auto max-h-32 rounded object-contain" />
                    <p className="text-sm text-muted-foreground">{imageFile?.name || "New image selected"}</p>
                    <div className="flex gap-2 justify-center">
                      <span className="text-sm text-primary font-medium">Click to change</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setImageFile(null);
                          setImagePreview(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : imageUrl ? (
                  <div className="space-y-2 w-full">
                    <img src={imageUrl} alt="Current" className="mx-auto max-h-32 rounded object-contain pointer-events-none" />
                    <p className="text-sm text-muted-foreground">Current image</p>
                    <p className="text-sm text-primary font-medium">Click to choose a new file</p>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Click to upload (PNG, JPG, WebP, TIFF, max {MAX_IMAGE_SIZE_MB}MB)</p>
                  </>
                )}
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSubmit} disabled={saving}>
              {saving ? "Saving..." : isAdmin ? "Save changes" : "Send update request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecordDetail;
