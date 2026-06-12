import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'config/editorial.json');

export interface AutoFilterThresholds {
  overallScore: number;
  viralScore: number;
  discussionScore: number;
}

export interface EditorialConfig {
  autoFilterEnabled: boolean;
  autoFilterThresholds: AutoFilterThresholds;
}

const DEFAULTS: EditorialConfig = {
  autoFilterEnabled: true,
  autoFilterThresholds: { overallScore: 60, viralScore: 65, discussionScore: 65 },
};

export function getEditorialConfig(): EditorialConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<EditorialConfig>;
    return {
      autoFilterEnabled: parsed.autoFilterEnabled ?? DEFAULTS.autoFilterEnabled,
      autoFilterThresholds: { ...DEFAULTS.autoFilterThresholds, ...parsed.autoFilterThresholds },
    };
  } catch {
    return DEFAULTS;
  }
}

export function setEditorialConfig(patch: Partial<EditorialConfig>): void {
  const current = getEditorialConfig();
  const updated: EditorialConfig = {
    ...current,
    ...patch,
    autoFilterThresholds: { ...current.autoFilterThresholds, ...(patch.autoFilterThresholds ?? {}) },
  };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
}
