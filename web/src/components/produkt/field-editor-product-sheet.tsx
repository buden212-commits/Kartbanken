"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type CSSProperties } from "react";

import "./field-editor-product-sheet.css";

const FEATURES = [
  {
    title: "Reservera området",
    body: "Rita en polygon (max 1 km²) kring det du ska jobba med. Bara utcheckat område laddas i editorn — du ser låsta ytor och kan fortsätta senare.",
    image: "/produkt/faltredigering/ui-skapa-karta.png",
    imageAlt: "Skärmdump: välja område med polygon på kartan före fältredigering",
    caption: "Bild — Starta fältredigering: rita polygon och bekräfta området",
  },
  {
    title: "Rita som i OCAD",
    body: "Punkt, linje och yta — plus frihand, cirkel, ellips, rektangel och Bézier. Riktiga OCAD-symboler, snappning och CAD-verktyg som Fyll yta.",
    image: "/produkt/faltredigering/ui-rita-karta.png",
    imageAlt: "Skärmdump: fältredigeraren med kartan, ritverktyg och CAD-panelen",
    caption: "Bild — Editorn: verktygsrad, snappning och CAD (bl.a. Fyll yta)",
  },
  {
    title: "GPS och position",
    body: "Min position på georefererade kartor. Spåra stigar och ytor medan du går — byggd för telefon och surfplatta ute i terrängen.",
    image: "/produkt/faltredigering/ui-editor-karta.png",
    imageAlt: "Skärmdump: fältredigeraren med zoom, Hela kartan och Min position",
    caption: "Bild — Kartvy med zoom, Hela kartan och Min position",
  },
  {
    title: "Incheckning med koll",
    body: "Spara lokalt, checka in och låt admin godkänna. Jämförelsekartan visar raderat, ändrat och nytt innan det blir ny version.",
    image: "/produkt/faltredigering/ui-incheckning-karta.png",
    imageAlt: "Skärmdump: granskning med jämförelsekarta och sammanfattning av ändringar",
    caption: "Bild — Granskning: jämförelse före admin-godkännande",
  },
] as const;

function useReveal() {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return rootRef;
}

