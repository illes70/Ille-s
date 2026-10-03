"use client";

import { AuthCard } from "@/components/AuthCard";

export default function RegisterPage() {
  return (
    <AuthCard
      title="Fiók létrehozása"
      sub="Utána egy gombnyomással csatlakoztatod a Facebook-fiókodat, és minden hirdetési fiókod élőben megjelenik."
      fields={[
        { name: "name", label: "Neved", autoComplete: "name" },
        { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
        { name: "password", label: "Jelszó (legalább 8 karakter)", type: "password", autoComplete: "new-password" },
      ]}
      submit="Regisztráció"
      endpoint="/api/auth/register"
      onDone={() => (window.location.href = "/overview?welcome=1")}
      footer={{ text: "Van már fiókod?", href: "/login", link: "Belépés" }}
    />
  );
}
