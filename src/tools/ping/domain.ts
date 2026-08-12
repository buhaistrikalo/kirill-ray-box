import type {
  PingDiagnosis,
  PingProbeResult,
  PingProbeSet,
  ProbeState,
} from "./types";

export function getProbeStateLabel(state: ProbeState): string {
  switch (state) {
    case "pass":
      return "OK";
    case "fail":
      return "Failed";
    case "not-detected":
      return "Not detected";
    case "unknown":
      return "Unknown";
  }
}

export function diagnosePing(probes: PingProbeSet): PingDiagnosis {
  const { gateway, internet, server, vpn } = probes;
  const localPathConfirmedByVpn =
    gateway.state === "unknown" && vpn.state === "pass";

  if (internet.state === "pass") {
    if (server.state === "fail") {
      return {
        code: "remote-server",
        title: "Remote server",
        summary:
          "The internet probe replied, but the configured remote server did not.",
      };
    }

    if (
      server.state !== "pass" ||
      (gateway.state !== "pass" && !localPathConfirmedByVpn)
    ) {
      return {
        code: "inconclusive",
        title: "Inconclusive",
        summary:
          "Internet access works, but one local or remote probe could not confirm the full path.",
      };
    }

    return {
      code: "healthy",
      title: "Online",
      summary: localPathConfirmedByVpn
        ? "The internet endpoint and remote server are reachable through the detected VPN path."
        : "The default gateway, internet endpoint, and remote server are reachable.",
    };
  }

  if (internet.state === "fail") {
    if (vpn.state === "pass") {
      return {
        code: "vpn",
        title: "VPN path",
        summary:
          "The internet probe failed while VPN activity or a VPN route was detected.",
      };
    }

    if (vpn.state === "unknown") {
      return {
        code: "inconclusive",
        title: "Inconclusive",
        summary:
          "The internet probe failed, but VPN activity could not be inspected, so the failing path cannot be isolated.",
      };
    }

    if (gateway.state === "fail") {
      return {
        code: "local-network",
        title: "Local network",
        summary:
          "The default gateway and internet probe failed; check Wi-Fi, Ethernet, or the router.",
      };
    }

    if (gateway.state === "pass") {
      return {
        code: "isp-or-internet",
        title: "ISP / internet",
        summary:
          "The local gateway replied, but the internet endpoint did not; the break is beyond the local network or at the ISP.",
      };
    }
  }

  if (gateway.state !== "pass" || server.state !== "pass") {
    return {
      code: "inconclusive",
      title: "Inconclusive",
      summary:
        "Some probes could not complete, so the failing layer cannot be isolated.",
    };
  }

  return {
    code: "inconclusive",
    title: "Inconclusive",
    summary:
      "The network check did not produce enough evidence for a diagnosis.",
  };
}

export function getProbeDetail(probe: PingProbeResult): string {
  const state = getProbeStateLabel(probe.state);
  const latency =
    probe.latencyMs === undefined ? undefined : `${probe.latencyMs} ms`;

  return [state, latency, probe.detail].filter(Boolean).join(" · ");
}
