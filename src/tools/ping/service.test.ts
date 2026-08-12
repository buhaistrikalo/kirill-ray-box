import { describe, expect, it } from "vitest";

import { PingService } from "./service";
import type { PingProbeSet, PingProvider } from "./types";

const probes: PingProbeSet = {
  gateway: {
    id: "gateway",
    label: "Default gateway",
    state: "pass",
    detail: "Gateway replied",
  },
  internet: {
    id: "internet",
    label: "Internet endpoint",
    state: "pass",
    detail: "HTTP 204",
    latencyMs: 12,
  },
  server: {
    id: "server",
    label: "Remote server",
    state: "pass",
    detail: "HTTP 200",
    latencyMs: 20,
  },
  vpn: {
    id: "vpn",
    label: "VPN activity",
    state: "not-detected",
    detail: "No active VPN detected",
  },
};

describe("PingService", () => {
  it("adds a deterministic timestamp and diagnosis to provider probes", async () => {
    const provider: PingProvider = { check: async () => probes };
    const result = await new PingService(
      provider,
      () => new Date("2026-08-11T00:00:00.000Z"),
    ).check();

    expect(result).toEqual({
      ...probes,
      checkedAt: "2026-08-11T00:00:00.000Z",
      diagnosis: expect.objectContaining({ code: "healthy" }),
    });
  });
});
