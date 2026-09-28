// Types for migrate-photos-to-data-dir.mjs, so the TypeScript test can import it.
export interface MigrateResult {
  moved: number;
  skipped: number;
  failed: number;
  oldDir: string;
  newDir: string;
  ranMove: boolean;
}
export function migratePhotos(
  env?: Record<string, string | undefined>,
  log?: (line: string) => void,
  oldDir?: string,
): MigrateResult;
