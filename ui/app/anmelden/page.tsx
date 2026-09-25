import type { Metadata } from "next";
import { Anmelden } from "@/components/seiten/Anmelden";

export const metadata: Metadata = { title: "Anmelden" };

export default function Seite() {
  return <Anmelden />;
}
