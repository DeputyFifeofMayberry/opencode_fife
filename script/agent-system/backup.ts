import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  AGENT_SYSTEM_VERSION,
  ROLE_CONTENT_VERSION,
  type BackupEntry,
  type BackupManifest,
  backupRoot,
  copyFileAtomic,
  isRecord,
  listFiles,
  readJsonFile,
  relativePosix,
  removeTree,
  sha256File,
  writeJsonAtomic,
} from "./lib"

export type BackupRequest = {
  path: string
  source: string | null
  sha256: string | null
}

export type RestoreResult = {
  restored: string[]
  removed: string[]
  preserved: string[]
  errors: string[]
}

export async function createBackup(
  configRoot: string,
  requests: BackupRequest[],
  installedManifestExisted: boolean,
  now = new Date(),
) {
  if (requests.length === 0 && !installedManifestExisted) return null
  const stamp = now.toISOString().replaceAll(/[-:TZ.]/g, "").slice(0, 17)
  const path = join(backupRoot(configRoot), stamp)
  mkdirSync(path, { recursive: true })
  const files: BackupEntry[] = []
  for (const request of requests) {
    if (request.source && existsSync(request.source)) {
      const target = join(path, "files", request.path)
      await copyFileAtomic(request.source, target)
      files.push({ path: request.path, backup: `files/${request.path}`, existed: true, sha256: request.sha256 })
      continue
    }
    files.push({ path: request.path, backup: null, existed: false, sha256: null })
  }
  if (installedManifestExisted) {
    const source = join(configRoot, "agent-system.installed.json")
    if (existsSync(source)) await copyFileAtomic(source, join(path, "agent-system.installed.json"))
  }
  const manifest: BackupManifest = {
    schemaVersion: 1,
    createdAt: now.toISOString(),
    agentSystemVersion: AGENT_SYSTEM_VERSION,
    roleContentVersion: ROLE_CONTENT_VERSION,
    installedManifestExisted,
    files,
  }
  writeJsonAtomic(join(path, "backup.json"), manifest)
  return path
}

export function readBackupManifest(path: string) {
  const value = readJsonFile(join(path, "backup.json"))
  if (!isRecord(value)) throw new Error(`Backup manifest is not an object: ${join(path, "backup.json")}`)
  return value as BackupManifest
}

export async function restoreBackup(
  configRoot: string,
  backupPath: string,
  managedTargets: Set<string> = new Set(),
): Promise<RestoreResult> {
  const manifest = readBackupManifest(backupPath)
  const restored: string[] = []
  const removed: string[] = []
  const errors: string[] = []
  const known = new Set(manifest.files.map((entry) => entry.path))
  for (const entry of manifest.files) {
    const target = join(configRoot, entry.path)
    if (entry.existed) {
      if (!entry.backup) {
        errors.push(`Backup entry for ${entry.path} has no stored file.`)
        continue
      }
      await copyFileAtomic(join(backupPath, entry.backup), target)
      if (entry.sha256 && (await sha256File(target)) !== entry.sha256) {
        errors.push(`Restored file does not match the backup hash: ${entry.path}`)
      }
      restored.push(entry.path)
      continue
    }
    if (existsSync(target)) {
      rmSync(target, { force: true })
      removed.push(entry.path)
    }
  }

  const installedPath = join(configRoot, "agent-system.installed.json")
  if (manifest.installedManifestExisted) {
    const source = join(backupPath, "agent-system.installed.json")
    if (existsSync(source)) {
      await copyFileAtomic(source, installedPath)
      restored.push("agent-system.installed.json")
    } else {
      errors.push("Backup records a previous installed manifest but does not contain it.")
    }
  } else if (existsSync(installedPath)) {
    rmSync(installedPath, { force: true })
    removed.push("agent-system.installed.json")
  }

  const preserved: string[] = []
  for (const directory of ["agents", "skills"]) {
    const root = join(configRoot, directory)
    if (!existsSync(root)) continue
    for (const file of listFiles(root)) {
      const relativePath = relativePosix(configRoot, file)
      if (known.has(relativePath) || managedTargets.has(relativePath)) continue
      preserved.push(relativePath)
    }
  }
  return { restored, removed, preserved, errors }
}

export function backupDirectories(configRoot: string) {
  const root = backupRoot(configRoot)
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .sort()
    .reverse()
}

export function removeBackup(path: string) {
  removeTree(dirname(join(path, "backup.json")))
}
