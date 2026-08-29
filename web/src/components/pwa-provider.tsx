"use client";

import { useCallback, useEffect, useState } from "react";
import { flushPendingSuggestionDrafts } from "@/lib/suggestion/offline-sync";

const DISMISS_KEY = "kartportalen-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isMobileMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(max-width: 768px)").matches ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function PwaProvider() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Kunde inte registrera service worker:", err);
      });
    }

    const flush = () => {
      void flushPendingSuggestionDrafts();
    };
    window.addEventListener("online", flush);
    flush();
    return () => window.removeEventListener("online", flush);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const timer = window.setTimeout(() => {
      if (isStandalone()) return;
      if (!isMobileMode()) return;
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
      setOpen(true);
    }, 800);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const close = useCallback(() => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  }, []);

  const install = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => undefined);
      setDeferredPrompt(null);
      close();
      return;
    }
    if (isIos()) {
      return;
    }
    close();
  }, [close, deferredPrompt]);

  if (!open || isStandalone()) return null;

  const ios = isIos() && !deferredPrompt;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        className="w-full max-w-md rounded-t-xl bg-white p-5 shadow-lg sm:rounded-xl"
      >
        <h2 id="pwa-install-title" className="text-lg font-medium text-slate-900">
          Installera appen
        </h2>
        {ios ? (
          <p className="mt-2 text-sm text-slate-600">
            Lägg till Kartportalen på hemskärmen så du kan lämna kartförslag i fält även när
            mottagningen dippar. Tryck <strong>Dela</strong> och välj{" "}
            <strong>Lägg till på hemskärmen</strong>.
          </p>
        ) : deferredPrompt ? (
          <p className="mt-2 text-sm text-slate-600">
            Installera Kartportalen som app på telefonen. Utkast och foto sparas på enheten och
            skickas när nätet kommer tillbaka.
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            Lägg till Kartportalen på hemskärmen (webbläsarens meny → Installera app) så utkast
            och foto klarar dålig mottagning i fält.
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Inte nu
          </button>
          {deferredPrompt ? (
            <button type="button" onClick={() => void install()} className="btn-primary">
              Installera
            </button>
          ) : (
            <button type="button" onClick={close} className="btn-primary">
              Jag förstår
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
