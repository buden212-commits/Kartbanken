"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { RegisterForm } from "@/components/register-form";

type AuthTab = "login" | "register";

export function AuthTabs() {
  const searchParams = useSearchParams();
  const initialTab: AuthTab = searchParams.get("tab") === "register" ? "register" : "login";
  const [tab, setTab] = useState<AuthTab>(initialTab);

  return (
    <div>
      <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setTab("login")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "login"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Logga in
        </button>
        <button
          type="button"
          onClick={() => setTab("register")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "register"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Skapa konto
        </button>
      </div>

      <div className="mt-6">{tab === "login" ? <LoginForm /> : <RegisterForm />}</div>
    </div>
  );
}
