/**
 * Page Dashboard principale
 * Accessible uniquement aux utilisateurs authentifiés
 */

"use client";

import { useAuth } from "@/lib/contexts/auth-context";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-semibold text-gray-900 mb-4">Dashboard</h1>
        {user && (
          <p className="text-lg text-gray-600">
            Bienvenue, {user.firstName} {user.lastName} !
          </p>
        )}
      </div>
    </div>
  );
}
