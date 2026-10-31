/**
 * Temporary gate until owner authentication exists (week 2).
 *
 * Private operations run in local development only. In production they
 * are refused, so a deployment can never expose an unprotected endpoint.
 * Week 2 replaces every call with requireOwner(), which checks the session.
 */
export function privateActionsAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}
