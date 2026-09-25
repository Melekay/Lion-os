"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { lion } from "@/lib/api";
import { MIN_LAENGE, passwortPruefen } from "@/lib/passwort";
import type { SetupStatus } from "@/lib/typen";
import { Feld, Hinweis, Knopf, Lader } from "../ui";
import { Zugang } from "../Zugang";

export function Einrichtung() {
  const router = useRouter();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [name, setName] = useState("admin");
  const [passwort, setPasswort] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [code, setCode] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [gesendet, setGesendet] = useState(false);
  const [sendet, setSendet] = useState(false);

  useEffect(() => {
    lion
      .setupStatus()
      .then((s) => (s.eingerichtet ? router.replace("/anmelden/") : setStatus(s)))
      .catch((e: Error) => setLadeFehler(e.message));
  }, [router]);

  if (ladeFehler) {
    return (
      <Zugang titel="Keine Verbindung" text="Lion OS antwortet gerade nicht.">
        <Hinweis ton="rot">{ladeFehler}</Hinweis>
      </Zugang>
    );
  }
  if (!status) return <Lader text="Einen Moment …" vollbild />;

  const pruefung = passwortPruefen(passwort, wiederholung);
  const zeigeFehler = gesendet || wiederholung.length > 0;

  return (
    <Zugang
      titel="Willkommen bei Lion OS"
      text={
        <>
          Lege dein Admin-Konto an. Damit verwaltest du Apps, Speicher und Sicherheit.
          {status.codeNoetig && " Du brauchst dafür den Einrichtungscode, den der Installer am Ende angezeigt hat."}
        </>
      }
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setGesendet(true);
          setFehler(null);
          if (!pruefung.ok || !name.trim() || (status.codeNoetig && !code.trim())) return;
          setSendet(true);
          try {
            await lion.einrichten({ name: name.trim(), passwort, code: status.codeNoetig ? code : undefined });
            router.replace("/");
          } catch (err) {
            setFehler(err instanceof Error ? err.message : "Einrichtung fehlgeschlagen.");
          } finally {
            setSendet(false);
          }
        }}
      >
        {status.codeNoetig && (
          <Feld
            id="code"
            label="Einrichtungscode"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX"
            className="font-mono uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            fehler={gesendet && !code.trim() ? "Bitte den Einrichtungscode eingeben." : null}
            hilfe={
              <>
                Vergessen? Auf dem Server: <code className="text-xs text-text">sudo grep LION_SETUP_CODE /etc/lion/lion.env</code>
              </>
            }
          />
        )}
        <Feld
          id="name"
          label="Name"
          autoComplete="username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fehler={gesendet && !name.trim() ? "Bitte einen Namen eingeben." : null}
        />
        <Feld
          id="passwort"
          label="Passwort"
          type="password"
          autoComplete="new-password"
          value={passwort}
          onChange={(e) => setPasswort(e.target.value)}
          hilfe={
            passwort.length < MIN_LAENGE
              ? `Mindestens ${MIN_LAENGE} Zeichen – ein Satz aus mehreren Wörtern ist leicht zu merken und stark. Noch ${MIN_LAENGE - passwort.length}.`
              : "Lang genug. Ein Satz aus mehreren Wörtern ist leicht zu merken und stark."
          }
          fehler={zeigeFehler ? pruefung.passwort : null}
        />
        <Feld
          id="wiederholung"
          label="Passwort wiederholen"
          type="password"
          autoComplete="new-password"
          value={wiederholung}
          onChange={(e) => setWiederholung(e.target.value)}
          fehler={zeigeFehler ? pruefung.wiederholung : null}
        />
        {fehler && <Hinweis ton="rot">{fehler}</Hinweis>}
        <Knopf type="submit" laedt={sendet} className="w-full">
          Konto anlegen
        </Knopf>
      </form>
    </Zugang>
  );
}
