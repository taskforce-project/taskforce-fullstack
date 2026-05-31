import { Github, Twitter } from "lucide-react";

interface MinimalFooterProps {
  links?: { label: string; href: string }[];
  socials?: { icon: "github" | "twitter"; href: string }[];
  copyright?: string;
}

const SocialIcon = ({ icon, href }: { icon: string; href: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-white/25 hover:text-white/60 transition-colors"
  >
    {icon === "github" ? <Github className="h-4 w-4" /> : <Twitter className="h-4 w-4" />}
  </a>
);

export function MinimalFooter({ links, socials, copyright }: MinimalFooterProps) {
  const defaultLinks = [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Security", href: "/security" },
    { label: "Status", href: "https://status.taskforce.app" },
  ];

  const defaultSocials = [
    { icon: "github" as const, href: "https://github.com/taskforce-project" },
    { icon: "twitter" as const, href: "https://twitter.com/taskforceapp" },
  ];

  return (
    <footer className="py-6 border-t border-white/[0.05] bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
        <p className="text-white/20 text-xs">
          {copyright ?? `© ${new Date().getFullYear()} Taskforce, Inc. All rights reserved.`}
        </p>

        <nav className="flex flex-wrap items-center gap-4">
          {(links ?? defaultLinks).map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-white/25 text-xs hover:text-white/60 transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {(socials ?? defaultSocials).map((s) => (
            <SocialIcon key={s.icon} {...s} />
          ))}
        </div>
      </div>
    </footer>
  );
}

export default MinimalFooter;
