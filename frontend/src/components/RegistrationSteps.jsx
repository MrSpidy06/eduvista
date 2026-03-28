const steps = [
  {
    title: "Plan your semester",
    detail: "Review degree requirements and seat availability."
  },
  {
    title: "Resolve conflicts",
    detail: "Use the schedule builder to eliminate overlaps."
  },
  {
    title: "Submit registration",
    detail: "Confirm credits, prerequisites, and advisor approvals."
  }
];

export default function RegistrationSteps() {
  return (
    <ol className="mt-4 space-y-4">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className="flex gap-3 rounded-2xl border border-transparent bg-slate-950/60 p-3 transition hover:border-sky-400/60"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/20 text-sm font-semibold text-sky-300">
            {index + 1}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {step.title}
            </p>
            <p className="text-sm text-slate-400">{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
