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
  "Up to 5 users",
  "Unlimited projects and tasks",
  "Basic dashboard",
  "No credit card required",
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
          <h2 className="text-lg font-semibold tracking-tight">Request sent!</h2>
          <p className="mt-1 text-sm text-emerald-100/80">
            Our team will contact you within 48 hours
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <p className="text-center text-sm text-muted-foreground">
            In the meantime, create a free account to explore the platform.
          </p>

          {/* Plan card */}
          <div className="rounded-xl border border-border bg-secondary p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Free account</span>
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
              Create a free account
            </Button>
            <Button
              onClick={onDecline}
              variant="ghost"
              size="lg"
              className="w-full text-muted-foreground hover:text-foreground"
            >
              No thanks, back to home
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
