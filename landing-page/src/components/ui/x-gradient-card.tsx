
interface XGradientCardProps {
  href?: string;
  author: string;
  handle: string;
  avatarInitials: string;
  avatarAccent?: string;
  text: string;
  date?: string;
  likes?: number | string;
}

export function XGradientCard({
  href = "#",
  author,
  handle,
  avatarInitials,
  avatarAccent = "#60a5fa",
  text,
  date,
  likes,
}: XGradientCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-2xl bg-[#0a0a0a] border border-white/[0.07] hover:border-white/[0.14] p-5 transition-all duration-300 relative overflow-hidden"
    >
      {/* X gradient */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-[radial-gradient(ellipse_at_0%_0%,rgba(255,255,255,0.04),transparent_60%)]" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: `${avatarAccent}15`, border: `1px solid ${avatarAccent}25`, color: avatarAccent }}
            >
              {avatarInitials}
            </div>
            <div>
              <p className="text-white/70 text-xs font-semibold leading-tight">{author}</p>
              <p className="text-white/25 text-[10px]">{handle}</p>
            </div>
          </div>
          {/* X / Twitter icon */}
          <div className="text-white/20 group-hover:text-white/40 transition-colors shrink-0">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>
        </div>

        {/* Tweet text */}
        <p className="text-white/55 text-sm leading-relaxed mb-3">{text}</p>

        {/* Footer */}
        {(date || likes) && (
          <div className="flex items-center gap-3 text-white/20 text-[10px]">
            {date && <span>{date}</span>}
            {likes && (
              <span className="flex items-center gap-1">
                <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current">
                  <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z" />
                </svg>
                {likes}
              </span>
            )}
          </div>
        )}
      </div>
    </a>
  );
}

export default XGradientCard;
