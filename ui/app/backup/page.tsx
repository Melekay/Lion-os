import type { Metadata } from "next";
import { Rahmen } from "@/components/Rahmen";
import { Backup } from "@/components/seiten/Backup";

export const metadata: Metadata = { title: "Backup" };

export default function Seite() {
  return (
    <Rahmen>
      <Backup />
    </Rahmen>
  );
}
