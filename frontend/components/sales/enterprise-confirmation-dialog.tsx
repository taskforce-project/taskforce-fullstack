"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

interface EnterpriseConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
  onDecline: () => void;
}

export function EnterpriseConfirmationDialog({
  open,
  onClose,
  onAccept,
  onDecline,
}: EnterpriseConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <DialogTitle>Demande envoyée !</DialogTitle>
              <DialogDescription>
                Notre équipe vous contactera sous 48h
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <p className="text-sm text-gray-600">
            Nous vous proposons de créer un compte gratuit pour tester l&apos;outil
            en attendant la validation de votre projet.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">
              Compte gratuit (FREE)
            </h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>✓ Jusqu&apos;à 5 utilisateurs</li>
              <li>✓ Projets et tâches illimités</li>
              <li>✓ Dashboard basique</li>
              <li>✓ Pas de carte bancaire requise</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <Button onClick={onAccept} size="lg" className="w-full">
              Créer un compte gratuit
            </Button>
            <Button
              onClick={onDecline}
              variant="outline"
              size="lg"
              className="w-full"
            >
              Non merci, revenir à l&apos;accueil
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
