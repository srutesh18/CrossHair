import "server-only";
import { env, pipeline } from "@huggingface/transformers";

/**
 * all-MiniLM-L6-v2 via Transformers.js: free, local, 384 dimensions.
 * The model is downloaded once and cached on disk, then held in module scope
 * so later requests reuse it. Node runtime only - this will not run on Edge.
 *
 * The q8 weights (~23 MB) are used everywhere - docs and queries must share a
 * dtype so their vectors live in the same space.
 */
const MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBED_DIM = 384;

// Serverless filesystems are read-only except /tmp.
if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  env.cacheDir = "/tmp/transformers-cache";
}

/**
 * The library's call signature is a very large overload union, which TypeScript
 * cannot represent here, so we narrow it to the one shape we actually use.
 */
type Extractor = (
  text: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array }>;

let extractor: Promise<Extractor> | null = null;

function getExtractor(): Promise<Extractor> {
  if (!extractor) {
    extractor = pipeline("feature-extraction", MODEL, { dtype: "q8" })
      .then((p) => p as unknown as Extractor)
      .catch((err: unknown) => {
        // Let the next request retry the download instead of caching a failure.
        extractor = null;
        throw err;
      });
  }
  return extractor;
}

export async function embed(text: string): Promise<number[]> {
  const fe = await getExtractor();
  const out = await fe(text, { pooling: "mean", normalize: true });
  return Array.from(out.data);
}

export async function embedAll(texts: string[]): Promise<number[][]> {
  const fe = await getExtractor();
  const results: number[][] = [];
  for (const text of texts) {
    const out = await fe(text, { pooling: "mean", normalize: true });
    results.push(Array.from(out.data));
  }
  return results;
}
