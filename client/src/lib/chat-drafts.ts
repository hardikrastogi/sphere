export const CHAT_DRAFT_KEY_PREFIX = 'sphere_chat_draft:';

export function clearAllChatDrafts() {
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(CHAT_DRAFT_KEY_PREFIX))
      .forEach((k) => window.localStorage.removeItem(k));
  } catch {}
}
