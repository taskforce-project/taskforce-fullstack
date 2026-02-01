/**
 * Exemple de page protégée
 * Démontre l'utilisation du hook useRequireAuth
 */

"use client";

import { useRequireAuth } from "@/lib/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function ProtectedPageExample() {
  const { isAuthenticated, isLoading } = useRequireAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // L'utilisateur sera redirigé automatiquement
    return null;
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Page Protégée</CardTitle>
          <CardDescription>
            Cette page nécessite une authentification
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Vous êtes authentifié et pouvez accéder à cette page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
