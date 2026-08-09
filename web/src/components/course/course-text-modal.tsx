"use client";

import { HelpSectionHeading } from "@/components/help-link-icon";

type Props = {
  open: boolean;
  initialText?: string;
  title?: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
};

export function CourseTextModal({
  open,
  initialText = "",
  title = "Ange text",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const text = String(fd.get("text") ?? "").trim();
          if (text) onConfirm(text);
        }}
      >
        <HelpSectionHeading section="bana" as="h3" className="text-lg font-medium text-slate-900">
          {title}
        </HelpSectionHeading>
        <input
          name="text"
          type="text"
          defaultValue={initialText}
          autoFocus
          maxLength={200}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Text på kartan"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
          >
            Avbryt
          </button>
          <button
            type="submit"
            className="rounded-lg bg-ifk-blue px-3 py-1.5 text-sm font-medium text-white"
          >
            Spara
          </button>
        </div>
      </form>
    </div>
  );
}
