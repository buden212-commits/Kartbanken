/** Hjälpavsnitt på /hjalp — id matchar anchor i help-page-content.tsx */
export type HelpSectionId =
  | "oversikt"
  | "kom-igang"
  | "roller"
  | "omraden"
  | "versioner"
  | "checkout"
  | "bana"
  | "kartforslag"
  | "publicering"
  | "jamfor"
  | "verifiera"
  | "kartvy"
  | "feedback"
  | "admin"
  | "faq";

export const helpSectionLabels: Record<HelpSectionId, string> = {
  oversikt: "Översikt",
  "kom-igang": "Kom igång",
  roller: "Roller och behörigheter",
  omraden: "Områden",
  versioner: "Versionshantering",
  checkout: "Checka ut och in",
  bana: "Lägg bana",
  kartforslag: "Kartförslag",
  publicering: "Publicering",
  jamfor: "Jämföra versioner",
  verifiera: "Verifiera",
  kartvy: "Visa karta och export",
  feedback: "Feedback om tjänsten",
  admin: "Administration",
  faq: "Vanliga frågor",
};
