import {
  Color,
  getPreferenceValues,
  Icon,
  Keyboard,
  MenuBarExtra,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getProbeDetail } from "../tools/ping/domain";
import {
  MacNetworkPingProvider,
  normalizeRemoteEndpoint,
} from "../tools/ping/provider";
import { PingService } from "../tools/ping/service";
import type { PingProbeResult, PingResult } from "../tools/ping/types";

type StatusPresentation = {
  title: string;
  summary: string;
  icon: Icon;
  color: Color;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Network check failed";
}

function getStatusPresentation(
  diagnosis: PingResult["diagnosis"] | undefined,
  error: string | undefined,
  isLoading: boolean,
): StatusPresentation {
  if (diagnosis) {
    switch (diagnosis.code) {
      case "healthy":
        return {
          title: diagnosis.title,
          summary: diagnosis.summary,
          icon: Icon.Checkmark,
          color: Color.Green,
        };
      case "local-network":
        return {
          title: diagnosis.title,
          summary: diagnosis.summary,
          icon: Icon.WifiDisabled,
          color: Color.Red,
        };
      case "isp-or-internet":
        return {
          title: diagnosis.title,
          summary: diagnosis.summary,
          icon: Icon.Globe,
          color: Color.Red,
        };
      case "remote-server":
        return {
          title: diagnosis.title,
          summary: diagnosis.summary,
          icon: Icon.Network,
          color: Color.Orange,
        };
      case "vpn":
        return {
          title: diagnosis.title,
          summary: diagnosis.summary,
          icon: Icon.Shield,
          color: Color.Orange,
        };
      case "inconclusive":
        return {
          title: diagnosis.title,
          summary: diagnosis.summary,
          icon: Icon.QuestionMarkCircle,
          color: Color.Yellow,
        };
    }
  }

  return {
    title: isLoading ? "Checking…" : "Unknown",
    summary: error ?? "Waiting for the first network check.",
    icon: isLoading ? Icon.CircleProgress : Icon.QuestionMarkCircle,
    color: Color.Yellow,
  };
}

function getProbeIcon(probe: PingProbeResult): {
  source: Icon;
  tintColor: Color;
} {
  switch (probe.state) {
    case "pass":
      return { source: Icon.Checkmark, tintColor: Color.Green };
    case "fail":
      return { source: Icon.XMarkCircle, tintColor: Color.Red };
    case "unknown":
      return { source: Icon.QuestionMarkCircle, tintColor: Color.Yellow };
    case "not-detected":
      return { source: Icon.Circle, tintColor: Color.SecondaryText };
  }
}

function formatCheckedAt(checkedAt: string): string {
  const date = new Date(checkedAt);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getTooltip(
  presentation: StatusPresentation,
  result: PingResult | undefined,
  isLoading: boolean,
): string {
  const checkedAt = result
    ? `Last checked: ${formatCheckedAt(result.checkedAt)}`
    : "No completed check yet";
  const refreshing = isLoading ? "\nRefreshing…" : "";
  return `${presentation.title}: ${presentation.summary}\n${checkedAt}${refreshing}`;
}

export default function PingCommand() {
  const preferences = getPreferenceValues<Preferences.Ping>();
  const remoteEndpoint = normalizeRemoteEndpoint(preferences.remoteEndpoint);
  const service = useMemo(
    () => new PingService(new MacNetworkPingProvider({ remoteEndpoint })),
    [remoteEndpoint],
  );
  const requestNumber = useRef(0);
  const [result, setResult] = useState<PingResult>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestNumber.current;
    setIsLoading(true);
    setError(undefined);

    try {
      const nextResult = await service.check();
      if (currentRequest !== requestNumber.current) {
        return;
      }

      setResult(nextResult);
    } catch (checkError) {
      if (currentRequest !== requestNumber.current) {
        return;
      }

      setResult(undefined);
      setError(getErrorMessage(checkError));
    } finally {
      if (currentRequest === requestNumber.current) {
        setIsLoading(false);
      }
    }
  }, [service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const presentation = getStatusPresentation(
    result?.diagnosis,
    error,
    isLoading,
  );
  const probes = result
    ? [result.gateway, result.internet, result.server, result.vpn]
    : [];

  return (
    <MenuBarExtra
      icon={{ source: presentation.icon, tintColor: presentation.color }}
      tooltip={getTooltip(presentation, result, isLoading)}
      isLoading={isLoading}
    >
      <MenuBarExtra.Section title="Diagnosis">
        <MenuBarExtra.Item
          title={presentation.title}
          subtitle={presentation.summary}
          icon={{ source: presentation.icon, tintColor: presentation.color }}
        />
      </MenuBarExtra.Section>

      <MenuBarExtra.Section title="Probes">
        {probes.length > 0 ? (
          probes.map((probe) => (
            <MenuBarExtra.Item
              key={probe.id}
              title={probe.label}
              subtitle={getProbeDetail(probe)}
              icon={getProbeIcon(probe)}
            />
          ))
        ) : (
          <MenuBarExtra.Item
            title={error ? "Check failed" : "Checking network…"}
            subtitle={error ?? "Waiting for the first completed probe"}
            icon={{
              source: error ? Icon.QuestionMarkCircle : Icon.CircleProgress,
              tintColor: Color.Yellow,
            }}
          />
        )}
      </MenuBarExtra.Section>

      {result ? (
        <MenuBarExtra.Section title="Last checked">
          <MenuBarExtra.Item
            title={formatCheckedAt(result.checkedAt)}
            subtitle="Local time"
            icon={Icon.Clock}
          />
        </MenuBarExtra.Section>
      ) : null}

      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title={isLoading ? "Refreshing…" : "Refresh now"}
          subtitle="Run all network probes"
          icon={Icon.ArrowClockwise}
          shortcut={Keyboard.Shortcut.Common.Refresh}
          onAction={() => void refresh()}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
