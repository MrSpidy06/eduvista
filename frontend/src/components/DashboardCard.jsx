export default function DashboardCard({ label, value, hint, accent }) {
  return (
    <div className="group rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-slate-900/40 transition hover:-translate-y-1 hover:border-sky-400/70">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-300">{label}</p>
        <div
          className={`h-10 w-10 rounded-2xl bg-gradient-to-br ${accent} opacity-80`}
        />
      </div>
      <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{hint}</p>
    </div>
  );
}
