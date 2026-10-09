import "server-only";

/**
 * Google Places API (New) text search: "dentists in Austin" -> businesses with
 * their website and phone. Needs GOOGLE_API_KEY with the Places API (New)
 * enabled (Google Cloud gives a free monthly credit).
 */
export interface PlaceResult {
  name: string;
  website: string;
  phone: string;
  address: string;
  category: string;
  rating: number | null;
  ratingCount: number | null;
}

interface ApiPlace {
  displayName?: { text?: string };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  formattedAddress?: string;
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
}

export function placesEnabled(): boolean {
  return Boolean(process.env.GOOGLE_API_KEY);
}

export async function searchPlaces(query: string, location: string, max = 20): Promise<PlaceResult[]> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("Google search needs GOOGLE_API_KEY in .env.local (Places API (New) enabled).");

  const out: PlaceResult[] = [];
  let pageToken: string | undefined;
  // Up to 3 pages of 20, as Google allows.
  for (let page = 0; page < 3 && out.length < max; page += 1) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.displayName,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.formattedAddress,places.primaryTypeDisplayName,places.rating,places.userRatingCount,nextPageToken",
      },
      body: JSON.stringify({
        textQuery: location.trim() ? `${query} in ${location}` : query,
        pageSize: Math.min(20, max - out.length),
        ...(pageToken ? { pageToken } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (res.status === 403 || res.status === 401) {
      throw new Error("Google rejected GOOGLE_API_KEY. Enable \"Places API (New)\" for this key in Google Cloud.");
    }
    if (res.status === 429) throw new Error("Google Places quota reached. Try again later.");
    if (!res.ok) throw new Error(`Google Places returned ${res.status}`);
    const json = (await res.json()) as { places?: ApiPlace[]; nextPageToken?: string };
    for (const p of json.places ?? []) {
      out.push({
        name: p.displayName?.text ?? "",
        website: p.websiteUri ?? "",
        phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? "",
        address: p.formattedAddress ?? "",
        category: p.primaryTypeDisplayName?.text ?? "",
        rating: p.rating ?? null,
        ratingCount: p.userRatingCount ?? null,
      });
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return out.slice(0, max);
}
