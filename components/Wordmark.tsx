// The logo mark plus wordmark.
//
// Inlined rather than an <img> so it inherits currentColor where needed and
// costs no extra request on first paint.
export default function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="wm-red" x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="#FF3A36" />
            <stop offset="50%" stopColor="#F01219" />
            <stop offset="100%" stopColor="#B80C12" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="url(#wm-red)" strokeWidth="46">
          <path d="M482 150 H250 C166 150 112 196 86 258" />
          <path d="M30 362 H262 C346 362 400 316 426 254" />
        </g>
        <path
          fill="none"
          stroke="url(#wm-red)"
          strokeWidth="30"
          strokeLinejoin="round"
          d="M256 182 C332 182 398 214 440 256 C398 298 332 330 256 330 C180 330 114 298 72 256 C114 214 180 182 256 182 Z"
        />
        <g fill="url(#wm-red)">
          <rect x="198" y="250" width="116" height="12" rx="6" />
          <rect x="214" y="228" width="12" height="56" rx="6" />
          <rect x="244" y="222" width="12" height="68" rx="6" />
          <rect x="274" y="228" width="12" height="56" rx="6" />
        </g>
      </svg>
      <span className="display text-[19px] leading-none">
        Sunday<span className="text-brand">Showdown</span>
      </span>
    </span>
  );
}
