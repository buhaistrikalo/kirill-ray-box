import { describe, expect, it } from "vitest";

import { diagnosePing, getProbeDetail, getProbeStateLabel } from "./domain";
import type { PingProbeResult, PingProbeSet } from "./types";

function probe(
  id: PingProbeResult["id"],
  state: PingProbeResult["state"],
): PingProbeResult {
  return {
    id,
    label: id,
    state,
    detail: `${id} detail`,
  };
}

function probes(
  gateway: PingProbeResult["state"],
  internet: PingProbeResult["state"],
  server: PingProbeResult["state"],
  vpn: PingProbeResult["state"] = "not-detected",
): PingProbeSet {
  return {
    gateway: probe("gateway", gateway),
    internet: probe("internet", internet),
    server: probe("server", server),
    vpn: probe("vpn", vpn),
  };
}

describe("Ping diagnosis", () => {
  it("reports a healthy path when every required layer responds", () => {
    expect(diagnosePing(probes("pass", "pass", "pass"))).toMatchObject({
      code: "healthy",
      title: "Online",
    });
  });

  it("accepts an online VPN path when the tunnel has no gateway address", () => {
    expect(
      diagnosePing(probes("unknown", "pass", "pass", "pass")),
    ).toMatchObject({
      code: "healthy",
      summary:
        "The internet endpoint and remote server are reachable through the detected VPN path.",
    });
  });

  it("points to the local network when the gateway and internet fail", () => {
    expect(diagnosePing(probes("fail", "fail", "fail"))).toMatchObject({
      code: "local-network",
    });
  });

  it("points to the VPN when it is active during an internet failure", () => {
    expect(diagnosePing(probes("pass", "fail", "fail", "pass"))).toMatchObject({
      code: "vpn",
    });
  });

  it("points beyond the local network when only the internet probe fails", () => {
    expect(diagnosePing(probes("pass", "fail", "fail"))).toMatchObject({
      code: "isp-or-internet",
    });
  });

  it("does not blame the ISP when VPN inspection is unavailable", () => {
    expect(
      diagnosePing(probes("pass", "fail", "fail", "unknown")),
    ).toMatchObject({
      code: "inconclusive",
    });
  });

  it("points to the remote server when the internet works but it fails", () => {
    expect(diagnosePing(probes("pass", "pass", "fail"))).toMatchObject({
      code: "remote-server",
    });
  });

  it("stays honest when a local probe fails but the internet works", () => {
    expect(diagnosePing(probes("fail", "pass", "pass"))).toMatchObject({
      code: "inconclusive",
    });
  });
});

describe("Ping probe labels", () => {
  it("formats state, latency, and detail for the menu", () => {
    expect(getProbeStateLabel("not-detected")).toBe("Not detected");
    expect(
      getProbeDetail({
        ...probe("internet", "pass"),
        latencyMs: 12.5,
      }),
    ).toBe("OK · 12.5 ms · internet detail");
  });
});
