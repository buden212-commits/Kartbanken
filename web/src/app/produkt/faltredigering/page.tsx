import type { Metadata } from "next";
import { Syne, Manrope } from "next/font/google";
import { FieldEditorProductSheet } from "@/components/produkt/field-editor-product-sheet";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-fe-display",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-fe-body",
});

export const metadata: Metadata = {
  title: "Fältredigering — kartor.ifkmora.se",
  description:
    "Redigera orienteringskartan i fält direkt i webbläsaren — utan OCAD. Rita, GPS-spåra och checka in för godkännande.",
  openGraph: {
    title: "Fältredigering — kartor.ifkmora.se",
    description:
      "Redigera orienteringskartan i fält direkt i webbläsaren — utan OCAD.",
    images: [{ url: "/produkt/faltredigering/hero.jpg" }],
  },
};

export default function FieldEditorProductPage() {
  return (
    <div className={`${syne.variable} ${manrope.variable}`}>
      <FieldEditorProductSheet />
    </div>
  );
}
