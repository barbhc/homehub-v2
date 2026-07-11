import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merges Tailwind classes with support for conditional classes.
 * Use this instead of string concatenation so conflicting Tailwind
 * classes (e.g. "p-2" and "p-4") resolve correctly — the last one wins.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
