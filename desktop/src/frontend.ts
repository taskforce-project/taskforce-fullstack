import { join } from "node:path";

import { log } from "./log";
import { freePort, httpStatus } from "./net";
import { frontendServer } from "./paths";
import { serviceEnv, startService, type Service } from "./proc";

/**
 * Interface de l'app : le serveur Next autonome (build `standalone`), lancé avec le Node d'Electron
 * (`ELECTRON_RUN_AS_NODE`), sans Node installé sur la machine.
 */
export class Frontend {
  port = 0;
  private service: Service | null = null;

  async start(logDir: string): Promise<void> {
    this.port = await freePort();
    const env = serviceEnv({
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(this.port),
      HOSTNAME: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
    });
    const started = Date.now();
    this.service = startService(process.execPath, [frontendServer()], { env, logFile: join(logDir, "frontend.log") });
    const service = this.service;
    const deadline = Date.now() + 60_000;
    // Toute réponse du serveur (même une redirection) dit qu'il est prêt.
    while ((await httpStatus(this.port, "/")) === 0) {
      if (!service.running()) throw new Error("The interface server stopped while starting");
      if (Date.now() > deadline) throw new Error("The interface server did not answer within 60 s");
      await new Promise((r) => setTimeout(r, 200));
    }
    log.info(`Interface ready on 127.0.0.1:${this.port} in ${Math.round((Date.now() - started) / 100) / 10} s`);
  }

  async stop(): Promise<void> {
    await this.service?.stop();
    this.service = null;
  }
}
