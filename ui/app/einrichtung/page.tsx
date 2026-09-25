import type { Metadata } from "next";
import { Einrichtung } from "@/components/seiten/Einrichtung";

export const metadata: Metadata = { title: "Einrichtung" };

export default function Seite() {
  return <Einrichtung />;
}
