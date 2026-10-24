import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountPost, needsEmailVerification } from "@/services/account";

interface RequestLoginFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const RequestLoginForm = (props: RequestLoginFormProps) => props.open ? <SignupDialog {...props} /> : null;

const SignupDialog = ({ open, onOpenChange }: RequestLoginFormProps) => {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const password = String(fields.get("password") || "");
    if (password !== fields.get("confirmation")) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await accountPost("signup", {
        first_name: String(fields.get("first_name") || "").trim(),
        last_name: String(fields.get("last_name") || "").trim(),
        email: String(fields.get("email") || "").trim(),
        password,
      });
      if (!needsEmailVerification(response)) throw new Error("Unable to complete signup. Please try signing in.");
      form.reset();
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the account.");
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
    <DialogContent className="max-w-md p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle>{sent ? "Check your email" : "Create account"}</DialogTitle>
        <DialogDescription>{sent
          ? "Follow the verification link, then sign in with your password. Check your spam folder too."
          : "Verify your email to contribute to the catalog. Editor access is assigned separately."}</DialogDescription>
      </DialogHeader>
      {sent ? <>
        <p role="status">If you already have an account, sign in or use Forgot password. To request another verification link, sign in again with your password.</p>
        <Button onClick={() => onOpenChange(false)}>Back to sign in</Button>
      </> : <form onSubmit={submit} className="space-y-3">
        <Label htmlFor="signup-first">First name</Label>
        <Input id="signup-first" name="first_name" autoComplete="given-name" maxLength={150} required />
        <Label htmlFor="signup-last">Last name</Label>
        <Input id="signup-last" name="last_name" autoComplete="family-name" maxLength={150} required />
        <Label htmlFor="signup-email">Email</Label>
        <Input id="signup-email" name="email" type="email" autoComplete="email" required />
        <Label htmlFor="signup-password">Password</Label>
        <Input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} required aria-describedby="signup-password-help" />
        <p id="signup-password-help" className="text-sm text-muted-foreground">Use at least eight characters, with an uppercase letter, a lowercase letter, a number, and a symbol.</p>
        <Label htmlFor="signup-confirm">Confirm password</Label>
        <Input id="signup-confirm" name="confirmation" type="password" autoComplete="new-password" required />
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Creating account..." : "Create account"}</Button>
      </form>}
    </DialogContent>
  </Dialog>;
};
