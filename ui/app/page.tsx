import type { Metadata } from "next";
import { Rahmen } from "@/components/Rahmen";
import { Startseite } from "@/components/seiten/Startseite";

// Die Titel-Vorlage aus dem Layout gilt nicht für die Startseite im selben Segment.
export const metadata: Metadata = { title: { absolute: "Lion OS" } };

export default function Seite() {
  return (
    <Rahmen>
      <Startseite />
    </Rahmen>
  );
}
