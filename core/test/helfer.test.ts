import { mkdtemp, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { einhaengeOptionen, istUuid, uuidAusZiel, werteLsblkAus } from "../src/helfer/datentraeger.js";
import { Anfrage, HelferDienst, HelferFehler, PROGRAMME } from "../src/helfer/dienst.js";
import { starteHelferServer } from "../src/helfer/socket.js";
import { HelferAblehnung, HelferClient, HelferNichtErreichbar } from "../src/helfer-client.js";

/** lsblk-Ausgabe eines typischen Mini-PCs mit angesteckten USB-Datenträgern. */
function lsblk(basis = "/media/lion") {
  return JSON.stringify({
    blockdevices: [
      {
        name: "nvme0n1", path: "/dev/nvme0n1", size: 512110190592, type: "disk", tran: "nvme", rm: false, hotplug: false, model: "Samsung SSD",
        children: [
          { name: "nvme0n1p1", path: "/dev/nvme0n1p1", size: 536870912, type: "part", fstype: "vfat", uuid: "AAAA-1111", mountpoints: ["/boot/efi"] },
          { name: "nvme0n1p2", path: "/dev/nvme0n1p2", size: 511000000000, type: "part", fstype: "ext4", uuid: "11111111-2222-3333-4444-555555555555", mountpoints: ["/"] },
        ],
      },
      {
        name: "sda", path: "/dev/sda", size: 2000398934016, type: "disk", tran: "usb", rm: false, hotplug: true, model: "WD Elements",
        children: [
          { name: "sda1", path: "/dev/sda1", size: 2000397885440, type: "part", fstype: "ext4", label: "Backup", uuid: "9f1c2b3a-0000-4d5e-8f90-123456789abc", mountpoints: [null] },
        ],
      },
      {
        name: "sdb", path: "/dev/sdb", size: 64000000000, type: "disk", tran: "usb", rm: "1", hotplug: "1", model: "SanDisk",
        children: [
          { name: "sdb1", path: "/dev/sdb1", size: 63999000000, type: "part", fstype: "vfat", label: "STICK", uuid: "ABCD-1234", mountpoints: [`${basis}/ABCD-1234`] },
          { name: "sdb2", path: "/dev/sdb2", size: 1000000, type: "part", fstype: "crypto_LUKS", uuid: "22222222-2222-2222-2222-222222222222", mountpoints: [null] },
        ],
      },
      {
        name: "sdc", path: "/dev/sdc", size: 4000000000000, type: "disk", tran: "usb", model: "Datenplatte",
        children: [{ name: "sdc1", path: "/dev/sdc1", size: 4000000000000, type: "part", fstype: "ext4", uuid: "33333333-3333-3333-3333-333333333333", mountpoints: ["/srv"] }],
      },
      {
        name: "sdd", path: "/dev/sdd", size: 1000000000, type: "disk", tran: "usb", model: "Fremd",
        children: [
          { name: "sdd1", path: "/dev/sdd1", size: 500000000, type: "part", fstype: "ext4", uuid: "44444444-4444-4444-4444-444444444444", mountpoints: ["/mnt/privat"] },
          { name: "sdd2", path: "/dev/sdd2", size: 500000000, type: "part", fstype: "ext4", uuid: "55555555-5555-5555-5555-555555555555", mountpoints: [null] },
        ],
      },
      {
        name: "sde", path: "/dev/sde", size: 1000, type: "disk", tran: "usb",
        children: [{ name: "sde1", path: "/dev/sde1", size: 1000, type: "part", fstype: "ext4", uuid: "../../etc", mountpoints: [null] }],
      },
      { name: "loop0", path: "/dev/loop0", size: 1000, type: "loop", fstype: "squashfs", mountpoints: ["/snap/x"] },
    ],
  });
}

describe("lion-helper: Datenträger erkennen", () => {
  it("bietet nur freie USB-Datenträger mit bekanntem Dateisystem an", () => {
    const liste = werteLsblkAus(lsblk());
    expect(liste.map((d) => d.uuid)).toEqual(["9f1c2b3a-0000-4d5e-8f90-123456789abc", "ABCD-1234"]);
    expect(liste[0]).toMatchObject({ name: "Backup", dateisystem: "ext4", geraet: "/dev/sda1", eingehaengt: null, backupOrdner: "/media/lion/9f1c2b3a-0000-4d5e-8f90-123456789abc/lion-backup" });
    expect(liste[1]).toMatchObject({ name: "STICK", eingehaengt: "/media/lion/ABCD-1234" });
  });

  it("schließt System-, Daten- und anderweitig eingehängte Platten komplett aus", () => {
    const uuids = werteLsblkAus(lsblk()).map((d) => d.uuid);
    expect(uuids).not.toContain("11111111-2222-3333-4444-555555555555"); // Systemplatte
    expect(uuids).not.toContain("33333333-3333-3333-3333-333333333333"); // /srv auf USB
    expect(uuids).not.toContain("55555555-5555-5555-5555-555555555555"); // Nachbarpartition von /mnt/privat
    expect(uuids).not.toContain("22222222-2222-2222-2222-222222222222"); // verschlüsselt, unbekannt
  });

  it("übersteht kaputte Ausgaben", () => {
    expect(werteLsblkAus("kein json")).toEqual([]);
    expect(werteLsblkAus("{}")).toEqual([]);
  });

  it("prüft Kennungen und liest sie aus Backup-Zielen", () => {
    expect(istUuid("9f1c2b3a-0000-4d5e-8f90-123456789abc")).toBe(true);
    expect(istUuid("ABCD-1234")).toBe(true);
    expect(istUuid("../etc")).toBe(false);
    expect(istUuid("a b")).toBe(false);
    expect(istUuid("-rf")).toBe(false);
    expect(uuidAusZiel("/media/lion/ABCD-1234/lion-backup")).toBe("ABCD-1234");
    expect(uuidAusZiel("/mnt/usb")).toBeNull();
    expect(uuidAusZiel("/media/lion/../x")).toBeNull();
  });

  it("hängt nie ausführbar ein; FAT/exFAT/NTFS nur für root", () => {
    expect(einhaengeOptionen("ext4")).toBe("nosuid,nodev,noexec,noatime");
    expect(einhaengeOptionen("vfat")).toContain("umask=0077");
  });
});

describe("lion-helper: Aktionen", () => {
  async function aufbau() {
    const basis = await mkdtemp(join(tmpdir(), "lion-media-"));
    const aufrufe: string[][] = [];
    let ausgabe = lsblk(basis);
    const dienst = new HelferDienst(async (programm, argumente) => {
      aufrufe.push([programm, ...argumente]);
      if (programm === PROGRAMME.lsblk) return ausgabe;
      return "";
    }, basis);
    return { basis, aufrufe, dienst, setzeAusgabe: (a: string) => (ausgabe = a) };
  }

  it("hängt mit festen Programmen und sicheren Optionen ein und legt den Backup-Ordner an", async () => {
    const { basis, aufrufe, dienst } = await aufbau();
    const uuid = "9f1c2b3a-0000-4d5e-8f90-123456789abc";
    const r = await dienst.bearbeite({ aktion: "einhaengen", uuid });
    expect(r).toEqual({ einhaengepunkt: `${basis}/${uuid}`, backupOrdner: `${basis}/${uuid}/lion-backup` });
    const mount = aufrufe.find((a) => a[0] === PROGRAMME.mount)!;
    expect(mount).toEqual([PROGRAMME.mount, "-t", "ext4", "-o", "nosuid,nodev,noexec,noatime", "--", "/dev/sda1", `${basis}/${uuid}`]);
    expect((await stat(`${basis}/${uuid}/lion-backup`)).mode & 0o777).toBe(0o700);
  });

  it("hängt nicht doppelt ein", async () => {
    const { basis, aufrufe, dienst } = await aufbau();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(`${basis}/ABCD-1234`); // Einhängepunkt existiert, wenn eingehängt
    await dienst.bearbeite({ aktion: "einhaengen", uuid: "ABCD-1234" });
    expect(aufrufe.some((a) => a[0] === PROGRAMME.mount)).toBe(false);
  });

  it("lehnt unbekannte und ausgeschlossene Datenträger ab – ohne mount", async () => {
    const { aufrufe, dienst } = await aufbau();
    await expect(dienst.bearbeite({ aktion: "einhaengen", uuid: "33333333-3333-3333-3333-333333333333" })).rejects.toThrow(HelferFehler);
    await expect(dienst.bearbeite({ aktion: "einhaengen", uuid: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow(/angeschlossen/);
    expect(aufrufe.some((a) => a[0] === PROGRAMME.mount)).toBe(false);
  });

  it("hängt sicher aus: erst sync, dann umount, dann leeren Ordner entfernen", async () => {
    const { basis, aufrufe, dienst } = await aufbau();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(`${basis}/ABCD-1234`);
    await dienst.bearbeite({ aktion: "aushaengen", uuid: "ABCD-1234" });
    const reihenfolge = aufrufe.filter((a) => a[0] !== PROGRAMME.lsblk).map((a) => a[0]);
    expect(reihenfolge).toEqual([PROGRAMME.sync, PROGRAMME.umount]);
    expect(aufrufe.find((a) => a[0] === PROGRAMME.umount)).toEqual([PROGRAMME.umount, "--", `${basis}/ABCD-1234`]);
    expect(await readdir(basis)).toEqual([]);
  });

  it("nimmt nur die drei festen Aktionen mit gültiger Kennung an", () => {
    expect(Anfrage.safeParse({ aktion: "datentraeger" }).success).toBe(true);
    expect(Anfrage.safeParse({ aktion: "formatieren", uuid: "ABCD-1234" }).success).toBe(false);
    expect(Anfrage.safeParse({ aktion: "einhaengen", uuid: "; rm -rf /" }).success).toBe(false);
    expect(Anfrage.safeParse({ aktion: "einhaengen" }).success).toBe(false);
  });
});

describe("lion-helper: Socket und Client", () => {
  const offen: { close: () => void }[] = [];
  afterEach(() => offen.splice(0).forEach((s) => s.close()));

  it("spricht über den Unix-Socket (Rechte 660) mit lion-core", async () => {
    const ordner = await mkdtemp(join(tmpdir(), "lion-sock-"));
    const pfad = join(ordner, "helfer.sock");
    const dienst = new HelferDienst(async (p) => (p === PROGRAMME.lsblk ? lsblk(ordner) : ""), ordner);
    offen.push(await starteHelferServer(pfad, dienst));
    expect((await stat(pfad)).mode & 0o777).toBe(0o660);

    const client = new HelferClient(pfad);
    expect((await client.datentraeger()).map((d) => d.uuid)).toContain("ABCD-1234");
    await expect(client.einhaengen("00000000-0000-0000-0000-000000000000")).rejects.toThrow(HelferAblehnung);
  });

  it("lehnt ungültige Anfragen am Socket ab", async () => {
    const ordner = await mkdtemp(join(tmpdir(), "lion-sock-"));
    const pfad = join(ordner, "helfer.sock");
    offen.push(await starteHelferServer(pfad, { bearbeite: async () => ({}) }));
    const { connect } = await import("node:net");
    const roh = (text: string) =>
      new Promise<string>((fertig) => {
        let a = "";
        const s = connect(pfad, () => s.write(text));
        s.on("data", (t) => (a += t));
        s.on("end", () => fertig(a));
      });
    expect(JSON.parse(await roh("kein json\n"))).toEqual({ ok: false, fehler: "Ungültige Anfrage." });
    expect(JSON.parse(await roh('{"aktion":"formatieren"}\n')).ok).toBe(false);
    expect(JSON.parse(await roh(`${"x".repeat(5000)}`)).fehler).toMatch(/zu groß/);
  });

  it("meldet einen fehlenden Dienst verständlich", async () => {
    const client = new HelferClient("/gibt/es/nicht.sock");
    await expect(client.datentraeger()).rejects.toThrow(HelferNichtErreichbar);
    await expect(client.datentraeger()).rejects.toThrow(/systemctl status lion-helper/);
  });
});
