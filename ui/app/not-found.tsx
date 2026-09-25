import Link from "next/link";
import { Zugang } from "@/components/Zugang";

export default function NichtGefunden() {
  return (
    <Zugang titel="Seite nicht gefunden" text="Diese Adresse gibt es in Lion OS nicht.">
      <Link
        href="/"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-feld bg-gold px-4 text-sm font-semibold text-auf-gold hover:bg-gold-hell"
      >
        Zur Startseite
      </Link>
    </Zugang>
  );
}
