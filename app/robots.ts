import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The signed-in product, API, and routes that only redirect into it.
      disallow: ["/app/", "/api/", "/auth", "/login", "/dashboard", "/tools", "/welcome", "/message-board"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
