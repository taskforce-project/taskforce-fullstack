import { ArrowRight, Clock, Tag } from "lucide-react";

const featured = {
  slug: "taskforce-ai-copilot-launch",
  category: "Product",
  categoryColor: "#60a5fa",
  title: "Introducing Taskforce AI Co-pilot: Your workspace finally understands you",
  excerpt: "Most AI assistants know nothing about your work. Taskforce AI is different - it's trained on your projects, cycles, docs, and teammates. Here's what we built and why.",
  author: "Sophie C.",
  authorRole: "Co-founder & CTO",
  authorInitials: "SC",
  authorAccent: "#c084fc",
  date: "May 20, 2026",
  readTime: "8 min read",
};

const posts = [
  {
    slug: "jira-migration-guide",
    category: "Guides",
    categoryColor: "#fb923c",
    title: "How to migrate from Jira to Taskforce in 3 weeks without losing a sprint",
    excerpt: "A step-by-step migration guide used by two Fortune 10 companies. Projects, issues, custom fields, sprints, and attachments - all of it.",
    author: "Alex R.",
    authorInitials: "AR",
    authorAccent: "#60a5fa",
    date: "May 12, 2026",
    readTime: "12 min read",
  },
  {
    slug: "projects-as-code",
    category: "Engineering",
    categoryColor: "#4ade80",
    title: "Projects-as-code with Taskforce Compose: version your PM config in Git",
    excerpt: "Infrastructure engineers version their infra. Why not your project structure? Taskforce Compose brings GitOps to project management.",
    author: "David K.",
    authorInitials: "DK",
    authorAccent: "#fb923c",
    date: "April 28, 2026",
    readTime: "6 min read",
  },
  {
    slug: "self-hosting-guide",
    category: "Guides",
    categoryColor: "#fb923c",
    title: "Self-hosting Taskforce on Kubernetes: production-grade setup in one day",
    excerpt: "Full walkthrough from zero to a production Kubernetes cluster running Taskforce with Postgres, Redis, and S3-compatible storage.",
    author: "Maria G.",
    authorInitials: "MG",
    authorAccent: "#4ade80",
    date: "April 10, 2026",
    readTime: "15 min read",
  },
  {
    slug: "open-source-pm",
    category: "Open Source",
    categoryColor: "#c084fc",
    title: "Why we open-sourced our core: lessons from 48,000 GitHub stars",
    excerpt: "Open source isn't just a distribution strategy - it's a trust signal, a community lever, and the fastest way to find product-market fit. Here's what we learned.",
    author: "Alex R.",
    authorInitials: "AR",
    authorAccent: "#60a5fa",
    date: "March 22, 2026",
    readTime: "7 min read",
  },
  {
    slug: "team-velocity-metrics",
    category: "Best Practices",
    categoryColor: "#60a5fa",
    title: "The 5 sprint metrics that actually predict whether you'll ship on time",
    excerpt: "Velocity alone lies. Cycle time, lead time, WIP age, and two more metrics give you the full picture. Here's how to track them in Taskforce.",
    author: "Emma W.",
    authorInitials: "EW",
    authorAccent: "#c084fc",
    date: "March 5, 2026",
    readTime: "9 min read",
  },
  {
    slug: "async-collaboration",
    category: "Best Practices",
    categoryColor: "#60a5fa",
    title: "How remote-first teams use Taskforce for async stand-ups and decision logs",
    excerpt: "No more sync-for-sync's-sake. We talked to 12 remote teams about how they use cycles, wikis, and @AI to stay aligned across time zones.",
    author: "Emma W.",
    authorInitials: "EW",
    authorAccent: "#c084fc",
    date: "February 18, 2026",
    readTime: "6 min read",
  },
];

const categories = ["All", "Product", "Guides", "Engineering", "Open Source", "Best Practices"];

