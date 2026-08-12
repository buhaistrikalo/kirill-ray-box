import { execFile } from "node:child_process";
import { isIP } from "node:net";
import { promisify } from "node:util";

import type { PingProbeResult, PingProbeSet, PingProvider } from "./types";

export const INTERNET_ENDPOINT =
  "https://connectivitycheck.gstatic.com/generate_204";
export const DEFAULT_REMOTE_ENDPOINT = "https://example.com/";

const ROUTE_COMMAND = "/sbin/route";
const PING_COMMAND = "/sbin/ping";
const SCUTIL_COMMAND = "/usr/sbin/scutil";
const ROUTE_TIMEOUT_MS = 2_000;
const PING_TIMEOUT_MS = 1_500;
const HTTP_TIMEOUT_MS = 5_000;
const MAX_COMMAND_OUTPUT_BYTES = 32 * 1024;

export interface DefaultRoute {
  gateway: string;
  interface?: string;
}

export interface CommandResult {
  stdout: string;
  stderr?: string;
}

export type CommandExecutor = (
  command: string,
  args: readonly string[],
  options: { timeout: number },
) => Promise<CommandResult>;

export interface PingProviderOptions {
  executor?: CommandExecutor;
  fetcher?: typeof fetch;
  now?: () => number;
  internetEndpoint?: string;
  remoteEndpoint?: string;
}

const execFileAsync = promisify(execFile);

const defaultExecutor: CommandExecutor = async (command, args, options) => {
  const result = await execFileAsync(command, [...args], {
    encoding: "utf8",
    maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
    timeout: options.timeout,
  });

  return {
    stdout: String(result.stdout),
    stderr: String(result.stderr),
  };
};

function asValidGateway(value: string | undefined): string | undefined {
  if (
    !value ||
    value.startsWith("link#") ||
    value === "-" ||
    value === "none"
  ) {
    return undefined;
  }

  const withoutScope = value.replace(/%[^%]+$/u, "");
  return isIP(withoutScope) > 0 ? value : undefined;
}

function asInterface(value: string | undefined): string | undefined {
  return value && /^[A-Za-z0-9._-]+$/u.test(value) ? value : undefined;
}

export function parseDefaultRoute(output: string): DefaultRoute | undefined {
  const gateway = asValidGateway(output.match(/^\s*gateway:\s*(\S+)/imu)?.[1]);

  if (!gateway) {
    return undefined;
  }

  const networkInterface = asInterface(
    output.match(/^\s*interface:\s*(\S+)/imu)?.[1],
  );

  return networkInterface
    ? { gateway, interface: networkInterface }
    : { gateway };
}

export function parsePingLatency(output: string): number | undefined {
  const value = output.match(/\btime=([0-9]+(?:\.[0-9]+)?)\s*ms\b/iu)?.[1];
  if (!value) {
    return undefined;
  }

  const latency = Number(value);
  return Number.isFinite(latency) && latency >= 0 ? latency : undefined;
}

export interface VpnActivity {
  active: boolean;
  serviceName?: string;
}

export function parseVpnActivity(output: string): VpnActivity {
  const connectedLine = output
    .split(/\r?\n/u)
    .find((line) => /\(\s*connected\s*\)/iu.test(line));

  if (!connectedLine) {
    return { active: false };
  }

  const serviceName = connectedLine
    .replace(/^\s*\*?\s*\(\s*connected\s*\)\s*/iu, "")
    .trim();

  return serviceName ? { active: true, serviceName } : { active: true };
}

export function normalizeRemoteEndpoint(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return DEFAULT_REMOTE_ENDPOINT;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) {
      return DEFAULT_REMOTE_ENDPOINT;
    }

    return url.toString();
  } catch {
    return DEFAULT_REMOTE_ENDPOINT;
  }
}

function endpointName(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function makeProbe(
  id: PingProbeResult["id"],
  label: string,
  state: PingProbeResult["state"],
  detail: string,
  options: Pick<PingProbeResult, "latencyMs" | "target"> = {},
): PingProbeResult {
  return { id, label, state, detail, ...options };
}

function errorLooksLikeTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    killed?: unknown;
    signal?: unknown;
  };
  return (
    candidate.code === "ETIMEDOUT" ||
    candidate.killed === true ||
    candidate.signal === "SIGTERM"
  );
}

export class MacNetworkPingProvider implements PingProvider {
  private readonly executor: CommandExecutor;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly internetEndpoint: string;
  private readonly remoteEndpoint: string;

  constructor(options: PingProviderOptions = {}) {
    this.executor = options.executor ?? defaultExecutor;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.internetEndpoint = options.internetEndpoint ?? INTERNET_ENDPOINT;
    this.remoteEndpoint = normalizeRemoteEndpoint(options.remoteEndpoint);
  }

