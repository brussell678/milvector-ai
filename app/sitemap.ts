import type { MetadataRoute } from "next";
import { publicRoutes, siteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((route) => ({
    url: `${siteUrl}${route === "/" ? "" : route}`,
    lastModified: new Date(),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
