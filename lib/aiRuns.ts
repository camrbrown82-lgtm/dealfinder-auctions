export type AiFeature = "catalog" | "comps" | "studio";

export type AiRun = {
  ids: string[];
  features: AiFeature[];
};

export function mergeAiRuns(...runs: Array<AiRun | null | undefined>): AiRun {
  const ids: string[] = [];
  const features: AiFeature[] = [];
  for (const run of runs) {
    if (!run) continue;
    for (const id of run.ids) {
      if (id && !ids.includes(id)) ids.push(id);
    }
    for (const feature of run.features) {
      if (!features.includes(feature)) features.push(feature);
    }
  }
  return { ids, features };
}
