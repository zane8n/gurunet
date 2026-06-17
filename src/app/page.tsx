import { GurunetApp } from "@/components/gurunet-app";
import { siteConfig } from "@/lib/site";

export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteConfig.url}/#organization`,
        name: siteConfig.name,
        url: siteConfig.url,
        logo: `${siteConfig.url}/gurunet.png?v=4`,
        founder: {
          "@type": "Person",
          name: siteConfig.creator,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${siteConfig.url}/#website`,
        name: siteConfig.name,
        url: siteConfig.url,
        description: siteConfig.description,
        publisher: {
          "@id": `${siteConfig.url}/#organization`,
        },
        inLanguage: "en-GB",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteConfig.url}/#software`,
        name: siteConfig.name,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        url: siteConfig.url,
        description: siteConfig.description,
        creator: {
          "@id": `${siteConfig.url}/#organization`,
        },
        featureList: [
          "Daily technical challenges",
          "Evidence-based grading",
          "Progress metrics",
          "Engineering notebook",
          "Study profile configuration",
          "Examiner chat",
          "Cohort and leaderboard tools",
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <GurunetApp />
    </>
  );
}
