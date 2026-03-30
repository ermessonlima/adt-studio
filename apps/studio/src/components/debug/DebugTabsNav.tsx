import { TabsList, TabsTrigger } from "@/components/ui/tabs"

interface DebugTabsNavProps {
  isRunning: boolean
}

export function DebugTabsNav({ isRunning }: DebugTabsNavProps) {
  return (
    <TabsList className="h-auto min-w-0 flex-wrap justify-start gap-1 rounded-lg border border-border/60 bg-muted/80 p-1 text-foreground shadow-sm">
      <TabsTrigger value="stats" className="text-xs px-2 py-1">
        Stats
      </TabsTrigger>
      <TabsTrigger value="logs" className="text-xs px-2 py-1">
        Logs
        {isRunning ? (
          <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        ) : null}
      </TabsTrigger>
      <TabsTrigger value="config" className="text-xs px-2 py-1">
        Config
      </TabsTrigger>
      <TabsTrigger value="versions" className="text-xs px-2 py-1">
        Versions
      </TabsTrigger>
    </TabsList>
  )
}
