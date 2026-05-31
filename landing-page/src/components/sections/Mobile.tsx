import { Apple, ArrowRight, Smartphone } from "lucide-react";

export function Mobile() {
  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-black pt-24 pb-0 text-white">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-black via-[#090909] to-[#2f2f2f]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_16%,rgba(2,6,23,0.5),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-96 bg-linear-to-b from-transparent via-[#0d0d0d]/80 to-[#0e0e0e]" />
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-end">
          <div className="relative z-10 max-w-2xl pb-24 lg:pb-32">
            <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              Your entire workspace on mobile, for cloud and self-hosted teams.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-white/72">
              Stay in sync with your team from anywhere. Review priorities, update tasks, and move work forward in real time.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <a
                href="/download/apple"
                className="rounded-xl border border-white/10 bg-white/6 px-5 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                <span className="inline-flex items-center gap-2">
                  <Apple className="h-4 w-4" />
                  Download for iOS
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </span>
              </a>
              <a
                href="/download/android"
                className="rounded-xl border border-white/10 bg-white/6 px-5 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                <span className="inline-flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  Download for Android
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </span>
              </a>
            </div>
          </div>

          <div className="relative z-10 flex items-end self-end justify-center lg:justify-end">
            <div className="w-full max-w-155 drop-shadow-[0_44px_95px_rgba(0,0,0,0.6)]">
              <picture className="block w-full">
                <source srcSet="/images/mobile.avif" type="image/avif" />
                <source srcSet="/images/mobile.webp" type="image/webp" />
                <img
                  src="/images/mobile.webp"
                  alt="Taskforce mobile app preview"
                  className="h-auto w-full object-contain"
                  loading="lazy"
                />
              </picture>
            </div>
            <div className="pointer-events-none absolute inset-x-10 bottom-0 h-14 rounded-full bg-[#0e0e0e]/85 blur-xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
