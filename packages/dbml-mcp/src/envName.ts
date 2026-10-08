// The extension's connection names are free text; environment variable names
// are not. Both sides of the hand-over use this one mapping.
export const envSuffix = (name: string): string =>
  name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
