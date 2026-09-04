export type FieldEditEditorSettings = {
  snapEnabled: boolean;
  /** Snap tolerance on the ground (meters). */
  snapToleranceM: number;
  /** Corridor half-width for «Förenkla» (meters on each side of the line). */
  simplifyToleranceM: number;
};

export const DEFAULT_FIELD_EDIT_EDITOR_SETTINGS: FieldEditEditorSettings = {
  snapEnabled: true,
  snapToleranceM: 1.5,
  simplifyToleranceM: 2,
};

const STORAGE_KEY = "kartbanken-field-edit-editor-settings";

export function loadFieldEditEditorSettings(): FieldEditEditorSettings {
  if (typeof window === "undefined") return DEFAULT_FIELD_EDIT_EDITOR_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FIELD_EDIT_EDITOR_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<FieldEditEditorSettings>;
    return {
      snapEnabled:
        typeof parsed.snapEnabled === "boolean"
          ? parsed.snapEnabled
          : DEFAULT_FIELD_EDIT_EDITOR_SETTINGS.snapEnabled,
      snapToleranceM:
        typeof parsed.snapToleranceM === "number" && parsed.snapToleranceM > 0
          ? parsed.snapToleranceM
          : DEFAULT_FIELD_EDIT_EDITOR_SETTINGS.snapToleranceM,
      simplifyToleranceM:
        typeof parsed.simplifyToleranceM === "number" && parsed.simplifyToleranceM > 0
          ? parsed.simplifyToleranceM
          : DEFAULT_FIELD_EDIT_EDITOR_SETTINGS.simplifyToleranceM,
    };
  } catch {
    return DEFAULT_FIELD_EDIT_EDITOR_SETTINGS;
  }
}

export function saveFieldEditEditorSettings(settings: FieldEditEditorSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota errors
  }
}
