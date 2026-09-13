export interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: {
        results: {
          length: number;
          [index: number]: { isFinal: boolean; 0: { transcript: string } };
        };
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function recognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  const browser = window as SpeechWindow;
  return browser.SpeechRecognition || browser.webkitSpeechRecognition;
}
