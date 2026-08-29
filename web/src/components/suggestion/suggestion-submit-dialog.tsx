"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { HelpSectionHeading } from "@/components/help-link-icon";
import { SuggestionCommentField } from "@/components/suggestion/suggestion-comment-field";
import { SuggestionLocationConfidenceField } from "@/components/suggestion/suggestion-location-confidence-field";
import type { OcadMapLayer } from "@/lib/ocad/layers";
import {
  buildSuggestionCommentTemplate,
  suggestionMarkingGeometryLabel,
} from "@/lib/suggestion/suggestion-comment-template";
import {
  DEFAULT_SUGGESTION_LOCATION_CONFIDENCE,
  SUGGESTION_CATEGORY_LABELS,
  type SuggestionCategoryValue,
  type SuggestionGeometry,
  type SuggestionLocationConfidenceValue,
} from "@/lib/suggestion/types";
import {
  createSuggestionDraftId,
  emptyCreateDraft,
  fileFromDraftPhoto,
  getSuggestionDraft,
  mergeSuggestionDraft,
} from "@/lib/suggestion/offline-drafts";
import { syncSuggestionDraft } from "@/lib/suggestion/offline-sync";

type Props = {
  mapSlug: string;
  versionId: string;
  markings: SuggestionGeometry[];
  ocadLayers: OcadMapLayer[];
  onClose: () => void;
  onRemoveMarking: (index: number) => void;
  onSubmitted: (suggestionId: string) => void;
  onQueued: () => void;
};

