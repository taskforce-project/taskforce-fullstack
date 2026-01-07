import { Providers } from "@/components/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Container from "@/components/layout/Container";

export default function DocsPage() {
  return (
    <Providers>
      <Header />
      
      <main className="py-20">
        <Container>
          <div className="max-w-4xl mx-auto prose prose-lg dark:prose-invert">
            <h1>Documentation</h1>
            <p className="text-muted-foreground">Everything you need to know about TaskForce</p>

            <h2>Getting Started</h2>
            <p>
              Welcome to TaskForce! This guide will help you get up and running with our powerful
              task management platform.
            </p>

            <h3>Quick Start</h3>
            <ol>
              <li>Create your account or sign in</li>
              <li>Create your first project</li>
              <li>Add team members (optional)</li>
              <li>Start creating tasks</li>
              <li>Track your progress</li>
            </ol>

            <h2>Core Features</h2>
            
            <h3>Task Management</h3>
            <p>
              Create, organize, and track tasks with ease. Assign tasks to team members, set
              deadlines, and monitor progress in real-time.
            </p>

            <h3>Team Collaboration</h3>
            <p>
              Invite team members, share projects, and collaborate seamlessly. Real-time updates
              keep everyone in sync.
            </p>

            <h3>Customizable Themes</h3>
            <p>
              Choose from multiple beautiful themes to personalize your workspace. Dark mode and
              light mode available.
            </p>

            <h2>API Documentation</h2>
            <p>
              For developers integrating with TaskForce, check out our{" "}
              <a href="/api-docs">API documentation</a>.
            </p>

            <h2>Support</h2>
            <p>
              Need help? Contact our support team at{" "}
              <a href="mailto:support@taskforce.app">support@taskforce.app</a>
            </p>
          </div>
        </Container>
      </main>

      <Footer />
    </Providers>
  );
}