  async check(): Promise<PingProbeSet> {
    const routeResult = await this.readDefaultRoute();
    const gateway = await this.probeGateway(
      routeResult.route,
      routeResult.reason,
    );

    const [internet, server, vpn] = await Promise.all([
      this.probeHttp(
        "internet",
        "Internet endpoint",
        this.internetEndpoint,
        204,
      ),
      this.probeHttp(
        "server",
        `Remote server (${endpointName(this.remoteEndpoint)})`,
        this.remoteEndpoint,
      ),
      this.probeVpn(routeResult.route),
    ]);

    return { gateway, internet, server, vpn };
  }

  private async readDefaultRoute(): Promise<{
    route?: DefaultRoute;
    reason: "command-failed" | "not-found";
  }> {
    try {
      const result = await this.executor(
        ROUTE_COMMAND,
        ["-n", "get", "default"],
        { timeout: ROUTE_TIMEOUT_MS },
      );
      const route = parseDefaultRoute(result.stdout);
      return route ? { route, reason: "not-found" } : { reason: "not-found" };
    } catch {
      return { reason: "command-failed" };
    }
  }

  private async probeGateway(
    route: DefaultRoute | undefined,
    reason: "command-failed" | "not-found",
  ): Promise<PingProbeResult> {
    if (!route) {
      return makeProbe(
        "gateway",
        "Default gateway",
        "unknown",
        reason === "command-failed"
          ? "Could not read the macOS default route."
          : "No usable default gateway was reported by macOS.",
      );
    }

    const routeDescription = route.interface
      ? `${route.gateway} via ${route.interface}`
      : route.gateway;

    try {
      const result = await this.executor(
        PING_COMMAND,
        ["-n", "-c", "1", "-W", String(PING_TIMEOUT_MS), route.gateway],
        { timeout: PING_TIMEOUT_MS + 500 },
      );

      return makeProbe(
        "gateway",
        "Default gateway",
        "pass",
        `${routeDescription} replied to ICMP`,
        { latencyMs: parsePingLatency(result.stdout), target: route.gateway },
      );
    } catch (error) {
      return makeProbe(
        "gateway",
        "Default gateway",
        "fail",
        `${routeDescription} did not reply to one ICMP echo${errorLooksLikeTimeout(error) ? " before the timeout" : ""}`,
        { target: route.gateway },
      );
    }
  }

  private async probeHttp(
    id: "internet" | "server",
    label: string,
    endpoint: string,
    expectedStatus?: number,
  ): Promise<PingProbeResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const startedAt = this.now();
    const target = endpointName(endpoint);

    try {
      let response: Response;
      try {
        response = await this.fetcher(endpoint, {
          headers: { Accept: "*/*" },
          method: "GET",
          signal: controller.signal,
        });
      } catch {
        return makeProbe(
          id,
          label,
          "fail",
          controller.signal.aborted
            ? "Request timed out"
            : "Request failed before an HTTP response",
          { target },
        );
      }

      const latencyMs = Math.max(0, this.now() - startedAt);
      const statusIsExpected =
        expectedStatus === undefined
          ? response.ok
          : response.status === expectedStatus;

      if (!statusIsExpected) {
        if (response.body) {
          await response.body.cancel().catch(() => undefined);
        }

        const expected =
          expectedStatus === undefined
            ? "a successful HTTP status"
            : `HTTP ${expectedStatus}`;
        return makeProbe(
          id,
          label,
          "fail",
          `Expected ${expected}, received HTTP ${response.status}`,
          { latencyMs, target },
        );
      }

      if (response.body) {
        await response.body.cancel().catch(() => undefined);
      }

      return makeProbe(
        id,
        label,
        "pass",
        `HTTP ${response.status} from ${target}`,
        { latencyMs, target },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async probeVpn(
    route: DefaultRoute | undefined,
  ): Promise<PingProbeResult> {
    if (route?.interface && /^utun\d+$/iu.test(route.interface)) {
      return makeProbe(
        "vpn",
        "VPN activity",
        "pass",
        `The default route uses tunnel interface ${route.interface}`,
        { target: route.interface },
      );
    }

    let output: string;
    try {
      const result = await this.executor(SCUTIL_COMMAND, ["--nc", "list"], {
        timeout: ROUTE_TIMEOUT_MS,
      });
      output = result.stdout;
    } catch {
      return makeProbe(
        "vpn",
        "VPN activity",
        "unknown",
        "macOS VPN status could not be inspected.",
      );
    }

    const activity = parseVpnActivity(output);
    if (activity.active) {
      return makeProbe(
        "vpn",
        "VPN activity",
        "pass",
        activity.serviceName
          ? `Connected VPN service: ${activity.serviceName}`
          : "A connected VPN service was detected",
        { target: activity.serviceName },
      );
    }

    return makeProbe(
      "vpn",
      "VPN activity",
      "not-detected",
      "No active macOS VPN connection was detected (best effort).",
    );
  }
}
