import { logError, logInfo, logWarn } from "../lib/log"
import { runMediaMaintenance, type MaintenanceEnv, type MaintenanceProgress } from "../lib/media-maintenance"

interface Env extends MaintenanceEnv { VIBE_MEDIA: NonNullable<MaintenanceEnv["VIBE_MEDIA"]> }

const maintenanceWorker = {
  fetch(): Response { return new Response("Not found", { status: 404 }) },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    const requestId = crypto.randomUUID()
    if (env.ENABLE_MEDIA_MAINTENANCE !== "true") {
      logWarn("media-maintenance", "Mantenimiento desactivado", { requestId, estado: "disabled" })
      return
    }
    const started = Date.now()
    let progress: Readonly<MaintenanceProgress> = { phase: "configuration", outcome: "running", planned: 0, retired: 0 }
    logInfo("media-maintenance", "Ejecución iniciada", { requestId, estado: "running" })
    try {
      await runMediaMaintenance(env, fetch, (next) => { progress = next })
      logInfo("media-maintenance", progress.outcome === "idle" ? "Sin tareas disponibles" : "Ejecución completada", {
        requestId, resultado: "ok", estado: progress.outcome,
        archivosPrevistos: progress.planned, archivosRetirados: progress.retired,
        duracionMs: Date.now() - started,
      })
    } catch (error) {
      logError("media-maintenance", "Falló la ejecución", error, {
        requestId, fase: progress.phase, archivosPrevistos: progress.planned,
        archivosRetirados: progress.retired, duracionMs: Date.now() - started,
      })
      throw new Error("Media maintenance failed")
    }
  },
}

export default maintenanceWorker
