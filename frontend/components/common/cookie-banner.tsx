"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"

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

  if (!visible) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <Card className="w-[350px] shadow-lg rounded-2xl border bg-background text-foreground">
        <CardContent className="p-5">
          <div className="flex flex-col space-y-3">
            <div className="flex items-center space-x-2">
              <span className="text-lg">🍪</span>
              <h2 className="font-semibold">Cookie Notice</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              We use strictly necessary cookies to keep you authenticated. No tracking or advertising data is collected.
            </p>
            <div className="flex justify-between items-center pt-2">
              <Link
                href="/privacy-policy"
                className="text-sm underline hover:text-primary transition-colors"
              >
                Manage your preferences
              </Link>
              <Button size="sm" onClick={accept}>Accept</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
