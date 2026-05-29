import { Globe, Mail, MapPin, Phone, Twitter } from "lucide-react";

import { FooterBackgroundGradient, TextHoverEffect } from "@/components/ui/hover-footer";

const footerLinks = {
  Product: [
    { label: "Tasks & Projects", href: "/#tasks" },
    { label: "Team Wiki",        href: "/#wiki" },
    { label: "AI Co-pilot",      href: "/#ai" },
    { label: "Analytics",        href: "/#analytics" },
    { label: "Integrations",     href: "/#integrations" },
    { label: "Pricing",          href: "/pricing" },
  ],
  "Self-hosted": [
    { label: "Overview",           href: "/self-host" },
    { label: "Docker / Kubernetes", href: "/self-host#deployment" },
    { label: "Enterprise",         href: "/enterprise" },
    { label: "Security",           href: "/security" },
  ],
  Company: [
    { label: "About",     href: "/about" },
    { label: "Customers", href: "/customers" },
    { label: "Blog",      href: "/blog" },
    { label: "Changelog", href: "/changelog" },
    { label: "Contact",   href: "/contact" },
  ],
  Resources: [
    { label: "Documentation", href: "/docs" },
    { label: "GitHub",        href: "https://github.com/taskforce-project", external: true },
    { label: "API Reference", href: "/docs#api" },
    { label: "Accessibility", href: "/accessibility" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy-policy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Security Policy", href: "/security" },
    { label: "Sitemap",         href: "/sitemap" },
  ],
};

export function Footer() {
  const contactInfo = [
    { icon: <Mail size={18} className="text-white/90" />, text: "hello@taskforce.app", href: "mailto:hello@taskforce.app" },
    { icon: <Phone size={18} className="text-white/90" />, text: "+33 1 80 00 00 00", href: "tel:+33180000000" },
    { icon: <MapPin size={18} className="text-white/90" />, text: "Paris, France" },
  ];

  const socialLinks = [
    { icon: <span className="text-sm font-semibold">Fb</span>, label: "Facebook", href: "#" },
    { icon: <span className="text-sm font-semibold">Ig</span>, label: "Instagram", href: "#" },
    { icon: <Twitter size={20} />, label: "Twitter", href: "#" },
    { icon: <span className="text-sm font-semibold">Db</span>, label: "Dribbble", href: "#" },
    { icon: <Globe size={20} />, label: "Website", href: "/" },
  ];

  return (
    <footer className="relative overflow-hidden border-t border-white/6 bg-black text-white">
      <div className="relative z-20 mx-auto max-w-7xl px-8 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
        <div className="grid grid-cols-1 gap-12 pb-6 md:grid-cols-2 lg:grid-cols-5 lg:gap-16">
          <div className="flex flex-col space-y-4 lg:col-span-2">
            <div className="flex items-center gap-3">
              <img src="/logo_taskforce_tp.png" alt="Taskforce" className="h-24 w-auto invert sm:h-28" />
              <span className="text-3xl font-bold text-white">Taskforce</span>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-white/60">
              Project management, docs, AI, and self-hosted control in one workspace for teams that ship serious work.
            </p>
          </div>

          {Object.entries(footerLinks).slice(0, 2).map(([section, links]) => (
            <div key={section}>
              <h4 className="mb-6 text-lg font-semibold text-white">{section}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener noreferrer" : undefined}
                      className="text-sm text-white/60 transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="mb-6 text-lg font-semibold text-white">Contact</h4>
            <ul className="space-y-4">
              {contactInfo.map((item) => (
                <li key={item.text} className="flex items-center gap-3 text-sm text-white/60">
                  {item.icon}
                  {item.href ? (
                    <a href={item.href} className="transition-colors hover:text-white">
                      {item.text}
                    </a>
                  ) : (
                    <span>{item.text}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <hr className="mb-2 mt-3 border-t border-white/10" />

          <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/50 lg:col-span-5">
            {footerLinks.Legal.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex flex-col items-center justify-between gap-1 text-sm md:flex-row lg:col-span-5">
            <div className="relative z-30 flex space-x-6 text-white/80">
              {socialLinks.map(({ icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="transition-colors hover:text-white"
                >
                  {icon}
                </a>
              ))}
            </div>

            <p className="text-center text-white/42 md:text-left">
              © {new Date().getFullYear()} Taskforce. All rights reserved.
            </p>
          </div>
        </div>

      </div>

      <div className="relative z-10 mt-1 hidden h-44 overflow-hidden lg:block">
        <div className="absolute inset-x-0 h-full" style={{ bottom: "-28px" }}>
          <TextHoverEffect text="Taskforce" className="h-full w-full" />
        </div>
      </div>

      <FooterBackgroundGradient />
    </footer>
  );
}

export default Footer;
