"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { apiClient, getErrorMessage } from "@/lib/api/client";
import { toast } from "sonner";

interface EnterpriseContactDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (email: string) => void;
  initialEmail?: string;
  initialFirstName?: string;
  initialLastName?: string;
}

interface EnterpriseInquiryRequest {
  fullName: string;
  email: string;
  teamSize: string;
  message?: string;
}

export function EnterpriseContactDialog({
  open,
  onClose,
  onSuccess,
  initialEmail = "",
  initialFirstName = "",
  initialLastName = "",
}: Readonly<EnterpriseContactDialogProps>) {
  // Préremplir le nom complet avec prénom + nom si disponibles
  const [fullName, setFullName] = useState(
    initialFirstName && initialLastName
      ? `${initialFirstName} ${initialLastName}`
      : "",
  );
  const [email, setEmail] = useState(initialEmail);
  const [teamSize, setTeamSize] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Mettre à jour les valeurs quand le dialog s'ouvre avec de nouvelles données
  useEffect(() => {
    if (open) {
      setFullName(
        initialFirstName && initialLastName
          ? `${initialFirstName} ${initialLastName}`
          : "",
      );
      setEmail(initialEmail);
      setTeamSize("");
      setMessage("");
      setErrors({});
    }
  }, [open, initialEmail, initialFirstName, initialLastName]);

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!fullName.trim()) {
      newErrors.fullName = "Le nom complet est obligatoire";
    }

    if (!email.trim()) {
      newErrors.email = "L'email est obligatoire";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Email invalide";
    }

    if (!teamSize) {
      newErrors.teamSize = "Veuillez sélectionner la taille de votre équipe";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: EnterpriseInquiryRequest = {
        fullName,
        email,
        teamSize,
        message: message.trim() || undefined,
      };

      const response = await apiClient.post<{
        success: boolean;
        message: string;
        data: any;
      }>("/api/sales/inquiry", payload);

      if (response.data.success) {
        // Fermer le dialog et afficher le dialog de confirmation
        onClose();
        onSuccess(email);

        // Reset aux valeurs initiales (pas vides)
        setFullName(
          initialFirstName && initialLastName
            ? `${initialFirstName} ${initialLastName}`
            : "",
        );
        setEmail(initialEmail);
        setTeamSize("");
        setMessage("");
        setErrors({});
      }
    } catch (error: any) {
      console.error("Erreur lors de l'envoi de la demande:", error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    // Reset aux valeurs initiales
    setFullName(
      initialFirstName && initialLastName
        ? `${initialFirstName} ${initialLastName}`
        : "",
    );
    setEmail(initialEmail);
    setTeamSize("");
    setMessage("");
    setErrors({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Intéressé par Enterprise ?</DialogTitle>
          <DialogDescription>
            Remplissez ce formulaire et notre équipe vous contactera sous 48h
            pour discuter de vos besoins.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Nom complet */}
          <div className="space-y-2">
            <Label htmlFor="fullName">
              Nom complet <span className="text-red-500">*</span>
            </Label>
            <Input
              id="fullName"
              type="text"
              placeholder="John Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isSubmitting}
              className={errors.fullName ? "border-red-500" : ""}
            />
            {errors.fullName && (
              <p className="text-sm text-red-500">{errors.fullName}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">
              Email professionnel <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="john.doe@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className={errors.email ? "border-red-500" : ""}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email}</p>
            )}
          </div>

          {/* Taille de l'équipe */}
          <div className="space-y-2">
            <Label htmlFor="teamSize">
              Taille de l&apos;équipe <span className="text-red-500">*</span>
            </Label>
            <Select
              value={teamSize}
              onValueChange={setTeamSize}
              disabled={isSubmitting}
            >
              <SelectTrigger
                id="teamSize"
                className={errors.teamSize ? "border-red-500" : ""}
              >
                <SelectValue placeholder="Sélectionnez..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1-10">1-10 personnes</SelectItem>
                <SelectItem value="11-50">11-50 personnes</SelectItem>
                <SelectItem value="51-200">51-200 personnes</SelectItem>
                <SelectItem value="200+">200+ personnes</SelectItem>
              </SelectContent>
            </Select>
            {errors.teamSize && (
              <p className="text-sm text-red-500">{errors.teamSize}</p>
            )}
          </div>

          {/* Message (optionnel) */}
          <div className="space-y-2">
            <Label htmlFor="message">Décrivez votre projet (optionnel)</Label>
            <Textarea
              id="message"
              placeholder="Parlez-nous de vos besoins..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSubmitting}
              rows={4}
              maxLength={2000}
            />
            <p className="text-xs text-gray-500">
              {message.length}/2000 caractères
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Envoi...
                </>
              ) : (
                "Envoyer la demande"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
