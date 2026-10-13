// Hidden success check for t8-control; copied into test/ only after the agent run ends.
import { describe, expect, it } from "vitest";
import { isHttpsURL } from "../src";

describe("isHttpsURL (bench hidden check)", () => {
  it("accepts https URLs case-insensitively", () => {
    expect(isHttpsURL("https://example.com")).toBe(true);
    expect(isHttpsURL("HTTPS://EXAMPLE.COM/a?b#c")).toBe(true);
    expect(isHttpsURL("https://")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isHttpsURL("http://example.com")).toBe(false);
    expect(isHttpsURL("//example.com")).toBe(false);
    expect(isHttpsURL(" https://example.com")).toBe(false);
    expect(isHttpsURL("ftp://example.com")).toBe(false);
    expect(isHttpsURL("")).toBe(false);
  });
});
