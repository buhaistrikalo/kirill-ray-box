export type PingProbeId = "gateway" | "internet" | "server" | "vpn";

export type ProbeState = "pass" | "fail" | "unknown" | "not-detected";

export interface PingProbeResult {
  id: PingProbeId;
  label: string;
  state: ProbeState;
  detail: string;
  target?: string;
  latencyMs?: number;
}

export interface PingProbeSet {
  gateway: PingProbeResult;
  internet: PingProbeResult;
  server: PingProbeResult;
  vpn: PingProbeResult;
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
