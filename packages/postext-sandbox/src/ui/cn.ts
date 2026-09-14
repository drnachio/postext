import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind utility classes, letting later classes win over earlier
 *  conflicting ones (e.g. a caller's `px-2` over a primitive's `px-3`). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
