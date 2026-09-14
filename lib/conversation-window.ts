import type { Message } from "@/types/conversation";

// Conservative escaped-JSON size also bounds UTF-8 history bytes and the
// runtime's Python ensure_ascii context accounting, including non-Latin text.
const size = (value: unknown) =>
  JSON.stringify(value).replace(/[^\x00-\x7f]/g, "\\u0000").length;
export function conversationWindow(
  messages: Message[],
  budget = 6500,
): Message[] {
  const result: Message[] = [];
  let used = 2;
  for (const { id, role, content } of messages.slice(-80).reverse()) {
    if (!content.trim()) continue;
    const next = { id: id.slice(0, 128), role, content };
    if (size(next) + used + 1 > budget) {
      const chars = Array.from(content);
      let low = 0,
        high = chars.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (
          size({ ...next, content: chars.slice(-mid).join("") }) + used + 1 <=
          budget
        )
          low = mid;
        else high = mid - 1;
      }
      if (low) result.unshift({ ...next, content: chars.slice(-low).join("") });
      break;
    }
    result.unshift(next);
    used += size(next) + 1;
  }
  return result;
}
