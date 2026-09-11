export type PingProbeId =
  | "gateway"
  | "internet"
  | "direct-path"
  | "vpn-path"
  | "server"
  | "vpn"
  | "speed";

export type ProbeState = "pass" | "fail" | "unknown" | "not-detected";

export interface PingProbeResult {
  id: PingProbeId;
  label: string;
  state: ProbeState;
  detail: string;
  target?: string;
  latencyMs?: number;
  packetLossPercent?: number;
  packetsSent?: number;
  packetsReceived?: number;
  downloadMbps?: number;
}

export interface PingProbeSet {
  gateway: PingProbeResult;
  internet: PingProbeResult;
  directPath: PingProbeResult;
  vpnPath: PingProbeResult;
  server: PingProbeResult;
  vpn: PingProbeResult;
  speed: PingProbeResult;
}

export type PingDiagnosisCode =
  | "healthy"
  | "local-network"
  | "isp-or-internet"
  | "remote-server"
  | "vpn"
  | "inconclusive";

export interface PingDiagnosis {
  code: PingDiagnosisCode;
  title: string;
  summary: string;
}

export interface PingResult extends PingProbeSet {
  checkedAt: string;
  diagnosis: PingDiagnosis;
}

export interface PingProvider {
  check(): Promise<PingProbeSet>;
}
