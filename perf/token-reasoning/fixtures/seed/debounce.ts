/** Debounces calls; the trailing call carries the last arguments. */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number,
  options?: { leading?: boolean },
): (...args: TArgs) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: TArgs) => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      fn(...args)
    }, waitMs)
  }
}
