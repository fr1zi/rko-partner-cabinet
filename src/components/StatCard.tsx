export function StatCard({
  label,
  value,
  hint,
  accent = "cyan",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "cyan" | "emerald" | "amber" | "indigo";
}) {
  const accents = {
    cyan: "from-cyan-500/10 to-transparent text-cyan-300",
    emerald: "from-emerald-500/10 to-transparent text-emerald-300",
    amber: "from-amber-500/10 to-transparent text-amber-300",
    indigo: "from-indigo-500/10 to-transparent text-indigo-300",
  };

  return (
    <div
      className={`ui-card relative overflow-hidden p-5 bg-gradient-to-br ${accents[accent]}`}
    >
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
