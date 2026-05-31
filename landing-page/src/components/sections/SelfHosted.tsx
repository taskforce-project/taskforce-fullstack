import { ArrowRight } from "lucide-react";

export function SelfHosted() {
  return (
    <section className="relative overflow-hidden bg-black py-24 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(71,85,105,0.24),transparent_40%),radial-gradient(circle_at_82%_18%,rgba(2,6,23,0.45),transparent_40%)]" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
          <div className="max-w-3xl">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            Deploy Taskforce on your own infrastructure.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/72">
            Keep full control over data residency, compliance, and security while giving teams the same fast product experience.
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/8 px-5 py-2.5 text-sm font-semibold text-white/92 transition-colors hover:bg-white/14"
            >
              Talk to a human <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
          </div>

          <div className="pt-2 text-sm leading-relaxed text-white/70">
            <p className="mb-3">
              Built for on-prem and air-gapped environments where reliability, observability, and governance are non-negotiable.
            </p>
            <p>
              The only modern project management platform built for environments where you control every layer.
            </p>
          </div>
        </div>

        <div className="relative mt-12">
          <div className="relative mx-auto w-11/12">
            <img
              src="https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/modern/saas-hero/saas-hero-1-16x9.png"
              alt="Taskforce dashboard preview"
              className="w-full rounded-xl border border-white/10 object-cover shadow-[0_24px_70px_rgba(0,0,0,0.4)]"
              loading="lazy"
            />

            <div className="absolute top-0 right-0 z-20 translate-x-1/4 -translate-y-1/3 rounded-2xl border border-zinc-200 bg-white px-6 py-5 shadow-[0_16px_32px_rgba(0,0,0,0.18)]">
              <div className="flex items-center gap-4 text-zinc-600">
                <span className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold">Docker</span>
                <span className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold">K8s</span>
              </div>
            </div>

            <div className="absolute right-0 bottom-0 z-20 w-64 translate-x-1/5 translate-y-1/5 rounded-2xl bg-zinc-900 px-6 py-6 text-zinc-200 shadow-[0_18px_34px_rgba(0,0,0,0.45)]">
              <pre className="font-mono text-[9px] leading-3 text-zinc-300">
{`+-+###############+-
+-+######+---------
+-+###########-----
+-+######+---------
+-+######+---------`}
              </pre>
            <p className="mt-3 text-sm">Upgrading Plane</p>
            <p className="text-sm text-zinc-400">Booting up API services</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <article>
            <h3 className="text-2xl font-semibold tracking-tight">Prime CLI</h3>
            <p className="mt-3 text-base leading-relaxed text-white/68">
              Install, configure, upgrade, back up, and monitor your instance with single commands. Multi-instance support and custom domain setup built in.
            </p>
          </article>
          <article>
            <h3 className="text-2xl font-semibold tracking-tight">Docker and Kubernetes</h3>
            <p className="mt-3 text-base leading-relaxed text-white/68">
              Deploy with Docker for quick setup or Kubernetes with Helm charts for production scale. Bring your own Postgres, Redis, and S3-compatible storage.
            </p>
          </article>
          <article>
            <h3 className="text-2xl font-semibold tracking-tight">God Mode</h3>
            <p className="mt-3 text-base leading-relaxed text-white/68">
              One admin panel for your entire instance. Configure SMTP, authentication methods, SSO, workspace security, and telemetry from a single screen.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
