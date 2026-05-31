import { useState } from "react";
import { Mail, MessageSquare, Building2, User, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    teamSize: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, connect to your form backend or email service
    setSubmitted(true);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left */}
          <div>
            <Badge
              variant="outline"
              className="mb-6 border-white/15 bg-white/5 text-white/60 uppercase tracking-widest text-[11px] px-3"
            >
              Sales
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-5 leading-[1.05]">
              Let&apos;s talk about your team
            </h1>
            <p className="text-white/50 text-lg leading-relaxed mb-10">
              Interested in Enterprise? Need a custom deployment or SLA? Our team will get back to you within one business day.
            </p>

            <div className="space-y-5">
              {[
                {
                  icon: CheckCircle2,
                  text: "Custom pricing based on your team size",
                },
                {
                  icon: CheckCircle2,
                  text: "Dedicated onboarding & migration support",
                },
                {
                  icon: CheckCircle2,
                  text: "SSO, SAML, audit logs & compliance",
                },
                {
                  icon: CheckCircle2,
                  text: "99.9 % SLA with financial penalties",
                },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-white/40 shrink-0" />
                  <span className="text-white/60 text-sm">{text}</span>
                </div>
              ))}
            </div>

            <div className="mt-12 p-5 rounded-xl border border-white/8 bg-white/2">
              <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Or reach us directly</p>
              <a
                href="mailto:sales@taskforce.dev"
                className="flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm"
              >
                <Mail className="h-4 w-4" />
                sales@taskforce.dev
              </a>
            </div>
          </div>

          {/* Right - form */}
          <div className="rounded-2xl border border-white/10 bg-white/3 p-8">
            {submitted ? (
              <div className="flex flex-col items-center justify-center text-center py-12 gap-4">
                <div className="w-14 h-14 rounded-full border border-white/15 bg-white/6 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">Message sent!</h3>
                <p className="text-white/50 text-sm max-w-xs">
                  We&apos;ll get back to you within one business day.
                </p>
                <Button
                  onClick={() => setSubmitted(false)}
                  className="mt-2 bg-white/6 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white"
                  variant="ghost"
                >
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="contact-name" className="block text-sm text-white/50 mb-1.5">
                      <User className="h-3.5 w-3.5 inline mr-1.5" />
                      Full name <span className="text-white/30">*</span>
                    </label>
                    <input
                      id="contact-name"
                      name="name"
                      type="text"
                      required
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Jane Smith"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/25 text-sm focus:outline-none focus:border-white/25 transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-sm text-white/50 mb-1.5">
                      <Mail className="h-3.5 w-3.5 inline mr-1.5" />
                      Work email <span className="text-white/30">*</span>
                    </label>
                    <input
                      id="contact-email"
                      name="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="jane@company.com"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/25 text-sm focus:outline-none focus:border-white/25 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="contact-company" className="block text-sm text-white/50 mb-1.5">
                    <Building2 className="h-3.5 w-3.5 inline mr-1.5" />
                    Company
                  </label>
                  <input
                    id="contact-company"
                    name="company"
                    type="text"
                    value={form.company}
                    onChange={handleChange}
                    placeholder="Acme Corp"
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/25 text-sm focus:outline-none focus:border-white/25 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="contact-team-size" className="block text-sm text-white/50 mb-1.5">
                    Team size
                  </label>
                  <select
                    id="contact-team-size"
                    name="teamSize"
                    value={form.teamSize}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm focus:outline-none focus:border-white/25 transition-colors appearance-none"
                  >
                    <option value="" className="bg-[#0a0a0a]">Select a range…</option>
                    <option value="1-10" className="bg-[#0a0a0a]">1–10 people</option>
                    <option value="11-50" className="bg-[#0a0a0a]">11–50 people</option>
                    <option value="51-200" className="bg-[#0a0a0a]">51–200 people</option>
                    <option value="200+" className="bg-[#0a0a0a]">200+ people</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="contact-message" className="block text-sm text-white/50 mb-1.5">
                    <MessageSquare className="h-3.5 w-3.5 inline mr-1.5" />
                    Message <span className="text-white/30">*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    required
                    rows={4}
                    value={form.message}
                    onChange={handleChange}
                    placeholder="Tell us about your team, your current setup, and what you're looking for…"
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/25 text-sm focus:outline-none focus:border-white/25 transition-colors resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-white text-black hover:bg-white/90 font-semibold gap-2"
                  variant="ghost"
                >
                  Send message
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <p className="text-white/25 text-xs text-center">
                  By submitting, you agree to our{" "}
                  <a href="/privacy-policy" className="underline hover:text-white/50 transition-colors">
                    Privacy Policy
                  </a>
                  .
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
