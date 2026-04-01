"use client";

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

  const total = data.reduce((sum, item) => sum + Math.max(item.value, 0), 0);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-lg font-semibold text-white">Trainingsverteilung</h2>
      <p className="mt-1 text-sm text-zinc-400">Minuten pro Kategorie</p>

      <div className="mt-4 space-y-2">
        {data.map((item, index) => {
          const share = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div key={item.name} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">{item.name}</span>
                <span className="font-medium text-white">{item.value} Min ({share}%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${share}%`, backgroundColor: COLORS[index % COLORS.length] }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}