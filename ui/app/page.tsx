import type { Metadata } from "next";
import { Rahmen } from "@/components/Rahmen";
import { Uebersicht } from "@/components/seiten/Uebersicht";

// Die Titel-Vorlage aus dem Layout gilt nicht für die Startseite im selben Segment.
export const metadata: Metadata = { title: { absolute: "Übersicht · Lion OS" } };

export default function Seite() {
  return (
    <Rahmen>
      <Uebersicht />
    </Rahmen>
  );
}
