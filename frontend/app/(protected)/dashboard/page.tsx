/**
 * Page Dashboard principale
 * Accessible uniquement aux utilisateurs authentifiés
 */

"use client";

import { useAuth } from "@/lib/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function DashboardPage() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-semibold text-gray-900 mb-4">Dashboard</h1>
        {user && (
          <>
            <p className="text-lg text-gray-600 mb-6">
              Bienvenue, {user.firstName} {user.lastName} !
            </p>
            <Button onClick={handleLogout} variant="outline" className="gap-2">
              <LogOut className="h-4 w-4" />
              Se déconnecter
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
