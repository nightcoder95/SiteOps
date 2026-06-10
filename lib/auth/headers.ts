import { isRole, type Role } from "@/lib/auth/roles";

export const AUTH_USER_ID_HEADER = "x-siteops-user-id";
export const AUTH_USER_EMAIL_HEADER = "x-siteops-user-email";
export const AUTH_USER_ROLE_HEADER = "x-siteops-user-role";

export function parseSessionRole(value: string | null | undefined): Role | null {
  return isRole(value) ? value : null;
}
