import V2Card from "@/components/v2/V2Card";

export default function V2MetricCard({
  helper,
  label,
  value,
}: {
  helper?: string;
  label: string;
  value: string;
}) {
  return (
    <V2Card className="v2-metric-card">
      <p className="v2-meta">{label}</p>
      <p className="v2-metric-value">{value}</p>
      {helper ? <p className="v2-meta mt-2">{helper}</p> : null}
    </V2Card>
  );
}
