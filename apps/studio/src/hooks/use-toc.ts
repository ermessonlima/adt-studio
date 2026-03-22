import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

export function useToc(label: string) {
  return useQuery({
    queryKey: ["books", label, "toc"],
    queryFn: () => api.getToc(label),
    enabled: !!label,
  })
}
