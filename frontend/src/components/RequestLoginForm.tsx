import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Formik, Form, Field, FormikHelpers } from "formik";

interface RequestLoginFormValues {
  firstName: string;
  lastName: string;
  email: string;
}

const validateRequestLogin = (values: RequestLoginFormValues): Partial<Record<keyof RequestLoginFormValues, string>> => {
  const errors: Partial<Record<keyof RequestLoginFormValues, string>> = {};

  if (!values.firstName?.trim()) {
    errors.firstName = "First name is required";
  }

  if (!values.lastName?.trim()) {
    errors.lastName = "Last name is required";
  }

  if (!values.email?.trim()) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = "Please enter a valid email address";
  }

  return errors;
};

interface RequestLoginFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const RequestLoginForm = ({ open, onOpenChange }: RequestLoginFormProps) => {
  const { toast } = useToast();

  const handleSubmit = async (
    values: RequestLoginFormValues,
    { setSubmitting, resetForm }: FormikHelpers<RequestLoginFormValues>
  ) => {
    try {
      const base = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api/v2').replace(/\/+$/, "");
      const res = await fetch(`${base}/login-requests/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          first_name: values.firstName.trim(),
          last_name: values.lastName.trim(),
          email: values.email.trim().toLowerCase(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          (data as { email?: string[] }).email?.[0] ||
          (data as { detail?: string }).detail ||
          (data as { message?: string }).message ||
          (typeof data === "string" ? data : "Failed to submit request");
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Request submitted!",
        description: "We'll review your request and get back to you soon.",
      });

      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to submit request",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Request Login Access</DialogTitle>
          <DialogDescription>
            Fill out this form to request access to contribute to the catalog.
          </DialogDescription>
        </DialogHeader>

        <Formik
          initialValues={{ firstName: "", lastName: "", email: "" }}
          validate={validateRequestLogin}
          validateOnMount
          onSubmit={handleSubmit}
        >
          {({ errors, touched, isSubmitting, isValid }) => (
            <Form className="space-y-2 sm:space-y-4">
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="request-firstName">First Name</Label>
                  <Field
                    as={Input}
                    id="request-firstName"
                    name="firstName"
                    placeholder="First name"
                    aria-invalid={!!(touched.firstName && errors.firstName)}
                    aria-describedby={touched.firstName && errors.firstName ? "request-firstName-error" : undefined}
                    className={touched.firstName && errors.firstName ? "border-destructive" : ""}
                  />
                  {touched.firstName && errors.firstName && (
                    <p id="request-firstName-error" className="text-sm text-destructive">
                      {errors.firstName}
                    </p>
                  )}
                </div>

                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="request-lastName">Last Name</Label>
                  <Field
                    as={Input}
                    id="request-lastName"
                    name="lastName"
                    placeholder="Last name"
                    aria-invalid={!!(touched.lastName && errors.lastName)}
                    aria-describedby={touched.lastName && errors.lastName ? "request-lastName-error" : undefined}
                    className={touched.lastName && errors.lastName ? "border-destructive" : ""}
                  />
                  {touched.lastName && errors.lastName && (
                    <p id="request-lastName-error" className="text-sm text-destructive">
                      {errors.lastName}
                    </p>
                  )}
                </div>

              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="request-email">Email</Label>
                <Field
                  as={Input}
                  id="request-email"
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                  aria-invalid={!!(touched.email && errors.email)}
                  aria-describedby={touched.email && errors.email ? "request-email-error" : undefined}
                  className={touched.email && errors.email ? "border-destructive" : ""}
                />
                {touched.email && errors.email && (
                  <p id="request-email-error" className="text-sm text-destructive">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2 sm:pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!isValid || isSubmitting}>
                  {isSubmitting ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </Form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
};
