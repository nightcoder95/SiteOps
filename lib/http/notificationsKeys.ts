// Shared SWR key for the header's unread-badge query. Centralised so the
// AppHeader consumer and any mutator (e.g. the notifications page after
// mark-as-read) revalidate the exact same cache entry.
export const UNREAD_BADGE_KEY = '/api/notifications?limit=1&unreadOnly=true';
