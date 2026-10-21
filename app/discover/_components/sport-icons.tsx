import type { SVGProps } from "react";

/**
 * Sport icons for the Discover chips, drawn for this project in the Lucide style (24px grid,
 * 2px round strokes, current text colour) because Lucide has no tennis, badminton, basketball,
 * football or futsal icons. Volleyball and "All sports" use the Lucide icons directly.
 */
function SportSvg({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}

/** A tennis ball with its two curved seams. */
export function TennisIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SportSvg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M5 4.9c3.6 3.7 3.6 10.5 0 14.2M19 4.9c-3.6 3.7-3.6 10.5 0 14.2" />
    </SportSvg>
  );
}

/** A shuttlecock: feathered skirt above a rounded cork. */
export function BadmintonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SportSvg {...props}>
      <path d="M6 3h12l-3.5 10h-5z" />
      <path d="M10.5 3l.5 10M13.5 3l-.5 10" />
      <path d="M9.5 13v2.5a2.5 2.5 0 0 0 5 0V13" />
    </SportSvg>
  );
}

/** A ball with its seams. */
export function BasketballIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SportSvg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v20M2 12h20" />
      <path d="M5.6 4.4a10.5 10.5 0 0 1 0 15.2M18.4 4.4a10.5 10.5 0 0 0 0 15.2" />
    </SportSvg>
  );
}

/** A football: a centre panel joined to the edge. */
export function FootballIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SportSvg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m12 7.5 4.3 3.1-1.6 5h-5.4l-1.6-5z" />
      <path d="M12 7.5V2M16.3 10.6l5.2-1.7M14.7 15.6l3.2 4.4M9.3 15.6l-3.2 4.4M7.7 10.6 2.5 8.9" />
    </SportSvg>
  );
}

/** A smaller, quicker indoor ball with motion lines. */
export function FutsalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <SportSvg {...props}>
      <circle cx="15" cy="12" r="7" />
      <path d="m15 9 2.4 1.7-.9 2.8h-3l-.9-2.8z" />
      <path d="M2 8h4M2 12h3M2 16h4" />
    </SportSvg>
  );
}
