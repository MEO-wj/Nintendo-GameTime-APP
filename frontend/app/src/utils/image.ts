import { API_BASE_URL } from "../api/client";

/**
 * Optimize Nintendo asset URLs for mobile display.
 * Nintendo uses Cloudinary CDN (assets.nintendo.com) which supports
 * transform params like w_1200 → w_200 for resizing.
 */
export function optimizeNintendoAssetUrl(url: string, width = 400): string {
  if (!url) return "";
  // Cloudinary CDN: replace w_<original> with w_<target>
  if (url.includes("assets.nintendo.com") || url.includes("cloudinary")) {
    return url.replace(/w_\d+/, `w_${width}`);
  }
  // Legacy Nintendo znc.srv CDN
  if (url.includes("znc.srv")) {
    return url.replace(/\/[^/]*$/, `/thumb_${width}.jpg`);
  }
  return url;
}

/** Route images through the backend proxy with width/quality params */
export function getProxiedImageUrl(
  url: string | null | undefined,
  width = 200,
  quality = 80
): string {
  if (!url) return "";
  // Direct-load Nintendo CDN images (already optimized above)
  if (url.includes("nintendo") || url.includes("znc.srv") || url.includes("cloudinary")) {
    return optimizeNintendoAssetUrl(url, width);
  }
  // Use backend image proxy for external URLs that may be blocked
  return `${API_BASE_URL}/api/proxy/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}
