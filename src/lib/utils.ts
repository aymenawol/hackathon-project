import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Generate a unique join token for session URLs (e.g. 471-8718) */
export function generateJoinToken(): string {
  const a = Math.floor(100 + Math.random() * 9900)
  const b = Math.floor(1000 + Math.random() * 9000)
  return `${a}-${b}`
}
