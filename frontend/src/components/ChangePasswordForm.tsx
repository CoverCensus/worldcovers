import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Formik, Form, Field, FormikHelpers } from "formik";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const validateChangePassword = (
  values: ChangePasswordValues
): Partial<Record<keyof ChangePasswordValues, string>> => {
  const errors: Partial<Record<keyof ChangePasswordValues, string>> = {};

  if (!values.currentPassword) {
    errors.currentPassword = "Current password is required";
  }

  if (!values.newPassword) {
    errors.newPassword = "New password is required";
  } else if (values.newPassword.length < 8) {
    errors.newPassword = "Password must be at least 8 characters long";
  } else {
    if (!/[A-Z]/.test(values.newPassword)) {
      errors.newPassword = "Password must include at least one uppercase letter";
    } else if (!/[a-z]/.test(values.newPassword)) {
      errors.newPassword = "Password must include at least one lowercase letter";
    } else if (!/[0-9]/.test(values.newPassword)) {
      errors.newPassword = "Password must include at least one number";
    } else if (!/[!@#$%^&*(),.?":{}|<>_\-+=\\[\];'/`~]/.test(values.newPassword)) {
      errors.newPassword = "Password must include at least one special character";
    }
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = "Please confirm your new password";
  } else if (values.newPassword && values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  return errors;
};

interface ChangePasswordFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when user chooses to sign out (e.g. after "current password incorrect" error) */
  onSignOut?: () => void | Promise<void>;
}

export const ChangePasswordForm = ({ open, onOpenChange, onSignOut }: ChangePasswordFormProps) => {
  const { toast } = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) setSubmitError(null);
    onOpenChange(next);
  };

  const handleSubmit = async (
    values: ChangePasswordValues,
    { setSubmitting, resetForm }: FormikHelpers<ChangePasswordValues>
  ) => {
    try {
      // Use relative URL when VITE_API_URL is empty (proxy); otherwise use full API URL
      const base = import.meta.env.VITE_API_URL || "";
      const url = base ? `${String(base).replace(/\/+$/, "")}/api/change-password/` : "/api/change-password/";

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          current_password: values.currentPassword,
          new_password: values.newPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));
      const anyData = data as { detail?: string; message?: string } | null;
      const apiMessage = anyData?.detail || anyData?.message;

      if (!res.ok) {
        let title = "Unable to change password";
        let description = apiMessage || "Please try again.";

        if (res.status === 403) {
          title = "Access denied";
          description =
            apiMessage ||
            "Your session may have expired or you are not signed in. Please sign in again and try changing your password.";
          setSubmitError(description);
        } else if (res.status === 401) {
          title = "Sign in required";
          description =
            apiMessage ||
            "You must be signed in to change your password. Please sign in and try again.";
          setSubmitError(description);
        } else if (res.status === 400 && apiMessage?.toLowerCase().includes("incorrect")) {
          setSubmitError(description);
        }

        toast({
          title,
          description,
          variant: "destructive",
        });
        return;
      }

      setSubmitError(null);

      toast({
        title: "Password changed",
        description: anyData?.detail || "Your password has been changed successfully.",
      });

      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to change password.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Enter your current password and choose a new password for your account.
          </DialogDescription>
        </DialogHeader>

        <Formik
          initialValues={{ currentPassword: "", newPassword: "", confirmPassword: "" }}
          validate={validateChangePassword}
          validateOnMount
          onSubmit={handleSubmit}
        >
          {({ errors, touched, isSubmitting, isValid }) => (
            <Form className="space-y-2 sm:space-y-4">
              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <div className="relative">
                  <Field
                    as={Input}
                    id="current-password"
                    name="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    placeholder="Enter your current password"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:bg-transparent hover:text-foreground"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Field
                    as={Input}
                    id="new-password"
                    name="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Enter a new password"
                    aria-invalid={!!(touched.newPassword && errors.newPassword)}
                    aria-describedby={
                      touched.newPassword && errors.newPassword ? "new-password-error" : undefined
                    }
                    className={
                      (touched.newPassword && errors.newPassword ? "border-destructive " : "") + "pr-10"
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:bg-transparent hover:text-foreground"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {touched.newPassword && errors.newPassword && (
                  <p id="new-password-error" className="text-sm text-destructive">
                    {errors.newPassword}
                  </p>
                )}
              </div>

              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <div className="relative">
                  <Field
                    as={Input}
                    id="confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Re-enter your new password"
                    aria-invalid={!!(touched.confirmPassword && errors.confirmPassword)}
                    aria-describedby={
                      touched.confirmPassword && errors.confirmPassword ? "confirm-password-error" : undefined
                    }
                    className={
                      (touched.confirmPassword && errors.confirmPassword ? "border-destructive " : "") + "pr-10"
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:bg-transparent hover:text-foreground"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {touched.confirmPassword && errors.confirmPassword && (
                  <p id="confirm-password-error" className="text-sm text-destructive">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2 sm:pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!isValid || isSubmitting}>
                  {isSubmitting ? "Changing..." : "Change password"}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
};
