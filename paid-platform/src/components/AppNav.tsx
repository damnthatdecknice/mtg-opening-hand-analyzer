import Link from "next/link";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/decks", label: "Save a Deck" },
  { href: "/login", label: "Sign In" }
];

export function AppNav() {
  return (
    <nav className="app-nav" aria-label="Primary navigation">
      <Link className="app-nav-brand" href="/">
        MTG Hand Pro
      </Link>
      <div className="app-nav-links">
        {navItems.map((item) => (
          <Link className="secondary-button app-nav-link" href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
