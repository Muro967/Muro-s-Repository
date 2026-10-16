import type { SVGProps } from "react";

const paths = {
  wardrobe: <><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M12 3v18M9.5 11v2M14.5 11v2" /></>,
  outfits: <path d="m8 3 4 2 4-2 4 4-4 3v11H8V10L4 7z" />,
  inspiration: <><path d="M9 18h6M10 21h4M8.5 15.5a6 6 0 1 1 7 0c-.8.6-1.5 1.2-1.5 2.5h-4c0-1.3-.7-1.9-1.5-2.5Z" /></>,
  profile: <><circle cx="12" cy="7" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
};

export type AppIconName = keyof typeof paths;

export function AppIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: AppIconName }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {paths[name]}
    </svg>
  );
}
