// Pure CSS infinite-scroll testimonial columns - no framer-motion dependency
export interface TestimonialItem {
  text: string;
  author: string;
  role: string;
  accent?: string;
}

interface TestimonialsColumnsProps {
  testimonials: TestimonialItem[];
  columns?: number;
}

function TestimonialCard({ item }: { item: TestimonialItem }) {
  const accent = item.accent ?? "#60a5fa";
  const initials = item.author
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="p-5 rounded-2xl bg-card dark:bg-[#0a0a0a] border border-border/50 dark:border-white/[0.07] mb-4 break-inside-avoid">
      <p className="text-muted-foreground text-sm leading-relaxed mb-4">&ldquo;{item.text}&rdquo;</p>
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ background: `${accent}15`, border: `1px solid ${accent}25`, color: accent }}
        >
          {initials}
        </div>
        <div>
          <p className="text-foreground/80 text-xs font-semibold">{item.author}</p>
          {/* Idem : l'opacité passait sous le seuil de contraste WCAG AA. */}
          <p className="text-muted-foreground text-[10px]">{item.role}</p>
        </div>
      </div>
    </div>
  );
}

function InfiniteColumn({
  items,
  reverse = false,
  duration = 30,
}: {
  items: TestimonialItem[];
  reverse?: boolean;
  duration?: number;
}) {
  const animClass = reverse ? "animate-scroll-up-reverse" : "animate-scroll-up";

  return (
    <div className="relative overflow-hidden flex-1" style={{ maxHeight: "600px" }}>
      {/* Fade edges */}
      <div className="absolute top-0 left-0 right-0 h-16 z-10 bg-linear-to-b from-muted/30 dark:from-[#050505] to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-16 z-10 bg-linear-to-t from-muted/30 dark:from-[#050505] to-transparent pointer-events-none" />

      <div
        className={animClass}
        style={{ animationDuration: `${duration}s` }}
      >
        {/* Duplicate items for seamless loop */}
        {[...items, ...items].map((item, i) => (
          <TestimonialCard key={i} item={item} />
        ))}
      </div>
    </div>
  );
}

export function TestimonialsColumns({ testimonials, columns = 3 }: TestimonialsColumnsProps) {
  const cols: TestimonialItem[][] = Array.from({ length: columns }, () => []);
  testimonials.forEach((t, i) => cols[i % columns].push(t));

  const durations = [35, 28, 40];

  return (
    <div className="flex gap-4" style={{ height: "600px" }}>
      {cols.map((col, i) => (
        <InfiniteColumn
          key={i}
          items={col}
          reverse={i % 2 === 1}
          duration={durations[i] ?? 30}
        />
      ))}
    </div>
  );
}

export default TestimonialsColumns;
