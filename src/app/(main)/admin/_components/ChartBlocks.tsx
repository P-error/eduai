"use client";

export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ui-panel ui-panel-body">
      <h3 className="ui-title-md">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function StatGrid({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="ui-panel-soft rounded-[16px] border border-slate-800 p-4">
          <p className="ui-eyebrow">{item.label}</p>
          <p className="ui-title-md mt-3 text-lg">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function BarList({
  rows,
  valueLabel,
}: {
  rows: Array<{ label: string; value: number }>;
  valueLabel?: (value: number) => string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-1">
          <div className="ui-detail-row text-xs">
            <span>{row.label}</span>
            <span>{valueLabel ? valueLabel(row.value) : row.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-slate-200"
              style={{ width: `${Math.max(1, Math.round((row.value / max) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrendTable({
  rows,
  columns,
}: {
  rows: Array<Record<string, string | number | null>>;
  columns: Array<{ key: string; label: string }>;
}) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table text-left text-xs">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((column) => (
                <td key={column.key} className="ui-break-anywhere">
                  {row[column.key] == null ? "-" : String(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
