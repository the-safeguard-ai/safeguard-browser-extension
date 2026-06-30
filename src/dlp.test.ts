import { expect, test, describe } from "bun:test";
import { scan, defaultPolicy, type Policy } from "./dlp";

const policy = (patterns: string[], action: Policy["action"] = "redact"): Policy => ({
  name: "test",
  enabled: true,
  patterns,
  action,
});

describe("browser DLP (mirrors crates/dlp)", () => {
  test("redacts email and api key", () => {
    const r = scan("mail jane@acme.co key sk-abcdefghijklmnopqrstuvwx", [
      policy(["email", "api_key"]),
    ]);
    expect(r.text).toContain("[REDACTED:EMAIL]");
    expect(r.text).toContain("[REDACTED:API_KEY]");
    expect(r.text).not.toContain("jane@acme.co");
    expect(r.findings.length).toBe(2);
    expect(r.blocked).toBe(false);
  });

  test("block action sets blocked and leaves text intact", () => {
    const r = scan("ssn 123-45-6789", [policy(["ssn"], "block")]);
    expect(r.blocked).toBe(true);
    expect(r.text).toContain("123-45-6789");
  });

  test("detects international PII", () => {
    const r = scan("iban GB29NWBK60161331926819 ip 192.168.1.42 call +14155552671", [
      policy(["iban", "ip_address", "intl_phone"]),
    ]);
    expect(r.text).toContain("[REDACTED:IBAN]");
    expect(r.text).toContain("[REDACTED:IP_ADDRESS]");
    expect(r.text).toContain("[REDACTED:INTL_PHONE]");
  });

  test("secret/token aliases map to api_key", () => {
    const r = scan("token sk-abcdefghijklmnopqrstuvwx", [policy(["token"])]);
    expect(r.text).toContain("[REDACTED:API_KEY]");
  });

  test("default policy catches email + local phone (no + prefix)", () => {
    const r = scan("call me 0712-345-678 or jane@acme.com", [defaultPolicy("redact")]);
    expect(r.text).toContain("[REDACTED:EMAIL]");
    expect(r.text).toContain("[REDACTED:PHONE]");
    expect(r.text).not.toContain("jane@acme.com");
  });

  test("disabled policy is skipped", () => {
    const p = { ...policy(["email"]), enabled: false };
    const r = scan("a@b.com", [p]);
    expect(r.findings.length).toBe(0);
    expect(r.text).toBe("a@b.com");
  });

  test("clean text is unchanged", () => {
    const r = scan("nothing sensitive here", [defaultPolicy()]);
    expect(r.text).toBe("nothing sensitive here");
    expect(r.findings.length).toBe(0);
  });

  test("overlapping policies redact a span exactly once (no fragment)", () => {
    // Two policies both match the same email — must redact once, count == 1,
    // no corrupted `[REDACTED:EMAIL]IL]` token.
    const r = scan("ping jane@acme.co now", [policy(["email"]), policy(["email"])]);
    expect(r.text).toBe("ping [REDACTED:EMAIL] now");
    expect(r.findings.length).toBe(1);
    expect(r.text).not.toContain("jane@acme.co");
    expect(r.text).not.toContain("EMAIL]IL");
  });

  test("stronger action wins when overlapping spans are merged", () => {
    const r = scan("ssn 123-45-6789", [policy(["ssn"], "flag"), policy(["ssn"], "block")]);
    expect(r.blocked).toBe(true);
    expect(r.findings.length).toBe(1);
  });
});
