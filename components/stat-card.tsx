import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type StatCardProps = {
  label: string;
  value: number | string;
  description?: string;
};

export function StatCard({ label, value, description }: StatCardProps) {
  return (
    <Card className="min-w-0 rounded-lg border-border/70 shadow-sm">
      <CardHeader className="gap-1 p-4">
        <CardDescription className="truncate text-xs" title={label}>
          {label}
        </CardDescription>
        <CardTitle className="break-words text-2xl leading-tight">
          {value}
        </CardTitle>
        {description ? (
          <p className="truncate text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </CardHeader>
    </Card>
  );
}
