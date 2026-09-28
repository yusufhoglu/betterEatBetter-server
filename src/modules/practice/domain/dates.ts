/** YYYY-MM-DD of a UTC-midnight "calendar date" as the logging modules store it. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
