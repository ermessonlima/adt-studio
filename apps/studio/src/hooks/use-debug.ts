import { useQuery } from "@tanstack/react-query"
import { api, type LlmLogsParams } from "@/api/client"

export function useLlmLogs(label: string, params?: LlmLogsParams) {
  return useQuery({
    queryKey: ["debug", "llm-logs", label, params],
    queryFn: () => api.getLlmLogs(label, params),
    enabled: !!label,
  })
}

export function usePipelineStats(
  label: string,
  options?: { refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: ["debug", "stats", label],
    queryFn: () => api.getPipelineStats(label),
    enabled: !!label,
    refetchInterval: options?.refetchInterval ?? false,
  })
}

export function useActiveConfig(label: string) {
  return useQuery({
    queryKey: ["debug", "config", label],
    queryFn: () => api.getActiveConfig(label),
    enabled: !!label,
  })
}

export function useVersionHistory(
  label: string,
  node: string,
  itemId: string,
  includeData?: boolean
) {
  return useQuery({
    queryKey: ["debug", "versions", label, node, itemId, includeData],
    queryFn: () => api.getVersionHistory(label, node, itemId, includeData),
    enabled: !!label && !!node && !!itemId,
  })
}
