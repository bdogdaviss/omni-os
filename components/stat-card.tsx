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
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader className="gap-1 p-4">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
    </Card>
  );
}
