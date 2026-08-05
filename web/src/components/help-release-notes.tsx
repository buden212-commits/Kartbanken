import { formatReleaseNoteDate, releaseNotes } from "@/lib/help/release-notes";

export function HelpReleaseNotes() {
  return (
    <section id="release-notes" className="scroll-mt-24">
      <h2 className="text-xl font-semibold text-slate-900">Release notes</h2>
      <p className="mt-4 text-sm leading-relaxed text-slate-700">
        Här dokumenteras större tillägg och förändringar i systemet, sorterade med nyast först.
      </p>

      <div className="mt-6 space-y-6">
        {releaseNotes.map((note) => (
          <article
            key={`${note.date}-${note.title}`}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <time
                dateTime={note.date}
                className="text-xs font-semibold uppercase tracking-wide text-ifk-blue"
              >
                {formatReleaseNoteDate(note.date)}
              </time>
              <h3 className="text-base font-semibold text-slate-900">{note.title}</h3>
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
              {note.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
