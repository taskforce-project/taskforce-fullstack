import { Hero115 } from "@/components/hero115";

export function Hero() {
  return (
    <Hero115
      className="bg-background pt-16"
      heading={
        <>
          Manage work at speed
          <br />
          <span className="bg-linear-to-r from-orange-500 via-red-500 to-violet-600 bg-clip-text text-transparent">
            from idea to delivery
          </span>
        </>
      }
      description="Taskforce unifies projects, docs, AI workflows, and analytics so your teams ship faster with less context switching."
      byline="In beta · 5,000+ teams"
      buttons={{
        primary: {
          text: "Try Taskforce Pro for 14 days",
          url: "http://localhost:3000/auth/register",
        },
        secondary: {
          text: "Talk to sales",
          url: "/contact",
        },
      }}
      image={{
        src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/modern/saas-hero/saas-hero-1-16x9.png",
        alt: "Taskforce workspace preview",
      }}
    />
  );
}
