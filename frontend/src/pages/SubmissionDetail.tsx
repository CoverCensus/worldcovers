import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CatalogEntryDetailView, type CatalogEntry } from "@/components/CatalogEntryDetailView";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function getApiBaseUrl(): string | null {
  const env = import.meta.env.VITE_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  return env.trim().replace(/\/+$/, "");
}

const SubmissionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [isEditing, setIsEditing] = useState(searchParams.get("edit") === "1");
  const [submission, setSubmission] = useState<CatalogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [state, setState] = useState("");
  const [town, setTown] = useState("");
  const [firstSeen, setFirstSeen] = useState("");
  const [lastSeen, setLastSeen] = useState("");
  const [type, setType] = useState("");
  const [color, setColor] = useState("");
  const [manuscript, setManuscript] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [rarity, setRarity] = useState("");
  const [description, setDescription] = useState("");
  const [references, setReferences] = useState("");

  useEffect(() => {
    if (!id) return;

    const fetchSubmission = async () => {
      try {
        const apiBase = getApiBaseUrl();
        if (!apiBase) {
          throw new Error("VITE_API_URL is not set.");
        }
        const url = `${apiBase}/api/catalog-requests/${id}/`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = body?.detail || `API error: ${res.status} ${res.statusText}`;
          throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
        }
        const data = await res.json();
        const dateRange =
          data.firstSeen && data.lastSeen
            ? `${data.firstSeen}-${data.lastSeen}`
            : data.firstSeen || "";
        const name =
          [data.town, data.state].filter(Boolean).join(", ") ||
          `${data.state || ""} ${data.town || ""}`.trim() ||
          "Submission";

        const entry: CatalogEntry = {
          name,
          town: data.town || "",
          state: data.state || "",
          date_range: dateRange,
          type: data.type || "",
          color: data.color || "",
          image_url: null,
          description: data.description || undefined,
          citation_references: data.references || undefined,
          dimensions: data.dimensions || undefined,
          manuscript: data.manuscript || undefined,
          rarity: data.rarity || undefined,
          status: (data.status || "PENDING").toString().toLowerCase(),
          submitter_name: data.submitterName || undefined,
          created_at: data.createdAt,
          reviewed_at: undefined,
        };
        setSubmission(entry);

        // Seed edit form state
        setState(entry.state);
        setTown(entry.town);
        setFirstSeen(data.firstSeen || "");
        setLastSeen(data.lastSeen || "");
        setType(entry.type);
        setColor(entry.color);
        setManuscript(entry.manuscript || "");
        setDimensions(entry.dimensions || "");
        setRarity(entry.rarity || "");
        setDescription(entry.description || "");
        setReferences(entry.citation_references || "");
      } catch (err: unknown) {
        toast({
          title: "Error loading submission",
          description: err instanceof Error ? err.message : "Could not load submission",
          variant: "destructive",
        });
        setSubmission(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSubmission();
  }, [id, toast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    const stateVal = state.trim();
    const townVal = town.trim();
    const firstVal = firstSeen.trim();
    const typeVal = type.trim();
    const colorVal = color.trim();

    if (!stateVal || !townVal || !firstVal || !typeVal || !colorVal) {
      const parts = [];
      if (!stateVal) parts.push("State");
      if (!townVal) parts.push("Town/City");
      if (!firstVal) parts.push("First Seen Year");
      if (!typeVal) parts.push("Postmark Type");
      if (!colorVal) parts.push("Color");
      toast({
        title: "Missing required fields",
        description: `Please fill in: ${parts.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }

    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      toast({
        title: "Configuration error",
        description: "VITE_API_URL is not set. Cannot save submission.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/catalog-requests/${id}/`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: stateVal,
          town: townVal,
          firstSeen: firstVal,
          lastSeen: lastSeen.trim(),
          type: typeVal,
          color: colorVal,
          manuscript: manuscript.trim() || undefined,
          dimensions: dimensions.trim() || undefined,
          rarity: rarity.trim() || undefined,
          description: description.trim() || undefined,
          references: references.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body?.detail || `Save failed: ${res.status} ${res.statusText}`;
        throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
      const data = await res.json();
      const dateRange =
        data.firstSeen && data.lastSeen
          ? `${data.firstSeen}-${data.lastSeen}`
          : data.firstSeen || "";
      const name =
        [data.town, data.state].filter(Boolean).join(", ") ||
        `${data.state || ""} ${data.town || ""}`.trim() ||
        "Submission";

      setSubmission({
        name,
        town: data.town || "",
        state: data.state || "",
        date_range: dateRange,
        type: data.type || "",
        color: data.color || "",
        image_url: null,
        description: data.description || undefined,
        citation_references: data.references || undefined,
        dimensions: data.dimensions || undefined,
        manuscript: data.manuscript || undefined,
        rarity: data.rarity || undefined,
        status: (data.status || "PENDING").toString().toLowerCase(),
        submitter_name: data.submitterName || undefined,
        created_at: data.createdAt,
        reviewed_at: undefined,
      });

      toast({
        title: "Submission updated",
        description: "Your pending submission has been updated.",
      });
      setIsEditing(false);
    } catch (err: unknown) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Could not save changes. Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex items-center justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-muted-foreground">Loading submission...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <div className="flex-1 flex flex-col items-center justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-muted-foreground mb-4">Submission not found.</p>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
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
        {isEditing ? (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Button variant="ghost" onClick={() => setIsEditing(false)} className="mb-6 -ml-4">
              Back to details
            </Button>
            <h1 className="text-2xl font-heading font-bold mb-4">Edit Submission</h1>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="state">State *</Label>
                <Input
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. Massachusetts"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="town">Town/City *</Label>
                <Input
                  id="town"
                  value={town}
                  onChange={(e) => setTown(e.target.value)}
                  placeholder="e.g. Boston"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstSeen">First Seen Year *</Label>
                  <Input
                    id="firstSeen"
                    value={firstSeen}
                    onChange={(e) => setFirstSeen(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    placeholder="1825"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastSeen">Last Seen Year</Label>
                  <Input
                    id="lastSeen"
                    value={lastSeen}
                    onChange={(e) => setLastSeen(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    placeholder="1845"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Postmark Type *</Label>
                <Input
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  placeholder="e.g. Circular date stamp"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Color *</Label>
                <Input
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="e.g. Black"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manuscript">Manuscript</Label>
                <Input
                  id="manuscript"
                  value={manuscript}
                  onChange={(e) => setManuscript(e.target.value)}
                  placeholder="Yes / No"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dimensions">Dimensions</Label>
                <Input
                  id="dimensions"
                  value={dimensions}
                  onChange={(e) => setDimensions(e.target.value)}
                  placeholder="e.g. 32mm diameter"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rarity">Rarity</Label>
                <Input
                  id="rarity"
                  value={rarity}
                  onChange={(e) => setRarity(e.target.value)}
                  placeholder="e.g. Rare, Very Rare, $50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="references">Citation References</Label>
                <Textarea
                  id="references"
                  rows={3}
                  value={references}
                  onChange={(e) => setReferences(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </form>
          </div>
        ) : (
          <CatalogEntryDetailView
            entry={submission}
            backLabel="Back to Dashboard"
            onBack={() => navigate("/dashboard")}
            detailsCardTitle="Submission Details"
          />
        )}
      </div>

      <Footer />
    </div>
  );
};

export default SubmissionDetail;
