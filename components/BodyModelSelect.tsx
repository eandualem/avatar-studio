"use client";
import { useState, useSyncExternalStore } from "react";
import {
  BODY_MODEL_OPTIONS,
  currentBodyModel,
  setBodyModel,
  subscribeBodyModel,
} from "@/lib/body-model";

const CUSTOM = "__custom__";

/**
 * Chooses which model plans Charlie's movement. Applies to the next Body
 * decision; the runtime must have that provider configured.
 */
export function BodyModelSelect({ disabled = false }: { disabled?: boolean }) {
  const model = useSyncExternalStore(
    subscribeBodyModel,
    currentBodyModel,
    () => "",
  );
  const known = BODY_MODEL_OPTIONS.some((o) => o.id === model);
  // "Other…" stays open after the user picks it; a stored custom id opens it too.
  const [customChosen, setCustomChosen] = useState(false);
  const custom = customChosen || !known;
  const [draft, setDraft] = useState(known ? "" : model);
  const [invalid, setInvalid] = useState(false);
  return (
    <div className="body-model">
      <label>
        Body model
        <select
          value={custom ? CUSTOM : model}
          disabled={disabled}
          onChange={(event) => {
            if (event.target.value === CUSTOM) {
              setCustomChosen(true);
              setDraft(known ? "" : model);
              return;
            }
            setCustomChosen(false);
            setInvalid(false);
            setBodyModel(event.target.value);
          }}
        >
          {BODY_MODEL_OPTIONS.map((option) => (
            <option key={option.id || "default"} value={option.id}>
              {option.label}
            </option>
          ))}
          <option value={CUSTOM}>Other…</option>
        </select>
      </label>
      {custom && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setInvalid(!setBodyModel(draft));
          }}
        >
          <input
            value={draft}
            disabled={disabled}
            placeholder="provider:model"
            aria-label="Custom body model id"
            aria-invalid={invalid}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" disabled={disabled}>
            Use
          </button>
        </form>
      )}
      <small>
        {invalid
          ? "Use provider:model, lowercase."
          : (BODY_MODEL_OPTIONS.find((o) => o.id === model)?.note ??
            "Applies to the next movement decision.")}
      </small>
    </div>
  );
}
