export function resolveRepo(value: string | undefined) {
  const [owner, name] = value?.split("/") ?? []
  if (!owner || !name) {
    throw new Error(
      `Repository is required as owner/name; pass --repo or set GITHUB_REPOSITORY (got ${value ?? "nothing"})`,
    )
  }
  return { owner, name }
}