export function SuggestionSubmitDialog({
  mapSlug,
  versionId,
  markings,
  ocadLayers,
  onClose,
  onRemoveMarking,
  onSubmitted,
  onQueued,
}: Props) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const draftId = createSuggestionDraftId(mapSlug, versionId);
  const formReadyRef = useRef(false);

  const [category, setCategory] = useState<SuggestionCategoryValue>("FEL_I_TERRANG");
  const [locationConfidence, setLocationConfidence] = useState<SuggestionLocationConfidenceValue>(
    DEFAULT_SUGGESTION_LOCATION_CONFIDENCE,
  );
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState(() => buildSuggestionCommentTemplate(markings));
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const attachmentPreviewRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const draft = await getSuggestionDraft(draftId);
      if (cancelled) return;
      if (draft) {
        setCategory(draft.category);
        setLocationConfidence(draft.locationConfidence);
        setTitle(draft.title);
        if (draft.comment.trim()) setComment(draft.comment);
        const file = fileFromDraftPhoto(draft);
        if (file) applyAttachmentFile(file);
      }
      formReadyRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // applyAttachmentFile is stable enough via ref usage below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  useEffect(() => {
    return () => {
      if (attachmentPreviewRef.current) {
        URL.revokeObjectURL(attachmentPreviewRef.current);
        attachmentPreviewRef.current = null;
      }
    };
  }, []);

  const applyAttachmentFile = useCallback((file: File | null) => {
    setAttachmentFile(file);
    if (attachmentPreviewRef.current) {
      URL.revokeObjectURL(attachmentPreviewRef.current);
      attachmentPreviewRef.current = null;
    }
    const preview = file ? URL.createObjectURL(file) : null;
    attachmentPreviewRef.current = preview;
    setAttachmentPreview(preview);
  }, []);

  useEffect(() => {
    if (!formReadyRef.current) return;
    const timer = window.setTimeout(() => {
      void mergeSuggestionDraft(
        draftId,
        {
          category,
          locationConfidence,
          title,
          comment,
          photoBlob: attachmentFile,
          photoName: attachmentFile?.name ?? null,
          photoType: attachmentFile?.type ?? null,
        },
        () => emptyCreateDraft({ mapSlug, versionId }),
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [attachmentFile, category, comment, draftId, locationConfidence, mapSlug, title, versionId]);

  const handleAttachmentChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      applyAttachmentFile(e.target.files?.[0] ?? null);
      e.target.value = "";
    },
    [applyAttachmentFile],
  );

  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (markings.length < 1) {
      setError("Lägg till minst en markering på kartan");
      return;
    }
    const submissionComment = comment.trim();
    if (submissionComment.length < 2) {
      setError("Beskrivning krävs (minst 2 tecken)");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const draft = await mergeSuggestionDraft(
        draftId,
        {
          markings,
          category,
          locationConfidence,
          title,
          comment: submissionComment,
          photoBlob: attachmentFile,
          photoName: attachmentFile?.name ?? null,
          photoType: attachmentFile?.type ?? null,
          wantsSync: true,
          lastError: null,
        },
        () => emptyCreateDraft({ mapSlug, versionId }),
      );
      const result = await syncSuggestionDraft(draft);
      if (result.ok) {
        router.push(`/maps/${mapSlug}/suggestions/${result.suggestionId}`);
        router.refresh();
        onSubmitted(result.suggestionId);
        return;
      }
      if (result.queued) {
        onQueued();
        return;
      }
      setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara kartförslaget");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggestion-submit-dialog-title"
        onSubmit={(e) => void handleSubmit(e)}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-lg sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <HelpSectionHeading section="kartforslag" id="suggestion-submit-dialog-title">
            Skicka in kartförslag
          </HelpSectionHeading>
          <button
            type="button"
            disabled={loading}
            onClick={handleClose}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Tillbaka
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Fyll i uppgifterna nedan och skicka in {markings.length}{" "}
          {markings.length === 1 ? "ändring" : "ändringar"} tillsammans.
        </p>
        <ul className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          {markings.map((marking, index) => (
            <li
              key={index}
              className="flex items-center justify-between gap-2 text-sm text-slate-600"
            >
              <span>
                {index + 1}. {suggestionMarkingGeometryLabel(marking)}
              </span>
              <button
                type="button"
                onClick={() => onRemoveMarking(index)}
                className="text-red-600 hover:underline"
              >
                Ta bort
              </button>
            </li>
          ))}
        </ul>
        <fieldset className="mt-4 space-y-4">
          <div>
            <label htmlFor="category" className="form-label">
              Kategori
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as SuggestionCategoryValue)}
              className="form-input"
            >
              {Object.entries(SUGGESTION_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <SuggestionLocationConfidenceField
            name="Hur säker är du på platsen på kartan?"
            value={locationConfidence}
            onChange={setLocationConfidence}
            idPrefix="submit-location-confidence"
          />
          <div>
            <label htmlFor="title" className="form-label">
              Rubrik (valfritt)
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="form-input"
              placeholder="Kort sammanfattning"
            />
          </div>
          <SuggestionCommentField
            value={comment}
            onChange={setComment}
            ocadLayers={ocadLayers}
            markings={markings}
            disabled={loading}
          />
          <div>
            <p className="form-label">Foto (valfritt)</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="min-h-10 rounded-lg border border-ifk-blue px-3 py-2 text-sm font-medium text-ifk-blue hover:bg-ifk-blue/5"
              >
                Ta foto
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Välj bild
              </button>
              {attachmentFile && (
                <button
                  type="button"
                  onClick={() => applyAttachmentFile(null)}
                  className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Ta bort foto
                </button>
              )}
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleAttachmentChange}
              className="sr-only"
              aria-hidden
              tabIndex={-1}
            />
            <input
              ref={galleryInputRef}
              id="attachment"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              onChange={handleAttachmentChange}
              className="sr-only"
              aria-hidden
              tabIndex={-1}
            />
            {attachmentFile && (
              <p className="mt-2 text-xs text-slate-500">{attachmentFile.name}</p>
            )}
            {attachmentPreview && (
              <img
                src={attachmentPreview}
                alt="Förhandsvisning av bilaga"
                className="mt-2 max-h-48 rounded-lg border border-slate-200 object-contain"
              />
            )}
          </div>
        </fieldset>
        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={handleClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Tillbaka
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Sparar…" : `Skicka in kartförslag (${markings.length} st)`}
          </button>
        </div>
      </form>
    </div>
  );
}
