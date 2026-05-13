interface SessionUser {
  id: string;
  role: string;
}

export function checkOwnership(
  sessionUser: SessionUser,
  resourceOwnerId: string | null
): boolean {
  return sessionUser.role === "Admin" || sessionUser.id === resourceOwnerId;
}
