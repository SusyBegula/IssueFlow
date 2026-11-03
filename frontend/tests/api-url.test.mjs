import assert from "node:assert/strict";
import test from "node:test";
import { resolveApiBaseUrl } from "../src/lib/api-url.ts";

const cases = [
  [
    "same-origin production API",
    "/",
    "https://issueflow.onrender.com",
    "https://issueflow.onrender.com",
  ],
  ["same-origin without browser context", "/", undefined, ""],
  [
    "localhost frontend with numeric API host",
    "http://127.0.0.1:8000",
    "http://localhost:3000",
    "http://localhost:8000",
  ],
  [
    "numeric frontend with localhost API host",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
  ],
  [
    "matching localhost hosts",
    "http://localhost:8000",
    "http://localhost:3000",
    "http://localhost:8000",
  ],
  [
    "matching numeric hosts",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
  ],
  [
    "custom API port and path",
    "http://127.0.0.1:8001/v1/",
    "http://localhost:3001",
    "http://localhost:8001/v1",
  ],
  [
    "remote API remains unchanged",
    "https://api.example.com",
    "http://localhost:3000",
    "https://api.example.com",
  ],
  [
    "remote frontend does not retarget the API",
    "http://127.0.0.1:8000",
    "https://app.example.com",
    "http://127.0.0.1:8000",
  ],
  [
    "no browser context",
    "http://127.0.0.1:8000/",
    undefined,
    "http://127.0.0.1:8000",
  ],
];
for (const [name, api, page, expected] of cases) {
  test(name, () => assert.equal(resolveApiBaseUrl(api, page), expected));
}
