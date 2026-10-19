import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Bouton « Download » qui reconnaît le système du visiteur (îlot). Rendu serveur et visiteur inconnu : lien vers
 * /download. Système reconnu ET fichier publié pour lui : téléchargement direct du bon fichier.
 */

export type DownloadUrls = {
  macArm: string | null;
  macIntel: string | null;
  windows: string | null;
  linux: string | null;
};

type Os = "mac" | "windows" | "linux";
const OS_LABEL: Record<Os, string> = { mac: "macOS", windows: "Windows", linux: "Linux" };

interface UaData {
  platform?: string;
  mobile?: boolean;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
}

function detectOs(): Os | null {
  const nav = navigator as Navigator & { userAgentData?: UaData };
  const ua = navigator.userAgent;
  if (nav.userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(ua)) return null; // pas d'app pour mobile
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? "";
  if (/mac/i.test(platform) || /Macintosh/i.test(ua)) return "mac";
  if (/win/i.test(platform) || /Windows/i.test(ua)) return "windows";
  if (/linux/i.test(platform) || /X11|Linux/i.test(ua)) return "linux";
  return null;
}

/** Architecture d'un Mac quand le navigateur la donne (Chromium) ; Safari ne la donne pas : Apple silicon par défaut. */
async function isIntelMac(): Promise<boolean> {
  const nav = navigator as Navigator & { userAgentData?: UaData };
  try {
    const hints = await nav.userAgentData?.getHighEntropyValues?.(["architecture"]);
    return hints?.architecture === "x86";
  } catch {
    return false;
  }
}

export default function DownloadButton({
  urls,
  size = "lg",
  className,
}: Readonly<{ urls: DownloadUrls; size?: "md" | "lg"; className?: string }>) {
  const [os, setOs] = useState<Os | null>(null);
  const [href, setHref] = useState<string>("/download");

  useEffect(() => {
    const detected = detectOs();
    setOs(detected);
    if (detected === "mac") {
      void isIntelMac().then((intel) => {
        const url = intel ? urls.macIntel ?? urls.macArm : urls.macArm ?? urls.macIntel;
        if (url) setHref(url);
      });
    } else if (detected) {
      const url = urls[detected];
      if (url) setHref(url);
    }
  }, [urls]);

  const direct = href !== "/download";
  const label = os && direct ? `Download for ${OS_LABEL[os]}` : "Download TaskForce";

  return (
    <a href={href} className={cn("btn btn-primary", size === "lg" ? "btn-lg" : "", className)}>
      <Download className="size-[18px]" strokeWidth={2} aria-hidden />
      {label}
    </a>
  );
}
