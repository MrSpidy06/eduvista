export default function CourseList({ courses }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-slate-900/40">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Recommended Courses
          </h2>
          <p className="text-sm text-slate-300">
            Based on your degree plan and interests.
          </p>
        </div>
        <button className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-white">
          View catalog
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {courses.map((course) => (
          <div
            key={course.code}
            className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 transition hover:-translate-y-1 hover:border-sky-400/70 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-sky-400">{course.code}</p>
              <h3 className="text-base font-semibold text-white">
                {course.title}
              </h3>
              <p className="mt-1 text-sm text-slate-400">{course.schedule}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
              <span className="rounded-full border border-slate-700 px-3 py-1">
                {course.credits} credits
              </span>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">
                Seats {course.seats}
              </span>
              <button className="rounded-full bg-gradient-to-r from-sky-400 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:-translate-y-0.5">
                Add course
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
