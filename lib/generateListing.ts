import { prepareIntakeImages, requestCatalogFromUrls, type CatalogResult } from "@/lib/aiIntakeClient";
import { mergeAiRuns, type AiRun } from "@/lib/aiRuns";
import { requestStudioImage } from "@/lib/studioClient";

export async function generateListingFromPhotos(
  files: File[],
  pasted: string,
  extras: { itemDetails?: string; listingGrade?: string },
  hooks?: {
    onCatalog?: (catalog: CatalogResult) => void;
    onStudio?: (url: string) => void;
  },
) {
  const prepared = await prepareIntakeImages(files, pasted);
  if (prepared.imageUrls.length === 0 && prepared.photos.length === 0) {
    throw new Error("Add a photo or paste an image URL first.");
  }

  const catalogPromise = requestCatalogFromUrls(prepared.imageUrls, extras, prepared.photos);
  const studioPromise = requestStudioImage({
    imageUrls: prepared.imageUrls,
    files: prepared.photos,
    title: "Auction lot",
    itemDetails: extras.itemDetails,
    listingGrade: extras.listingGrade,
  });

  const catalog = await catalogPromise;
  hooks?.onCatalog?.(catalog);

  let studioUrl: string | null = null;
  let studioError: string | null = null;
  let run: AiRun | null = catalog.ai ?? null;
  try {
    const studio = await studioPromise;
    studioUrl = studio.url;
    run = mergeAiRuns(run, studio.ai);
    hooks?.onStudio?.(studio.url);
  } catch (err) {
    studioError = err instanceof Error ? err.message : "Listing photo failed.";
  }

  return { catalog, studioUrl, studioError, run, imageUrls: prepared.imageUrls };
}
