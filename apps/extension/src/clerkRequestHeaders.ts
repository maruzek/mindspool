import type { Browser } from "wxt/browser";

type RequestDetails = Pick<
  Browser.webRequest.OnBeforeSendHeadersDetails,
  "url" | "requestHeaders"
> & { originUrl?: string };

/** Firefox adds Origin to native Clerk POSTs; Clerk rejects it alongside Authorization. */
export function clerkRequestHeaders(
  details: RequestDetails,
  extensionUrl: string,
  frontendApi: string,
) {
  const headers = details.requestHeaders;
  const url = new URL(details.url);
  if (
    !details.originUrl?.startsWith(extensionUrl) ||
    url.origin !== new URL(frontendApi).origin ||
    url.searchParams.get("_is_native") !== "1" ||
    !headers?.some(
      (header) => header.name.toLowerCase() === "authorization" && header.value,
    ) ||
    !headers.some((header) => header.name.toLowerCase() === "origin")
  ) {
    return {};
  }
  return {
    requestHeaders: headers.filter(
      (header) => header.name.toLowerCase() !== "origin",
    ),
  };
}
