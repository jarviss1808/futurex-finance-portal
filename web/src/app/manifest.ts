import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Futurex Sales & Collections",
    short_name: "Futurex",
    description: "Create PIs, record client payments, get approvals and track outstanding balances.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7fb",
    theme_color: "#0d1848",
    icons: [
      { src: "/branding/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/branding/app-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/branding/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
