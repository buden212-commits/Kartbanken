import type { SuggestionLocationConfidenceValue } from "@/lib/suggestion/types";
import {
  SUGGESTION_LOCATION_CONFIDENCE_LABELS,
  SUGGESTION_LOCATION_CONFIDENCE_ORDER,
  suggestionLocationConfidenceBadgeClass,
} from "@/lib/suggestion/types";

type Props = {
  name: string;
  value: SuggestionLocationConfidenceValue;
  onChange: (value: SuggestionLocationConfidenceValue) => void;
  idPrefix?: string;
};

export function SuggestionLocationConfidenceField({
  name,
  value,
  onChange,
  idPrefix = "location-confidence",
}: Props) {
  return (
    <fieldset>
      <legend className="form-label">{name}</legend>
      <p className="mt-1 text-xs text-slate-500">
        Hjälper redaktören att veta om markeringen ska tas som exakt eller bara som ungefärlig
        ledtråd.
      </p>
      <div className="mt-2 space-y-2">
        {SUGGESTION_LOCATION_CONFIDENCE_ORDER.map((option) => {
          const inputId = `${idPrefix}-${option}`;
          return (
            <label
              key={option}
              htmlFor={inputId}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 has-[:checked]:border-ifk-blue has-[:checked]:bg-ifk-blue/5"
            >
              <input
                id={inputId}
                type="radio"
                name={idPrefix}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                className="mt-0.5"
              />
              <span className="text-sm text-slate-800">
                {SUGGESTION_LOCATION_CONFIDENCE_LABELS[option]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SuggestionLocationConfidenceBadge({
  value,
}: {
  value: SuggestionLocationConfidenceValue;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${suggestionLocationConfidenceBadgeClass(value)}`}
    >
      {SUGGESTION_LOCATION_CONFIDENCE_LABELS[value]}
    </span>
  );
}
