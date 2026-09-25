import { chmod, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { Anfrage, type HelferDienst, HelferFehler } from "./dienst.js";

const MAX_ANFRAGE = 4096;

function antworte(s: Socket, daten: unknown) {
  s.end(`${JSON.stringify(daten)}\n`);
}

/**
 * Unix-Socket des lion-helper: eine JSON-Zeile rein, eine JSON-Zeile raus.
 * Rechte 660 – nur root und die Gruppe „lion“ (lion-core) dürfen verbinden.
 */
export async function starteHelferServer(pfad: string, dienst: Pick<HelferDienst, "bearbeite">, protokoll: (text: string) => void = () => {}): Promise<Server> {
  const server = createServer((s) => {
    let puffer = "";
    s.setEncoding("utf8");
    s.setTimeout(120_000, () => s.destroy());
    s.on("error", () => undefined);
    s.on("data", (teil: string) => {
      puffer += teil;
      if (puffer.length > MAX_ANFRAGE) {
        s.removeAllListeners("data");
        return antworte(s, { ok: false, fehler: "Anfrage zu groß." });
      }
      const ende = puffer.indexOf("\n");
      if (ende < 0) return;
      s.removeAllListeners("data");
      let roh: unknown;
      try {
        roh = JSON.parse(puffer.slice(0, ende));
      } catch {
        return antworte(s, { ok: false, fehler: "Ungültige Anfrage." });
      }
      const a = Anfrage.safeParse(roh);
      if (!a.success) return antworte(s, { ok: false, fehler: a.error.issues[0]?.message ?? "Ungültige Anfrage." });
      const was = `${a.data.aktion}${"uuid" in a.data ? ` ${a.data.uuid}` : ""}`;
      dienst.bearbeite(a.data).then(
        (daten) => {
          protokoll(`${was}: ok`);
          antworte(s, { ok: true, daten });
        },
        (e: unknown) => {
          protokoll(`${was}: fehlgeschlagen – ${e instanceof Error ? e.message : String(e)}`);
          antworte(s, { ok: false, fehler: e instanceof HelferFehler ? e.message : "Aktion fehlgeschlagen." });
        },
      );
    });
  });
  await rm(pfad, { force: true });
  await new Promise<void>((fertig, fehler) => {
    server.once("error", fehler);
    server.listen(pfad, () => fertig());
  });
  await chmod(pfad, 0o660);
  return server;
}
