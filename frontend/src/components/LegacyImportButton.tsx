import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";
import { importLegacyData, type ImportProgress } from "@/services/legacyImport";
import { useToast } from "@/hooks/use-toast";

export const LegacyImportButton = () => {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const handleImport = async () => {
    if (importing) return;

    const confirmed = window.confirm(
      "This will import legacy postmark data from the old website CSV into the catalog. " +
        "This may take several minutes. Continue?"
    );
    if (!confirmed) return;

    setImporting(true);
    setProgress(null);

    try {
      const result = await importLegacyData((p) => setProgress({ ...p }));
      toast({
        title: "Import complete",
        description: `Inserted ${result.inserted} records. ${result.skipped} skipped, ${result.errors} errors.`,
      });
    } catch (e) {
      toast({
        title: "Import failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const pct = progress && progress.total > 0
    ? Math.round(((progress.processed + progress.skipped) / progress.total) * 100)
    : 0;

  return (
    <Card className="shadow-archival-md">
      <CardHeader>
        <CardTitle className="font-heading text-lg flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Import Legacy Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Import postmark records from the old website CSV data (tblRawStateData.csv) into the
          catalog. Records will appear on the Catalog Search page.
        </p>

        {progress && (
          <div className="space-y-2">
            <Progress value={pct} className="h-2" />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Total: {progress.total}</span>
              <span>Inserted: {progress.inserted}</span>
              <span>Skipped: {progress.skipped}</span>
              {progress.errors > 0 && (
                <span className="text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Errors: {progress.errors}
                </span>
              )}
              {progress.done && (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Done
                </span>
              )}
            </div>
          </div>
        )}

        <Button
          onClick={handleImport}
          disabled={importing}
          variant="outline"
          className="w-full"
        >
          {importing ? "Importing..." : "Start Import"}
        </Button>
      </CardContent>
    </Card>
  );
};
