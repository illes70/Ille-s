"use client";

import { useEffect, useState } from "react";
import { AuthCard } from "@/components/AuthCard";

export default function RegisterPage() {
  const [invite, setInvite] = useState<string>();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite") ?? undefined;
    setInvite(token);
    fetch(`/api/auth/status${token ? `?invite=${encodeURIComponent(token)}` : ""}`)
      .then((r) => r.json())
      .then((s: { signupOpen: boolean; user: unknown }) => {
        if (s.user) window.location.href = "/overview";
        setOpen(s.signupOpen);
      });
  }, []);

  return (
    <AuthCard
      title="Fiók létrehozása"
      sub="Utána egy gombnyomással csatlakoztatod a Facebook-fiókodat, és minden hirdetési fiókod élőben megjelenik. A fiókodat csak te látod."
      fields={[
        { name: "name", label: "Neved", autoComplete: "name" },
        { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
        { name: "password", label: "Jelszó (legalább 8 karakter)", type: "password", autoComplete: "new-password" },
      ]}
      submit="Regisztráció"
      endpoint="/api/auth/register"
      extra={invite ? { invite } : undefined}
      blocked={open ? undefined : "A regisztrációhoz meghívó link kell. Kérj egyet attól, akitől az OCP-t kaptad."}
      onDone={() => (window.location.href = "/overview?welcome=1")}
      footer={{ text: "Van már fiókod?", href: "/login", link: "Belépés" }}
    />
  );
}
