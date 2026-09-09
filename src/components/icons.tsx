/**
 * Inline icon set.
 *
 * A handful of glyphs is not worth an icon package: these ship as part of the
 * component bundle, inherit `currentColor`, and stay crisp at remote-control
 * sizes.
 */

type IconProps = React.SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const PlayIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" stroke="none" />
  </Icon>
)

export const PauseIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="6.5" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="13.5" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
  </Icon>
)

export const HomeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9.5v10h13v-10" />
    <path d="M9.5 19.5v-6h5v6" />
  </Icon>
)

export const LiveIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="5" width="19" height="13" rx="2.5" />
    <path d="M8 21h8" />
    <path d="M9.5 9.5v4l3.5-2-3.5-2Z" fill="currentColor" stroke="none" />
  </Icon>
)

export const FilmIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
    <path d="M7.5 4v16M16.5 4v16M2.5 12h19M2.5 8h5M2.5 16h5M16.5 8h5M16.5 16h5" />
  </Icon>
)

export const SeriesIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="7" width="19" height="13" rx="2.5" />
    <path d="m7.5 3.5 3.5 3.5M16.5 3.5 13 7" />
  </Icon>
)

export const GuideIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
    <path d="M8.5 4.5v15M2.5 9.5h19M2.5 14.5h19" />
  </Icon>
)

export const StarIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9L12 3.6Z" />
  </Icon>
)

export const StarFilledIcon = (props: IconProps) => (
  <Icon {...props}>
    <path
      d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9L12 3.6Z"
      fill="currentColor"
    />
  </Icon>
)

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
)

export const UserIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="8.5" r="3.75" />
    <path d="M4.5 20c1.3-3.8 4.1-5.8 7.5-5.8s6.2 2 7.5 5.8" />
  </Icon>
)

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m14.5 5-7 7 7 7" />
  </Icon>
)

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9.5 5 7 7-7 7" />
  </Icon>
)

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m5 9.5 7 7 7-7" />
  </Icon>
)

export const VolumeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4v-5Z" fill="currentColor" stroke="none" />
    <path d="M15.5 9a4 4 0 0 1 0 6" />
    <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Icon>
)

export const MuteIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4v-5Z" fill="currentColor" stroke="none" />
    <path d="m16 9.5 5 5M21 9.5l-5 5" />
  </Icon>
)

export const FullscreenIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icon>
)

export const ExitFullscreenIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </Icon>
)

export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3" />
  </Icon>
)

export const LogoutIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14.5 4.5h-8v15h8" />
    <path d="M11 12h9.5M17.5 8.5 21 12l-3.5 3.5" />
  </Icon>
)

export const RefreshIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20.5 4v4.5H16" />
  </Icon>
)

export const AlertIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v5M12 16.2v.3" />
  </Icon>
)

export const TrashIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5 7.5 20h9l1-13.5" />
  </Icon>
)

export const SkipIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 5.5v13l9-6.5-9-6.5Z" fill="currentColor" stroke="none" />
    <path d="M18 5.5v13" />
  </Icon>
)

export const LogoIcon = (props: IconProps) => (
  <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" {...props}>
    <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="4" />
    <path d="M20 16.5 32 24l-12 7.5v-15Z" fill="currentColor" />
  </svg>
)
