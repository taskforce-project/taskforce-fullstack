"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

const STORAGE_KEY = "tf-cookie-consent"

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
  }, [])

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, "accepted")
    setVisible(false)
  }

  const decline = () => {
    localStorage.setItem(STORAGE_KEY, "declined")
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl mx-auto px-4">
      <div className="bg-card border border-border rounded-xl shadow-lg p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <p className="text-sm text-muted-foreground flex-1 leading-relaxed">
          We use strictly necessary cookies and local storage to keep you authenticated.
          No tracking or advertising data is collected.{" "}
          <Link href="/privacy-policy" className="underline underline-offset-2 text-foreground hover:text-primary transition-colors">
            Privacy policy
          </Link>
          .
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={decline}>
            Decline
          </Button>
          <Button size="sm" onClick={accept}>
            Accept
          </Button>
          <button
            onClick={decline}
            className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
