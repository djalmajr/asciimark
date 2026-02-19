import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Supported AsciiDoc file extensions */
export const ADOC_EXTENSIONS = [".adoc", ".asciidoc", ".asc", ".ad", ".adoc.txt"];

/** Check if a filename/path has an AsciiDoc extension */
export function isAdocFile(name: string): boolean {
  return ADOC_EXTENSIONS.some((ext) => name.endsWith(ext));
}
