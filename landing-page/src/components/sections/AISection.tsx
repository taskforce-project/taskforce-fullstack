import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

type AIFeature = {
  id: string;
  label: string;
  title: string;
  description: string;
  image: string;
  tint: string;
};

const ROTATION_MS = 5500;

const aiFeatures: AIFeature[] = [
  {
    id: "triage",
    label: "Issue triage",
    title: "AI triage incoming requests automatically",
    description: "Detect duplicates, classify urgency, and route each item to the right owner in seconds.",
    image: "/ai/issue-triage.jpg",
    tint: "from-sky-500/26 via-blue-500/15 to-indigo-500/24",
  },
  {
    id: "planning",
    label: "Sprint planning",
    title: "Plan sprints with workload-aware suggestions",
    description: "Taskforce AI proposes realistic cuts, assignments, and estimates based on team capacity.",
    image: "/ai/sprint-planning.jpg",
    tint: "from-violet-500/26 via-fuchsia-500/16 to-slate-600/26",
  },
  {
    id: "assistant",
    label: "Thread to action",
    title: "Turn conversations into executable work",
    description: "From Slack or Teams threads, create tasks, assign owners, and keep everyone updated.",
    image: "/ai/slack-assistant.jpg",
    tint: "from-emerald-500/20 via-cyan-500/14 to-slate-700/28",
  },
];

export function AISection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [progressKey, setProgressKey] = useState(0);
  const [imageError, setImageError] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timeoutId = globalThis.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % aiFeatures.length);
      setProgressKey((current) => current + 1);
    }, ROTATION_MS);

    return () => globalThis.clearTimeout(timeoutId);
  }, [activeIndex]);

  const activeFeature = aiFeatures[activeIndex];

  const handleFeatureSelect = (index: number) => {
    setActiveIndex(index);
    setProgressKey((current) => current + 1);
  };

  return (
    <section className="relative overflow-hidden bg-black py-24 text-white">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_16%_16%,rgba(120,113,108,0.14),transparent_42%),radial-gradient(circle_at_82%_12%,rgba(71,85,105,0.18),transparent_42%)]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            AI capabilities built for product teams shipping fast.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/70">
            Navigate requests, planning, and execution from one intelligent workflow connected to your real context.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="http://localhost:3000/auth/register"
              className="inline-flex items-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
            >
              Get started free
            </a>
            <a
              href="/contact"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/6 px-5 py-2.5 text-sm font-semibold text-white/92 transition-colors hover:bg-white/12"
            >
              Talk to a human <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="mt-14">
          <div className="relative h-80 sm:h-107.5">
            <div className="absolute inset-0 overflow-hidden bg-zinc-900 shadow-[0_32px_70px_rgba(0,0,0,0.62)]">
                {aiFeatures.map((feature, index) => {
                  const hidden = imageError[feature.id];
                  const isActive = index === activeIndex;
                  return (
                    <div
                      key={feature.id}
                      className={`absolute inset-0 transition-opacity duration-500 ${isActive ? "opacity-100" : "opacity-0"}`}
                    >
                      {!hidden && (
                        <img
                          src={feature.image}
                          alt={feature.title}
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={() => setImageError((prev) => ({ ...prev, [feature.id]: true }))}
                        />
                      )}
                      <div className={`absolute inset-0 bg-linear-to-br ${feature.tint}`} />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(255,255,255,0.18),transparent_42%),radial-gradient(circle_at_72%_72%,rgba(148,163,184,0.2),transparent_46%)] mix-blend-screen" />
                    </div>
                  );
                })}

                <div className="absolute inset-0 bg-linear-to-t from-black/46 via-transparent to-black/12" />

                <div className="absolute inset-x-5 bottom-5 sm:inset-x-8 sm:bottom-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">AI view</p>
                  <p className="mt-1 text-lg font-semibold text-white">{activeFeature.title}</p>
                  <p className="mt-1 max-w-xl text-sm text-white/70">
                    {imageError[activeFeature.id]
                      ? "Drop your screenshot in /public/ai with the same filename to render it here."
                      : "Live preview of the selected capability."}
                  </p>
                </div>
              </div>
            </div>
          </div>

        <div className="mt-12">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {aiFeatures.map((feature, index) => (
              <button
                key={feature.id}
                type="button"
                onClick={() => handleFeatureSelect(index)}
                className={`text-left rounded-xl px-4 py-4 transition-colors ${
                  index === activeIndex ? "bg-white/12" : "bg-white/4 hover:bg-white/8"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/62">{feature.label}</p>
                <p className="mt-1 text-sm font-semibold text-white/96">{feature.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/68">{feature.description}</p>

                <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/12">
                  {index === activeIndex ? (
                    <div
                      key={`${feature.id}-${progressKey}`}
                      className="h-full bg-white/70"
                      style={{ animation: `aiFeatureProgress ${ROTATION_MS}ms linear forwards` }}
                    />
                  ) : (
                    <div className="h-full w-0 bg-white/40" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes aiFeatureProgress { from { width: 0%; } to { width: 100%; } }`}</style>
    </section>
  );
}
