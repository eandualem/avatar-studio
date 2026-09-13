import { historySchema, type Conversation } from "@/types/conversation";
const key = "avatar-studio.conversations.v1";
export function loadHistory(): Conversation[] {
  try {
    return historySchema.parse(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return [];
  }
}
export function saveHistory(history: Conversation[]) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(
        history
          .slice(0, 50)
          .map((c) => ({ ...c, messages: c.messages.slice(-400) })),
      ),
    );
  } catch {
    /* Chat still works when local storage is unavailable or full. */
  }
}
export const newConversation = (): Conversation => ({
  id: crypto.randomUUID(),
  title: "New conversation",
  messages: [],
});
