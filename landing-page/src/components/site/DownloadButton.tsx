import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import { LINKS } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Bouton « Download » qui reconnaît le système du visiteur (îlot). Rendu serveur et visiteur inconnu : lien vers
 * /download. Windows : la page de TaskForce sur le Microsoft Store, dont la version est signée par Microsoft (ni
 * SmartScreen ni Smart App Control ne la bloquent). Autre système reconnu ET fichier publié pour lui : téléchargement
 * direct du bon fichier.
 */

export type DownloadUrls = {
  macArm: string | null;
  macIntel: string | null;
  windows: string | null;
  linux: string | null;
};

type Os = "mac" | "windows" | "linux";
const OS_LABEL: Record<Os, string> = { mac: "macOS", windows: "Windows", linux: "Linux" };

/** Logo Windows à la couleur du bouton (même tracé que public/logos/windows.svg). */
function WindowsLogo() {
  return (
    <svg viewBox="0 0 88 88" className="size-[16px]" fill="currentColor" aria-hidden="true">
      <path d="m0 12.402 35.687-4.86.016 34.423-35.67.203zm35.67 33.529.028 34.453L.028 75.48.026 45.7zm4.326-39.025L87.314 0v41.527l-47.318.376zm47.329 39.349-.011 41.34-47.318-6.678-.066-34.739z" />
    </svg>
  );
}

function labelFor(os: Os | null, href: string): string {
  if (href === LINKS.microsoftStore) return "Get it from Microsoft Store";
  return os && href !== "/download" ? `Download for ${OS_LABEL[os]}` : "Download TaskForce";
}

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
    } else if (detected === "windows") {
      setHref(LINKS.microsoftStore);
    } else if (detected) {
      const url = urls[detected];
      if (url) setHref(url);
    }
  }, [urls]);

  const store = href === LINKS.microsoftStore;

  return (
    <a
      href={href}
      className={cn("btn btn-primary", size === "lg" ? "btn-lg" : "", className)}
      {...(store ? { target: "_blank", rel: "noopener" } : {})}
    >
      {store ? <WindowsLogo /> : <Download className="size-[18px]" strokeWidth={2} aria-hidden />}
      {labelFor(os, href)}
    </a>
  );
}
