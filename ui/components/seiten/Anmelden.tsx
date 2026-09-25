"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { lion } from "@/lib/api";
import { useSchonAngemeldet } from "../Sitzung";
import { Feld, Hinweis, Knopf, Lader } from "../ui";
import { Zugang } from "../Zugang";

export function Anmelden() {
  const router = useRouter();
  const pruefend = useSchonAngemeldet();
  const [name, setName] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);

  // Noch nicht eingerichtet? Dann gibt es niemanden zum Anmelden.
  useEffect(() => {
    lion
      .setupStatus()
      .then((s) => !s.eingerichtet && router.replace("/einrichtung/"))
      .catch(() => undefined);
  }, [router]);

  if (pruefend) return <Lader text="Einen Moment …" vollbild />;

  return (
    <Zugang titel="Anmelden" text="Melde dich mit deinem Lion-OS-Konto an.">
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setSendet(true);
          setFehler(null);
          try {
            await lion.anmelden({ name: name.trim(), passwort });
            router.replace("/");
          } catch (err) {
            setFehler(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen.");
            setPasswort("");
          } finally {
            setSendet(false);
          }
        }}
      >
        <Feld id="name" label="Name" autoComplete="username" required value={name} onChange={(e) => setName(e.target.value)} />
        <Feld
          id="passwort"
          label="Passwort"
          type="password"
          autoComplete="current-password"
          required
          value={passwort}
          onChange={(e) => setPasswort(e.target.value)}
        />
        {fehler && <Hinweis ton="rot">{fehler}</Hinweis>}
        <Knopf type="submit" laedt={sendet} className="w-full">
          Anmelden
        </Knopf>
      </form>
    </Zugang>
  );
}
