import type { AnchorHTMLAttributes, ReactNode } from "react";
import { gehe } from "./navigation";

/** Ersatz für next/link in der Demo: interne Ziele werden zu Hash-Links. */
export default function Link({ href, children, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  const intern = href.startsWith("/");
  return (
    <a
      {...rest}
      href={intern ? `#${href}` : href}
      onClick={(e) => {
        onClick?.(e);
        if (!intern || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        gehe(href);
      }}
    >
      {children}
    </a>
  );
}
