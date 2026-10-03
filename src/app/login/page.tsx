"use client";

import { useEffect, useState } from "react";
import { AuthCard } from "@/components/AuthCard";

export default function LoginPage() {
  const [signupOpen, setSignupOpen] = useState(false);
  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((s: { hasUsers: boolean; signupOpen: boolean; user: unknown }) => {
        if (s.user) window.location.href = "/overview";
        else if (!s.hasUsers) window.location.href = "/register";
        setSignupOpen(s.signupOpen);
      });
  }, []);

  return (
    <AuthCard
      title="Belépés"
      sub="Lépj be, és folytasd ott, ahol abbahagytad."
      fields={[
        { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
        { name: "password", label: "Jelszó", type: "password", autoComplete: "current-password" },
      ]}
      submit="Belépés"
      endpoint="/api/auth/login"
      onDone={() => {
        const next = new URLSearchParams(window.location.search).get("next");
        // only same-site paths ("//evil.com" would leave the site)
        window.location.href = next && /^\/(?![\/\\])/.test(next) ? next : "/overview";
      }}
      footer={signupOpen ? { text: "Még nincs fiókod?", href: "/register", link: "Regisztráció" } : undefined}
    />
  );
}
