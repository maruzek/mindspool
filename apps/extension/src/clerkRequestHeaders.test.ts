import { describe, expect, it } from "vitest";
import { clerkRequestHeaders } from "./clerkRequestHeaders";

const extensionUrl = "moz-extension://this-install/";
const frontendApi = "https://clerk.example.com";
const headers = [
  { name: "Origin", value: "moz-extension://this-install" },
  { name: "Authorization", value: "Bearer client-jwt" },
  { name: "Content-Type", value: "application/x-www-form-urlencoded" },
] as const;
const request = {
  url: `${frontendApi}/v1/client/sessions/session/tokens/convex?_is_native=1`,
  originUrl: `${extensionUrl}_generated_background_page.html`,
  requestHeaders: [...headers],
};

describe("Clerk request headers in Firefox", () => {
  it("removes Origin from this extension's native Clerk request, preserving authentication", () => {
    expect(clerkRequestHeaders(request, extensionUrl, frontendApi)).toEqual({
      requestHeaders: headers.slice(1),
    });
    expect(request.requestHeaders).toEqual(headers);
  });

  it("also handles popup requests and case-insensitive header names", () => {
    expect(
      clerkRequestHeaders(
        {
          ...request,
          originUrl: `${extensionUrl}popup.html`,
          requestHeaders: [
            { name: "origin", value: "moz-extension://this-install" },
            { name: "authorization", value: "Bearer client-jwt" },
          ],
        },
        extensionUrl,
        frontendApi,
      ),
    ).toEqual({
      requestHeaders: [{ name: "authorization", value: "Bearer client-jwt" }],
    });
  });

  it.each([
    { originUrl: "https://example.com/page" },
    { originUrl: "moz-extension://another-install/popup.html" },
    { originUrl: "moz-extension://this-install.evil/popup.html" },
    { originUrl: undefined },
    { url: "https://another.example.com/v1/client?_is_native=1" },
    { url: `${frontendApi}.evil/v1/client?_is_native=1` },
    { url: `${frontendApi}/v1/client` },
    { requestHeaders: [headers[0]] },
    { requestHeaders: [{ name: "Authorization", value: "" }, headers[0]] },
    { requestHeaders: [headers[1]] },
    { requestHeaders: undefined },
  ])("leaves unrelated or non-native requests unchanged: %j", (changes) => {
    expect(
      clerkRequestHeaders(
        { ...request, ...changes },
        extensionUrl,
        frontendApi,
      ),
    ).toEqual({});
  });
});
