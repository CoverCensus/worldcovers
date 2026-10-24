import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Formik, Form, Field, FormikHelpers } from "formik";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearStoredUser } from "@/lib/auth";
import { passwordPost } from "@/services/account";
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
  const navigate = useNavigate();
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
      const data = await passwordPost("change-password", {
        current_password: values.currentPassword,
        new_password: values.newPassword,
      });
      clearStoredUser();
      setSubmitError(null);
      toast({ title: "Password changed", description: data.detail });
      resetForm();
      onOpenChange(false);
      navigate("/auth", { replace: true });
    } catch (err) {
      const description = err instanceof Error ? err.message : "Failed to change password.";
      setSubmitError(description);
      toast({ title: "Unable to change password", description, variant: "destructive" });

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
                    autoComplete="current-password"
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
                    autoComplete="new-password"
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
                    autoComplete="new-password"
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
