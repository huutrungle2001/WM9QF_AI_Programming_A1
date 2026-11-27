import React from "react";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  className?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  emptyMessage?: string;
  rowClassName?: (row: T) => string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No records found.",
  rowClassName,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50/80">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                      ? "text-center"
                      : "text-left"
                } ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-sm text-slate-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`hover:bg-slate-50/80 transition-colors ${rowClassName ? rowClassName(row) : ""}`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 align-middle text-slate-700 ${
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                          ? "text-center"
                          : "text-left"
                    } ${col.className ?? ""}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
