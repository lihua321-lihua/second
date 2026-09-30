import { Badge } from "@/components/ui/badge";

export function VersionBadge({ version }: { version: number | null }) {
  if (version == null) {
    return <Badge variant="outline">暂未生成版本</Badge>;
  }
  return <Badge variant="outline">v{version}</Badge>;
}