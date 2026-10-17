import type { Metadata } from "next";

export const siteUrl = "https://www.milvector.org";
export const siteName = "MilVector AI";

export const shareImage = {
  url: "/assets/milvector-ai-logo.png",
  width: 1024,
  height: 1024,
  alt: "MilVector AI logo",
};

// Public, indexable pages. Everything under /app is the signed-in product.
export const publicRoutes = ["/", "/platform", "/knowledge-base", "/library", "/donate", "/feedback", "/privacy"];

export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | ${siteName}`,
      description,
      url: path,
      siteName,
      type: "website",
      locale: "en_US",
      images: [shareImage],
    },
  };
}
