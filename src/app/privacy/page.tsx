import type { Metadata } from "next";

export const metadata: Metadata = { title: "Adatkezelés – OCP" };
export const dynamic = "force-dynamic";

// Public privacy notice + data deletion instructions (required by Meta App Review and GDPR).
// The operator fills in the bracketed company details before going public.

export default function PrivacyPage() {
  const operator = process.env.OCP_OPERATOR_NAME ?? "[Üzemeltető cég neve, székhelye, adószáma]";
  const contact = process.env.OCP_OPERATOR_EMAIL ?? "[kapcsolattartási e-mail]";
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-[15px] leading-relaxed">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Adatkezelési tájékoztató</h1>
      <p className="mb-8 text-sm text-muted">OCP – AI hirdetéskezelő</p>

      <Section title="Ki kezeli az adatokat?">
        <p>
          Adatkezelő az OCP-t használó vállalkozás (a felhasználó). Az OCP üzemeltetője – {operator} – adatfeldolgozóként, a felhasználó megbízásából
          tárolja és dolgozza fel az adatokat. Kapcsolat: {contact}.
        </p>
      </Section>
      <Section title="Milyen adatokat kezelünk?">
        <ul className="list-disc space-y-1 pl-5">
          <li>Felhasználói fiók: név, e-mail cím, jelszó (csak titkosított lenyomatként).</li>
          <li>Meta-kapcsolat: hozzáférési token, a felhasználó által kezelt hirdetési fiókok, oldalak, hirdetések és azok statisztikái.</li>
          <li>
            Leadek: a hirdetések űrlapjain megadott adatok (pl. név, telefonszám, e-mail, település, válaszok) – kizárólag akkor, ha a felhasználó ezt
            kifejezetten engedélyezte.
          </li>
          <li>Feltöltött képek, videók, cégprofil és a beszélgetések az asszisztenssel.</li>
        </ul>
      </Section>
      <Section title="Mire használjuk?">
        <p>
          Kizárólag arra, hogy a felhasználó hirdetéseit kezelje, elemezze és javaslatokat adjon, valamint hogy a leadekről értesítse. Adatot nem adunk
          el, nem használunk saját célra, és más felhasználó nem láthatja: minden fiók adatai elkülönítve tárolódnak.
        </p>
      </Section>
      <Section title="Kik kapnak adatot (alfeldolgozók)?">
        <ul className="list-disc space-y-1 pl-5">
          <li>Meta Platforms (a hirdetések kezelése a Meta API-n keresztül).</li>
          <li>Anthropic (az AI asszisztens – a beszélgetés tartalma és a szükséges adatok).</li>
          <li>Tárhelyszolgáltató, valamint opcionálisan e-mail küldő (Resend) és képgeneráló (OpenAI) szolgáltatás.</li>
        </ul>
      </Section>
      <Section title="Meddig tároljuk?">
        <p>
          A fiók fennállásáig. A leadeket a felhasználó bármikor törölheti; a fiók törlésével minden adat véglegesen törlődik 30 napon belül (a mentésekből
          is).
        </p>
      </Section>
      <Section id="torles" title="Adatok törlése">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Az OCP-ben: Beállítások → „Fiók és adatok törlése” – azonnal törli a fiókot és minden adatát.</li>
          <li>A Facebookon: Beállítások → Biztonság és bejelentkezés → Üzleti integrációk → OCP → Eltávolítás. Ezzel az OCP hozzáférése azonnal megszűnik.</li>
          <li>E-mailben: írj a {contact} címre, és 30 napon belül törlünk mindent.</li>
        </ol>
      </Section>
      <Section title="Jogaid">
        <p>
          Hozzáférés, helyesbítés, törlés, korlátozás, adathordozhatóság és tiltakozás – a fenti elérhetőségen. Panasz esetén a Nemzeti Adatvédelmi és
          Információszabadság Hatósághoz (NAIH, naih.hu) fordulhatsz.
        </p>
      </Section>
    </main>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-7">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
