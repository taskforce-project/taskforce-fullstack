import { Hero115 } from "@/components/hero115";

export function Hero() {
  return (
    <Hero115
      className="bg-background pt-16"
      heading={
        <>
          Describe the outcome.
          <br />
          <span className="bg-linear-to-r from-orange-500 via-red-500 to-violet-600 bg-clip-text text-transparent">
            TaskForce orchestrates the execution.
          </span>
        </>
      }
      description="From planning and assignments to AI agents, meetings, reports and delivery."
      byline="AI-native project execution"
      buttons={{
        primary: {
          text: "Get started free",
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
