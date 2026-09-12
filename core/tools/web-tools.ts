import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MAX_HTTP_RESPONSE_BYTES } from "../config/leo-config.ts";

const execFileAsync = promisify(execFile);

function validatePublicUrl(value: unknown): URL {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("A valid URL is required.");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only HTTP(S) URLs are allowed.");
  }

  const hostname = url.hostname.toLowerCase();
  const blocked = [
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0"
  ];
  if (blocked.includes(hostname)) {
    throw new Error("Local/private browser targets are not allowed.");
  }

  if (
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/.test(hostname)
  ) {
    throw new Error("Private network targets are not allowed.");
  }

  return url;
}

export async function openBrowser(urlValue: unknown): Promise<unknown> {
  const url = validatePublicUrl(urlValue);
  if (process.platform === "win32") {
    await execFileAsync("cmd.exe", ["/c", "start", "", url.toString()]);
  } else if (process.platform === "darwin") {
    await execFileAsync("open", [url.toString()]);
  } else {
    await execFileAsync("xdg-open", [url.toString()]);
  }
  return { url: url.toString(), opened: true };
}

export async function searchBrowser(queryValue: unknown): Promise<unknown> {
  if (typeof queryValue !== "string" || !queryValue.trim()) {
    throw new Error("A search query is required.");
  }
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", queryValue.trim());
  return openBrowser(url.toString());
}

export async function fetchPublicPage(urlValue: unknown): Promise<unknown> {
  const url = validatePublicUrl(urlValue);
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "LEO/1.0 local research client"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP request failed with status ${response.status}.`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_HTTP_RESPONSE_BYTES) {
    throw new Error("HTTP response is too large.");
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_HTTP_RESPONSE_BYTES) {
    throw new Error("HTTP response exceeded the configured size limit.");
  }

  return {
    url: response.url,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body: text
  };
}

import { registerToolExecutor } from "../execution/tool-executor-registry.ts";

function objectParams(parameters: unknown): Record<string, unknown> {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    throw new Error("Tool parameters must be an object.");
  }
  return parameters as Record<string, unknown>;
}

registerToolExecutor("browser.open", parameters => openBrowser(objectParams(parameters).url));
registerToolExecutor("browser.search", parameters => searchBrowser(objectParams(parameters).query));
registerToolExecutor("web.fetch", parameters => fetchPublicPage(objectParams(parameters).url));
