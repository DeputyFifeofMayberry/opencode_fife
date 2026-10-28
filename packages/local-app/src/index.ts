export const packageName = "@opencode/local-app"

export function start() {
  return packageName
}

if (import.meta.main) {
  console.log(start())
}
