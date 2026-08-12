import { describe, expect, it, vi } from "vitest";

import {
  MacNetworkPingProvider,
  normalizeRemoteEndpoint,
  parseDefaultRoute,
  parsePingLatency,
  parseVpnActivity,
} from "./provider";

describe("macOS network output parsers", () => {
  it("parses a default gateway and interface defensively", () => {
    expect(
      parseDefaultRoute(`
        route to: default
        gateway: 192.168.1.1
        interface: en0
      `),
    ).toEqual({ gateway: "192.168.1.1", interface: "en0" });

    expect(
      parseDefaultRoute("gateway: link#12\ninterface: en0"),
    ).toBeUndefined();
  });

  it("parses macOS ping latency and connected VPN services", () => {
    expect(
      parsePingLatency(
        "64 bytes from 192.168.1.1: icmp_seq=0 ttl=64 time=1.234 ms",
      ),
    ).toBe(1.234);
    expect(parsePingLatency("request timeout")).toBeUndefined();

    expect(
      parseVpnActivity(
        "Available network connection services in current set:\n* (Connected) Work VPN",
      ),
    ).toEqual({ active: true, serviceName: "Work VPN" });
    expect(parseVpnActivity("* (Disconnected) Work VPN")).toEqual({
      active: false,
    });
  });

  it("uses the safe default for malformed or credential-bearing endpoints", () => {
    expect(normalizeRemoteEndpoint("not a URL")).toBe("https://example.com/");
    expect(normalizeRemoteEndpoint("http://example.com")).toBe(
      "https://example.com/",
    );
    expect(normalizeRemoteEndpoint("https://user:pass@example.com")).toBe(
      "https://example.com/",
    );
    expect(normalizeRemoteEndpoint("https://status.example.test/health")).toBe(
      "https://status.example.test/health",
    );
  });
});

describe("MacNetworkPingProvider", () => {
  it("runs the local, internet, remote, and VPN layers without live network access", async () => {
    const commands: Array<{ command: string; args: readonly string[] }> = [];
    const requests: Array<{ url: string; signal?: AbortSignal }> = [];
    const executor = async (command: string, args: readonly string[]) => {
      commands.push({ command, args });
      if (command === "/sbin/route") {
        return {
          stdout: "gateway: 192.168.1.1\ninterface: en0\n",
        };
      }
      if (command === "/sbin/ping") {
        return {
          stdout: "64 bytes from 192.168.1.1: time=2.5 ms\n",
        };
      }
      return { stdout: "* (Disconnected) Work VPN\n" };
    };
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), signal: init?.signal ?? undefined });
      return new Response(null, {
        status: String(input).includes("generate_204") ? 204 : 200,
      });
    };

    const result = await new MacNetworkPingProvider({
      executor,
      fetcher,
      now: () => 1_000,
      remoteEndpoint: "https://status.example.test/health",
      internetEndpoint: "https://connectivity.test/generate_204",
    }).check();

    expect(result.gateway).toMatchObject({
      state: "pass",
      latencyMs: 2.5,
      target: "192.168.1.1",
    });
    expect(result.internet).toMatchObject({
      state: "pass",
      target: "connectivity.test",
    });
    expect(result.server).toMatchObject({
      state: "pass",
      target: "status.example.test",
    });
    expect(result.vpn.state).toBe("not-detected");
    expect(commands.map(({ command }) => command)).toEqual(
      expect.arrayContaining(["/sbin/route", "/sbin/ping", "/usr/sbin/scutil"]),
    );
    expect(requests.map(({ url }) => url)).toEqual(
      expect.arrayContaining([
        "https://connectivity.test/generate_204",
        "https://status.example.test/health",
      ]),
    );
    expect(requests.every(({ signal }) => signal)).toBe(true);
  });

  it("marks HTTP failures and bounded timeouts instead of throwing", async () => {
    vi.useFakeTimers();

    try {
      const executor = async (command: string) => {
        if (command === "/sbin/route") {
          return { stdout: "gateway: 192.168.1.1\ninterface: en0\n" };
        }
        if (command === "/sbin/ping") {
          return { stdout: "time=1 ms" };
        }
        return { stdout: "" };
      };
      const fetcher: typeof fetch = async (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        });

      const promise = new MacNetworkPingProvider({ executor, fetcher }).check();
      await vi.advanceTimersByTimeAsync(5_000);
      const result = await promise;

      expect(result.internet).toMatchObject({
        state: "fail",
        detail: "Request timed out",
      });
      expect(result.server).toMatchObject({
        state: "fail",
        detail: "Request timed out",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