export function FieldEditorProductSheet() {
  const rootRef = useReveal();

  return (
    <article
      ref={rootRef}
      className="fe-sheet bg-[var(--fe-ground)] text-[var(--fe-ink)]"
      style={
        {
          "--fe-ink": "#0a2438",
          "--fe-ink-soft": "#3d5568",
          "--fe-blue": "#004c88",
          "--fe-blue-bright": "#1a7ec4",
          "--fe-ground": "#f3f7fb",
          "--fe-panel": "#ffffff",
          fontFamily: "var(--font-fe-body), system-ui, sans-serif",
        } as CSSProperties
      }
    >
      {/* Hero — one composition */}
      <header className="fe-hero relative isolate min-h-[100svh] overflow-hidden text-white">
        <div className="absolute inset-0">
          <Image
            src="/produkt/faltredigering/hero.jpg"
            alt="Orienterare redigerar karta på mobil i skogen"
            fill
            priority
            className="fe-hero-media object-cover"
            sizes="100vw"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(105deg, rgba(4,28,48,0.88) 0%, rgba(4,28,48,0.55) 42%, rgba(4,28,48,0.18) 100%)",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-5 pb-14 pt-28 sm:px-8 sm:pb-20">
          <p
            className="mb-3 text-[clamp(1.35rem,3.5vw,2.15rem)] font-bold tracking-tight text-white"
            style={{ fontFamily: "var(--fe-display)" }}
          >
            kartor.ifkmora.se
          </p>
          <h1
            className="max-w-[12ch] text-[clamp(2.4rem,7.5vw,4.5rem)] leading-[0.95] font-extrabold tracking-tight text-white/95"
            style={{ fontFamily: "var(--fe-display)" }}
          >
            Fältredigering
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-white/90 sm:text-xl">
            Redigera orienteringskartan i terrängen — direkt i webbläsaren, utan OCAD.
          </p>
          <div className="fe-no-print mt-8 flex flex-wrap gap-3">
            <Link
              href="/login?callbackUrl=/"
              className="inline-flex items-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[var(--fe-blue)] transition hover:bg-[var(--fe-ground)]"
            >
              Logga in och börja
            </Link>
            <Link
              href="/hjalp/guide#faltredigering"
              className="inline-flex items-center rounded-lg border border-white/40 px-5 py-3 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10"
            >
              Läs hur det funkar
            </Link>
          </div>
        </div>
      </header>

      {/* Promise */}
      <section className="fe-section mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-28">
        <h2
          data-reveal
          className="text-[clamp(1.85rem,4.5vw,3rem)] leading-tight font-bold tracking-tight text-[var(--fe-ink)]"
          style={{ fontFamily: "var(--fe-display)" }}
        >
          Kartjobb i fält — utan att ta med OCAD
        </h2>
        <p
          data-reveal="late"
          className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[var(--fe-ink-soft)] sm:text-lg"
        >
          Reservera upp till 1&nbsp;km², ändra objekt med riktiga ISOM-symboler och checka in för
          godkännande. Samma karta. Snabbare svängar.
        </p>
      </section>

      {/* Feature sections with real UI screenshots */}
      {FEATURES.map((feature, index) => {
        const imageLeft = index % 2 === 1;
        return (
          <section key={feature.title} className="fe-section border-t border-slate-200/80">
            <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-14">
              <figure
                data-reveal
                className={imageLeft ? "lg:order-1" : "lg:order-2"}
              >
                <div className="overflow-hidden rounded-sm border border-slate-200/90 bg-white shadow-[0_12px_40px_-24px_rgba(10,36,56,0.45)]">
                  <Image
                    src={feature.image}
                    alt={feature.imageAlt}
                    width={2200}
                    height={1600}
                    className="h-auto w-full"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </div>
                <figcaption className="mt-3 text-sm text-[var(--fe-ink-soft)]">
                  {feature.caption}
                </figcaption>
              </figure>
              <div
                data-reveal="late"
                className={imageLeft ? "lg:order-2" : "lg:order-1"}
              >
                <h2
                  className="text-[clamp(1.75rem,3.5vw,2.6rem)] leading-tight font-bold tracking-tight"
                  style={{ fontFamily: "var(--fe-display)" }}
                >
                  {feature.title}
                </h2>
                <p className="mt-4 max-w-md text-base leading-relaxed text-[var(--fe-ink-soft)] sm:text-lg">
                  {feature.body}
                </p>
              </div>
            </div>
          </section>
        );
      })}

      {/* Capability strip */}
      <section className="fe-section border-t border-slate-200/80 bg-[linear-gradient(180deg,#e8f4fc_0%,#f3f7fb_100%)]">
        <div className="mx-auto max-w-4xl px-5 py-20 sm:px-8 sm:py-24">
          <h2
            data-reveal
            className="text-center text-[clamp(1.75rem,3.5vw,2.6rem)] leading-tight font-bold tracking-tight"
            style={{ fontFamily: "var(--fe-display)" }}
          >
            Byggd för kartläggare
          </h2>
          <ul
            data-reveal="late"
            className="mt-12 space-y-0 divide-y divide-slate-300/70 border-y border-slate-300/70"
          >
            {[
              "CAD-verktyg: klipp, sammanfoga, fyll yta, förenkla, Bézier",
              "Snappning mot samma symbol — som i OCAD",
              "Ångra upp till tio steg, favoritsymboler per konto",
              "Behörighet styrs per användare — admin godkänner alltid",
            ].map((item) => (
              <li key={item} className="py-4 text-base text-[var(--fe-ink)] sm:text-lg">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="fe-section relative isolate overflow-hidden text-white">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 20% 0%, #1a7ec4 0%, #004c88 45%, #062338 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 Q20 20 40 40 T80 40' fill='none' stroke='white' stroke-width='1'/%3E%3C/svg%3E\")",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 py-24 text-center sm:px-8 sm:py-28">
          <h2
            data-reveal
            className="text-[clamp(1.85rem,4vw,3rem)] leading-tight font-bold tracking-tight"
            style={{ fontFamily: "var(--fe-display)" }}
          >
            Nästa terrängbesök blir en kartuppdatering
          </h2>
          <p
            data-reveal="late"
            className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-white/85 sm:text-lg"
          >
            Öppna området, starta fältredigering och rita det du ser — sedan checkar du in.
          </p>
          <div
            data-reveal="later"
            className="fe-no-print mt-8 flex flex-wrap justify-center gap-3"
          >
            <Link
              href="/login?callbackUrl=/"
              className="inline-flex items-center rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[var(--fe-blue)] transition hover:bg-[var(--fe-ground)]"
            >
              Logga in
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center rounded-lg border border-white/40 px-5 py-3 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10"
            >
              Skriv ut produktblad
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-5 py-8 text-center text-sm text-[var(--fe-ink-soft)] sm:px-8">
        <p>
          <span className="font-semibold text-[var(--fe-blue)]">IFK Mora OK</span>
          {" · "}
          <Link href="/" className="hover:text-[var(--fe-blue)]">
            kartor.ifkmora.se
          </Link>
          {" · "}
          <Link href="/hjalp/guide#faltredigering" className="hover:text-[var(--fe-blue)]">
            Guide till fältredigering
          </Link>
        </p>
      </footer>
    </article>
  );
}
