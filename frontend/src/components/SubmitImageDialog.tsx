import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface SubmitImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SubmitImageDialog = ({ open, onOpenChange }: SubmitImageDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [receiveEmail, setReceiveEmail] = useState(false);
  const [errors, setErrors] = useState<{
    file?: string;
    submitterName?: string;
    submitterEmail?: string;
  }>({});

  const validateForm = () => {
    const newErrors: typeof errors = {};
    
    if (!file) {
      newErrors.file = "Please select an image file.";
    }
    
    if (!submitterName.trim()) {
      newErrors.submitterName = "Submitter name cannot be empty.";
    }
    
    if (!submitterEmail.trim()) {
      newErrors.submitterEmail = "Submitter email cannot be empty.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail)) {
      newErrors.submitterEmail = "Please enter a valid email address.";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
      if (validTypes.includes(selectedFile.type)) {
        setFile(selectedFile);
        setErrors(prev => ({ ...prev, file: undefined }));
      } else {
        setFile(null);
        setErrors(prev => ({ ...prev, file: "Please select a valid image file (png, jpg, jpeg)." }));
      }
    }
  };

  const handleSubmit = () => {
    if (validateForm()) {
      // TODO: Handle form submission
      console.log({
        file,
        comment,
        submitterName,
        submitterEmail,
        receiveEmail
      });
      
      // Reset form and close dialog
      setFile(null);
      setComment("");
      setSubmitterName("");
      setSubmitterEmail("");
      setReceiveEmail(false);
      setErrors({});
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    setFile(null);
    setComment("");
    setSubmitterName("");
    setSubmitterEmail("");
    setReceiveEmail(false);
    setErrors({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Image</DialogTitle>
          <DialogDescription>
            Upload an image for this catalog record along with any comments or corrections.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file">
              File: (ONLY png, jpg, jpeg)
            </Label>
            <div className="flex items-center gap-4">
              <Input
                id="file"
                type="file"
                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                onChange={handleFileChange}
                className="cursor-pointer"
              />
            </div>
            {errors.file && (
              <p className="text-sm text-destructive">{errors.file}</p>
            )}
          </div>

          {/* Comment / Correction */}
          <div className="space-y-2">
            <Label htmlFor="comment">
              Comment / Correction
            </Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          {/* Submitter Name */}
          <div className="space-y-2">
            <Label htmlFor="submitterName">
              Submitter name *
            </Label>
            <Input
              id="submitterName"
              type="text"
              value={submitterName}
              onChange={(e) => {
                setSubmitterName(e.target.value);
                if (e.target.value.trim()) {
                  setErrors(prev => ({ ...prev, submitterName: undefined }));
                }
              }}
            />
            {errors.submitterName && (
              <p className="text-sm text-destructive">{errors.submitterName}</p>
            )}
          </div>

          {/* Submitter Email */}
          <div className="space-y-2">
            <Label htmlFor="submitterEmail">
              Submitter email *
            </Label>
            <Input
              id="submitterEmail"
              type="email"
              value={submitterEmail}
              onChange={(e) => {
                setSubmitterEmail(e.target.value);
                if (e.target.value.trim()) {
                  setErrors(prev => ({ ...prev, submitterEmail: undefined }));
                }
              }}
            />
            {errors.submitterEmail && (
              <p className="text-sm text-destructive">{errors.submitterEmail}</p>
            )}
          </div>

          {/* Email Notification Checkbox */}
          <div className="flex items-start space-x-3 pt-2">
            <Checkbox
              id="receiveEmail"
              checked={receiveEmail}
              onCheckedChange={(checked) => setReceiveEmail(checked as boolean)}
            />
            <Label
              htmlFor="receiveEmail"
              className="leading-relaxed cursor-pointer"
            >
              Would you like to receive an email after the admin has seen it?
            </Label>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
            >
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
