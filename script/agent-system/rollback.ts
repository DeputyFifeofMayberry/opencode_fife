import { type RestoreResult, backupDirectories, restoreBackup } from "./backup"
import { readInstalledManifest, resolveConfigRoot } from "./lib"

export class RollbackError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message)
  }
}

export type AgentRollbackResult = RestoreResult & {
  backupPath: string
}

export async function rollbackAgents(configRootInput?: string): Promise<AgentRollbackResult> {
  const configRoot = resolveConfigRoot(configRootInput)
  const backups = backupDirectories(configRoot)
  if (backups.length === 0) {
    throw new RollbackError(`No agent-system backup exists under ${configRoot}. Nothing to roll back.`, 2)
  }
  const backupPath = backups[0]
  if (!backupPath) {
    throw new RollbackError(`No agent-system backup exists under ${configRoot}. Nothing to roll back.`, 2)
  }
  const installed = readInstalledManifest(configRoot)
  const managedTargets = new Set(installed?.files.map((file) => file.target) ?? [])
  const result = await restoreBackup(configRoot, backupPath, managedTargets)
  if (result.errors.length > 0) {
    throw new RollbackError(`Rollback completed with errors:\n${result.errors.join("\n")}`, 3)
  }
  return { ...result, backupPath }
}

export function describeRollback(result: AgentRollbackResult) {
  return [
    `Restored agent system from ${result.backupPath}.`,
    `Restored: ${result.restored.length}; removed install-created: ${result.removed.length}; preserved unmanaged: ${result.preserved.length}.`,
    result.preserved.length > 0 ? `Preserved files created after the backup: ${result.preserved.join(", ")}` : "No unmanaged files were created after the backup.",
  ].join("\n")
}
