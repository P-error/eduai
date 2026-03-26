"use client";

export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="text-lg font-semibold">{title}</h3>
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
        <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <p className="text-xs uppercase text-slate-400">{item.label}</p>
          <p className="mt-2 text-lg font-semibold">{item.value}</p>
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
          <div className="flex justify-between text-xs text-slate-300">
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead className="text-slate-400">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="pb-2 pr-3">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-t border-slate-800 text-slate-300">
              {columns.map((column) => (
                <td key={column.key} className="py-2 pr-3">
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
