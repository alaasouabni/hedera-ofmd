import React from "react";
export function ThemeToggle() {
  const [dark, setDark] = React.useState(() =>
    document.documentElement.classList.contains("dark")
  );
  return (
    <button
      onClick={() => {
        const on = !dark;
        setDark(on);
        document.documentElement.classList.toggle("dark", on);
        localStorage.setItem("theme", on ? "dark" : "light");
      }}
      className="h-9 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 text-sm"
      title="Toggle theme"
    >
      {dark ? "🌙 Dark" : "☀️ Light"}
    </button>
  );
}
