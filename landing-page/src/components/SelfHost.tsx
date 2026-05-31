import { Terminal, Server, Shield, ArrowRight, ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const steps = [
  {
    id: "step-1",
    num: "01",
    title: "Clone the repository",
    code: "git clone https://github.com/taskforce-project/taskforce.git\ncd taskforce",
  },
  {
    id: "step-2",
    num: "02",
    title: "Configure your environment",
    code: "cp .env.example .env\n# Edit .env with your values (DB, Keycloak, SMTP…)",
  },
  {
    id: "step-3",
    num: "03",
    title: "Start with Docker Compose",
    code: "docker compose -f docker-compose.prod.yml up -d\n# Services: postgres, keycloak, backend, frontend, nginx",
  },
  {
    id: "step-4",
    num: "04",
    title: "Access your instance",
    code: "# Frontend → http://your-domain\n# Admin    → http://your-domain:8180/admin\n# API      → http://your-domain/api",
  },
] as const;

function CodeBlock({ code }: { readonly code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-xl bg-[#111117] border border-white/8 overflow-hidden">
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="px-5 py-4 text-sm text-white/70 font-mono overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function SelfHost() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-16 text-center">
        <Badge
          variant="outline"
          className="mb-6 border-white/15 bg-white/5 text-white/60 uppercase tracking-widest text-[11px] px-3"
        >
          Open source
        </Badge>
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-white mb-5 leading-[1.05]">
          Self-host Taskforce
        </h1>
        <p className="text-lg text-white/50 max-w-2xl mx-auto mb-8 leading-relaxed">
          Full control of your data. Deploy on any cloud or on-premises in minutes with Docker Compose or Kubernetes.
          Licensed under{" "}
          <a
            href="https://www.gnu.org/licenses/agpl-3.0.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/70 underline hover:text-white transition-colors"
          >
            AGPL-3.0</a>.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            asChild
            className="bg-white text-black hover:bg-white/90 font-semibold gap-2"
            variant="ghost"
          >
            <a
              href="https://github.com/taskforce-project/taskforce"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
              View on GitHub
              <ExternalLink className="h-3.5 w-3.5 opacity-50" />
            </a>
          </Button>
          <Button asChild className="bg-white/6 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white gap-2" variant="ghost">
            <a href="/docs">
              Full documentation
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>

      {/* Requirements */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: Server, title: "Requirements", items: ["2 vCPU / 4 GB RAM min.", "Docker 24+ & Compose v2", "Port 80/443 open"] },
            { icon: Terminal, title: "Supported platforms", items: ["Ubuntu 22.04 / 24.04", "Debian 12+", "Any Kubernetes 1.28+"] },
            { icon: Shield, title: "Security", items: ["TLS via Nginx / Traefik", "Keycloak identity provider", "Secrets via .env or Vault"] },
          ].map(({ icon: Icon, title, items }) => (
            <div key={title} className="p-6 rounded-2xl border border-white/8 bg-white/2">
              <Icon className="h-5 w-5 text-white/40 mb-3" />
              <p className="text-white font-semibold mb-3">{title}</p>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li key={item} className="text-sm text-white/50 flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-white/25 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Quickstart */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <h2 className="text-2xl font-bold text-white mb-8">Quickstart - Docker Compose</h2>
        <div className="space-y-6">
          {steps.map((step) => (
            <div key={step.id} className="flex gap-5">
              <div className="shrink-0 w-10 h-10 rounded-xl border border-white/10 bg-white/4 flex items-center justify-center">
                <span className="text-[11px] font-mono text-white/40">{step.num}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium mb-2">{step.title}</p>
                <CodeBlock code={step.code} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 p-5 rounded-xl border border-white/8 bg-white/2">
          <p className="text-white/50 text-sm">
            <span className="text-white/80 font-medium">Need help?</span>{" "}
            Join our{" "}
            <a
              href="https://github.com/taskforce-project/taskforce/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/70 underline hover:text-white transition-colors"
            >
              GitHub Discussions
            </a>{" "}
            or check the{" "}
            <a href="/docs" className="text-white/70 underline hover:text-white transition-colors">
              full documentation
            </a>.
          </p>
        </div>
      </section>
    </div>
  );
}
