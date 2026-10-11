import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** First line only, cut to maxLength at a word boundary where possible, with a trailing "...". */
export function truncateText(text: string, maxLength: number): string {
  const firstLine = text.split("\n")[0].trim()
  if (firstLine.length <= maxLength) return firstLine
  const truncated = firstLine.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(" ")
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "..."
}
