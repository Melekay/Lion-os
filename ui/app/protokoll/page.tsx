import type { Metadata } from "next";
import { Rahmen } from "@/components/Rahmen";
import { Protokoll } from "@/components/seiten/Protokoll";

export const metadata: Metadata = { title: "Protokoll" };

export default function Seite() {
  return (
    <Rahmen>
      <Protokoll />
    </Rahmen>
  );
}
