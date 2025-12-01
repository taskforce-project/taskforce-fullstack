// Components
"use client";

import { Authentication } from "./Authentication";
import { Footer } from "../landing/Footer";

export default function AuthenticationPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="flex flex-col">
        <Authentication onLogin={() => {}} />
      </main>
      <Footer />
    </div>
  );
}
