"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type ChartItem = {
  name: string;
  value: number;
};

type Props = {
  data: ChartItem[];
};

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"];

export default function TrainingDistributionPie({ data }: Props) {
  if (!data.length) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-400">
        Noch keine Trainingsdaten vorhanden.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-lg font-semibold text-white">Trainingsverteilung</h2>
      <p className="mt-1 text-sm text-zinc-400">Minuten pro Kategorie</p>

      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              outerRadius={90}
              innerRadius={50}
              paddingAngle={3}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 space-y-2">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-zinc-300">{item.name}</span>
            </div>
            <span className="font-medium text-white">{item.value} Min</span>
          </div>
        ))}
      </div>
    </div>
  );
}