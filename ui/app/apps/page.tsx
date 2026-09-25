import type { Metadata } from "next";
import { Rahmen } from "@/components/Rahmen";
import { Apps } from "@/components/seiten/Apps";

export const metadata: Metadata = { title: "Apps" };

export default function Seite() {
  return (
    <Rahmen>
      <Apps />
    </Rahmen>
  );
}
