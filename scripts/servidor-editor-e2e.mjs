// El proceso de tests necesita administrar usuarios ficticios. Next no.
import { spawn } from "node:child_process"
const env = { ...process.env }
for (const name of Object.keys(env)) {
  if (name.startsWith("SUPABASE_TEST_") || /SERVICE_ROLE/.test(name)) delete env[name]
}
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", process.argv[2]], { env, stdio: "inherit" })
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal))
child.on("exit", code => { process.exitCode = code ?? 1 })
