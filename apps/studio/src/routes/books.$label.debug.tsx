import { createFileRoute } from "@tanstack/react-router"
import { Terminal } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import { StatsTab } from "@/components/debug/StatsTab"
import { LlmLogsTab } from "@/components/debug/LlmLogsTab"
import { ConfigTab } from "@/components/debug/ConfigTab"
import { VersionsTab } from "@/components/debug/VersionsTab"
import { Trans } from "@lingui/react/macro"

export const Route = createFileRoute("/books/$label/debug")({
  component: DebugPage,
})

function DebugPage() {
  const { label } = Route.useParams()

  const { data: stageStatus } = useQuery({
    queryKey: ["books", label, "stage-status"],
    queryFn: () => api.getStagesStatus(label),
    enabled: !!label,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "running" ? 2000 : false
    },
  })

  const isRunning = stageStatus?.status === "running"

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          <Trans>Debug - {label}</Trans>
        </span>
      </div>

      <Tabs defaultValue="stats" className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center px-4 py-1 border-b border-border shrink-0">
          <TabsList className="h-8">
            <TabsTrigger value="stats" className="text-xs px-2 py-1">
              <Trans>Stats</Trans>
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-xs px-2 py-1">
              <Trans>Logs</Trans>
              {isRunning && (
                <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger value="config" className="text-xs px-2 py-1">
              <Trans>Config</Trans>
            </TabsTrigger>
            <TabsTrigger value="versions" className="text-xs px-2 py-1">
              <Trans>Versions</Trans>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <TabsContent value="stats" className="m-0">
            <StatsTab label={label} isRunning={isRunning} />
          </TabsContent>
          <TabsContent value="logs" className="m-0">
            <LlmLogsTab label={label} isRunning={isRunning} />
          </TabsContent>
          <TabsContent value="config" className="m-0">
            <ConfigTab label={label} />
          </TabsContent>
          <TabsContent value="versions" className="m-0">
            <VersionsTab label={label} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
