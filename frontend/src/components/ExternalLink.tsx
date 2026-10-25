import { forwardRef, useId, type AnchorHTMLAttributes } from "react";

// One place for links that leave the site in a new tab (T99): target + rel are
// set here so they cannot drift between copies, and assistive tech gets the new
// tab as a description rather than part of the link's name, so the visible text
// and the accessible name stay the same.
export const NEW_TAB_HINT = "Opens in a new tab";

type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement>;

const ExternalLink = forwardRef<HTMLAnchorElement, ExternalLinkProps>(
  ({ children, ...props }, ref) => {
    const hintId = useId();
    return (
      <a ref={ref} target="_blank" rel="noopener noreferrer" aria-describedby={hintId} {...props}>
        {children}
        <span id={hintId} className="sr-only" aria-hidden="true">
          {NEW_TAB_HINT}
        </span>
      </a>
    );
  },
);

ExternalLink.displayName = "ExternalLink";

export { ExternalLink };
