// Mark a response as never-cacheable. Used on permission/profile-sensitive
// endpoints so a stale role/permission state is never served from the browser
// or service-worker cache (§8.5). Trade-off: these few endpoints aren't
// available offline — acceptable for permission state.
export function withNoStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}
