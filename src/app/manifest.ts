import type { MetadataRoute } from "next";

// Installable app ("Add to Home Screen"): needed for push notifications on iPhone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OCP",
    short_name: "OCP",
    description: "AI hirdetéskezelő – a Meta fiókjaid élőben.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    lang: "hu",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
