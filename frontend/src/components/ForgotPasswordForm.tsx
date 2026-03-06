import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Formik, Form, Field, FormikHelpers } from "formik";

interface ForgotPasswordValues {
  email: string;
}

const validateForgotPassword = (
  values: ForgotPasswordValues
): Partial<Record<keyof ForgotPasswordValues, string>> => {
  const errors: Partial<Record<keyof ForgotPasswordValues, string>> = {};

  if (!values.email?.trim()) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = "Please enter a valid email address";
  }

  return errors;
};

interface ForgotPasswordFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ForgotPasswordForm = ({ open, onOpenChange }: ForgotPasswordFormProps) => {
  const { toast } = useToast();

  const handleSubmit = async (
    values: ForgotPasswordValues,
    { setSubmitting, resetForm }: FormikHelpers<ForgotPasswordValues>
  ) => {
    try {
      const base = import.meta.env.VITE_API_URL;
      if (!base || typeof base !== "string" || base.trim() === "") {
        toast({
          title: "Password reset unavailable",
          description: "API URL is not configured. Please contact support.",
          variant: "destructive",
        });
        return;
      }

      const trimmed = base.trim().replace(/\/+$/, "");
      const url = `${trimmed}/api/forgot-password/`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: values.email.trim().toLowerCase(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      const anyData = data as { detail?: string; message?: string } | null;

      if (!res.ok) {
        const message =
          anyData?.detail ||
          anyData?.message ;

        toast({
          title: "Unable to start password reset",
          description: message,
          variant: "destructive",
        });
        return;
      }

      const successMessage =
        anyData?.detail ||
        anyData?.message;

      toast({
        title: "Check your email",
        description: successMessage,
      });

      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to start password reset.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Forgot password</DialogTitle>
          <DialogDescription>
            Enter the email associated with your account and we&apos;ll send you a link to reset your password.
          </DialogDescription>
        </DialogHeader>

        <Formik
          initialValues={{ email: "" }}
          validate={validateForgotPassword}
          validateOnMount
          onSubmit={handleSubmit}
        >
          {({ errors, touched, isSubmitting, isValid }) => (
            <Form className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Field
                  as={Input}
                  id="forgot-email"
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                  aria-invalid={!!(touched.email && errors.email)}
                  aria-describedby={touched.email && errors.email ? "forgot-email-error" : undefined}
                  className={touched.email && errors.email ? "border-destructive" : ""}
                />
                {touched.email && errors.email && (
                  <p id="forgot-email-error" className="text-sm text-destructive">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!isValid || isSubmitting}>
                  {isSubmitting ? "Sending..." : "Send reset link"}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
};