export function BlogPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-white/[0.01] rounded-full blur-[120px]" />
          <div className="bg-grid absolute inset-0" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="badge-dark mb-6 inline-flex">Blog</div>
          <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-white leading-[1.05] mb-5">
            Stories from the
            <br />
            <span className="gradient-text">Taskforce team</span>
          </h1>
          <p className="text-white/40 text-xl max-w-xl mx-auto leading-relaxed">
            Product updates, engineering deep-dives, and how-to guides for teams that want to get more done.
          </p>
        </div>
      </section>

      {/* Category filter */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat, i) => (
            <button
              key={cat}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                i === 0
                  ? "bg-white text-black"
                  : "border border-white/10 text-white/40 hover:text-white hover:border-white/20 bg-transparent"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Featured post */}
      <section className="py-4 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <a
            href={`/blog/${featured.slug}`}
            className="group block rounded-2xl overflow-hidden bg-[#0a0a0a] border border-white/[0.07] hover:border-white/[0.12] transition-all"
          >
            <div className="bg-gradient-to-br from-blue-500/[0.12] to-purple-500/[0.06] h-44 relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                  <span className="text-2xl font-black text-white/15">TF</span>
                </div>
              </div>
              <div className="absolute top-4 left-4">
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ color: featured.categoryColor, background: `${featured.categoryColor}18` }}
                >
                  {featured.category}
                </span>
              </div>
            </div>
            <div className="p-7">
              <div className="flex items-center gap-3 text-white/25 text-xs mb-4">
                <Clock className="h-3 w-3" />
                {featured.readTime}
                <span>·</span>
                {featured.date}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white mb-3 group-hover:text-white/80 transition-colors leading-tight">
                {featured.title}
              </h2>
              <p className="text-white/45 leading-relaxed mb-6 max-w-3xl text-sm">{featured.excerpt}</p>
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ background: `${featured.authorAccent}18`, border: `1px solid ${featured.authorAccent}28`, color: featured.authorAccent }}
                >
                  {featured.authorInitials}
                </div>
                <div>
                  <p className="text-white/60 text-xs font-semibold">{featured.author}</p>
                  <p className="text-white/25 text-[10px]">{featured.authorRole}</p>
                </div>
                <div className="ml-auto flex items-center gap-1 text-white/40 text-xs font-medium group-hover:text-white/70 transition-colors">
                  Read article <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* Post grid */}
      <section className="pb-24 bg-[#050505]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((post) => (
              <a
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group p-6 rounded-2xl bg-[#0a0a0a] border border-white/[0.07] hover:border-white/[0.12] transition-all flex flex-col"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Tag className="h-3 w-3" style={{ color: post.categoryColor }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: post.categoryColor }}>
                    {post.category}
                  </span>
                </div>
                <h3 className="text-white/80 font-bold text-sm mb-3 leading-snug group-hover:text-white transition-colors flex-1">
                  {post.title}
                </h3>
                <p className="text-white/35 text-xs leading-relaxed mb-5 line-clamp-2">{post.excerpt}</p>
                <div className="flex items-center gap-3 mt-auto pt-4 border-t border-white/[0.05]">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={{ background: `${post.authorAccent}18`, border: `1px solid ${post.authorAccent}28`, color: post.authorAccent }}
                  >
                    {post.authorInitials}
                  </div>
                  <span className="text-white/35 text-xs">{post.author}</span>
                  <span className="text-white/20 text-xs ml-auto flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {post.readTime}
                  </span>
                </div>
              </a>
            ))}
          </div>

          <div className="text-center mt-12">
            <button className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white/50 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors">
              Load more articles <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-20 bg-black border-t border-white/[0.05]">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-black text-white mb-3">Stay in the loop</h2>
          <p className="text-white/35 mb-7 text-sm">New articles every week on product, engineering, and how to build better teams.</p>
          <div className="flex gap-2 max-w-md mx-auto">
            <input
              type="email"
              placeholder="you@company.com"
              className="flex-1 px-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-white/20 text-sm focus:outline-none focus:border-white/20 transition-colors"
            />
            <button className="px-5 py-2.5 text-sm font-semibold text-black bg-white rounded-xl hover:bg-white/90 transition-colors shrink-0 flex items-center gap-1.5">
              Subscribe <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default BlogPage;
