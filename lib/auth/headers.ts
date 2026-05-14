export const AUTH_USER_ID_HEADER = "x-siteops-user-id";
export const AUTH_USER_EMAIL_HEADER = "x-siteops-user-email";
export const AUTH_USER_ROLE_HEADER = "x-siteops-user-role";

export type HeaderSessionRole = "Admin" | "Supervisor";

export function parseSessionRole(value: string | null | undefined): HeaderSessionRole | null {
  if (value === "Admin" || value === "Supervisor") {
    return value;
  }
  return null;
}
