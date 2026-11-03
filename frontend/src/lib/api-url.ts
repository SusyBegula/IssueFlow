/** Keep local API cookies on the hostname used to open the frontend. */
export function resolveApiBaseUrl(
  configuredUrl: string,
  pageOrigin?: string,
): string {
  // Production serves the exported frontend and API from one origin.
  if (configuredUrl === "/") return pageOrigin || "";
  const api = new URL(configuredUrl);
  if (pageOrigin) {
    const page = new URL(pageOrigin);
    const loopbackHosts = new Set(["localhost", "127.0.0.1"]);
    if (loopbackHosts.has(api.hostname) && loopbackHosts.has(page.hostname)) {
      api.hostname = page.hostname;
    }
  }
  return api.href.replace(/\/+$/, "");
}
