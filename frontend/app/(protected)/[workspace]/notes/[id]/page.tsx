"use client"

import { useParams } from "next/navigation"

import { NoteView } from "@/components/notes/note-view"

/** Une note de l'espace (R141, séance n°20) : `/{slug}/notes/{id}`, dans le volet, la conversation gardée. */
export default function NotePage() {
  const params = useParams()
  return <NoteView id={Number(params?.id)} />
}
