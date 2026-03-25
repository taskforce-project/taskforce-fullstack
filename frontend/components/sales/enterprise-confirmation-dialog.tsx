"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, CheckCircle2 } from "lucide-react";

interface EnterpriseConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
  onDecline: () => void;
}

const FREE_FEATURES = [
  "Jusqu'à 5 utilisateurs",
  "Projets et tâches illimités",
  "Dashboard basique",
  "Pas de carte bancaire requise",
];

export function EnterpriseConfirmationDialog({
  open,
  onClose,
  onAccept,
  onDecline,
}: EnterpriseConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px] p-0 overflow-hidden gap-0">
        {/* Header gradient */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 px-6 pt-8 pb-7 text-center text-white">
          <div className="flex justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <CheckCircle2 className="h-7 w-7 text-white" strokeWidth={1.5} />
            </div>
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Demande envoyée !</h2>
          <p className="mt-1 text-sm text-emerald-100/80">
            Notre équipe vous contactera sous 48h
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <p className="text-center text-sm text-muted-foreground">
            En attendant, créez un compte gratuit pour découvrir la plateforme.
          </p>

          {/* Plan card */}
          <div className="rounded-xl border border-border bg-secondary p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Compte gratuit</span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-500">
                FREE
              </span>
            </div>
            <ul className="space-y-2">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                    <Check className="h-2.5 w-2.5 text-emerald-500" strokeWidth={3} />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={onAccept} size="lg" className="w-full">
              Créer un compte gratuit
            </Button>
            <Button
              onClick={onDecline}
              variant="ghost"
              size="lg"
              className="w-full text-muted-foreground hover:text-foreground"
            >
              Non merci, revenir à l&apos;accueil
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
