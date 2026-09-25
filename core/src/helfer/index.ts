import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HelferDienst } from "./dienst.js";
import { starteHelferServer } from "./socket.js";

/**
 * lion-helper: kleiner root-Dienst mit fest verdrahteten Aktionen (siehe dienst.ts).
 * Start: systemd-Dienst lion-helper.service (User=root, Group=lion).
 */
const SOCKET = process.env.LION_HELPER_SOCKET ?? "/run/lion-helper/helfer.sock";

const ausfuehren = promisify(execFile);
const dienst = new HelferDienst(async (programm, argumente) => {
  const { stdout } = await ausfuehren(programm, argumente, {
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
    env: { PATH: "/usr/sbin:/usr/bin:/sbin:/bin", LANG: "C" },
  });
  return stdout;
});

const server = await starteHelferServer(SOCKET, dienst, (text) => console.log(`lion-helper: ${text}`));
console.log(`lion-helper bereit: ${SOCKET}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
