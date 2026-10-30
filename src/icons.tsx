export type IconName =
  | "arrow"
  | "key"
  | "settings"
  | "download"
  | "trash"
  | "close"
  | "volume"
  | "mute"
  | "pause"
  | "play"
  | "external"
  | "check"
  | "refresh"
  | "branch"
  | "code"
  | "grid"
  | "chevron"
  | "stop"
  | "copy";
const paths: Record<IconName, React.ReactNode> = {
  arrow: (
    <>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="m11 11 9 9m-5-5 3-3m0 6 3-3" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" />
      <circle cx="15" cy="17" r="3" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  volume: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m-5 0 5-6" />
    </>
  ),
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  play: <path d="m7 4 13 8-13 8z" />,
  external: (
    <>
      <path d="M14 4h6v6m0-6L10 14M10 4H4v16h16v-6" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  refresh: (
    <>
      <path d="M20 6v5h-5M4 18v-5h5M5 8a8 8 0 0 1 13-3l2 6M4 13l2 6a8 8 0 0 0 13-3" />
    </>
  ),
  branch: (
    <>
      <path d="M6 3v18M6 12h7a5 5 0 0 0 5-5V3m-4 4 4-4 4 4" />
    </>
  ),
  code: (
    <>
      <path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </>
  ),
  chevron: <path d="m8 4 8 8-8 8" />,
  stop: <rect x="5" y="5" width="14" height="14" rx="1" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V3H3v13h5" />
    </>
  ),
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
