import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.title,
    short_name: siteConfig.name,
    description: siteConfig.shortDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    categories: ["education", "productivity", "developer"],
    icons: [
      {
        src: "/favicon-16x16.png?v=4",
        sizes: "16x16",
        type: "image/png",
      },
      {
        src: "/favicon-32x32.png?v=4",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/gurunet.png?v=4",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
