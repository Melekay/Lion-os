import type { Metadata } from "next";
import { Rahmen } from "@/components/Rahmen";
import { Einstellungen } from "@/components/seiten/Einstellungen";

export const metadata: Metadata = { title: "Einstellungen" };

export default function Seite() {
  return (
    <Rahmen>
      <Einstellungen />
    </Rahmen>
  );
}
