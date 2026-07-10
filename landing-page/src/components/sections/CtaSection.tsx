/** CtaSection — invitation finale de la home (light). */

export function CtaSection() {
  return (
    <section className="pb-28">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <div
          className="relative overflow-hidden rounded-3xl border border-black/[0.08] px-8 py-16 text-center sm:py-20"
          style={{ background: "linear-gradient(180deg,#ffffff,#f4f4f6)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-72 w-[680px] -translate-x-1/2 rounded-full blur-3xl"
            style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(99,102,241,0.12), transparent 70%)" }}
          />
          <h2 className="relative text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-[40px] sm:leading-[1.1]">
            Start shipping with AI — free
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-[15px] text-muted-foreground sm:text-lg">
            Describe the outcome. TaskForce orchestrates the execution. No credit card required.
          </p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="http://localhost:3000/auth/register"
              className="inline-flex h-11 items-center rounded-lg bg-foreground px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Get started free
            </a>
            <a
              href="/contact"
              className="inline-flex h-11 items-center rounded-lg border border-black/[0.1] bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60"
            >
              Book a demo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
