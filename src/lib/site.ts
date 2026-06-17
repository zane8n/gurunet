export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://gurunet.uk");

export const siteConfig = {
  name: "GURUnet",
  url: siteUrl.origin,
  title: "GURUnet | Daily Technical Challenge Platform",
  description:
    "GURUnet is a structured capacity-building platform for technical learners, with daily practical challenges, evidence-based grading, progress metrics, and an engineering notebook.",
  shortDescription:
    "Daily technical challenges, evidence-based grading, progress metrics, and an engineering notebook.",
  keywords: [
    "GURUnet",
    "technical challenge platform",
    "daily engineering challenges",
    "network engineering practice",
    "cybersecurity practice",
    "Linux practice",
    "DevOps training",
    "technical capacity builder",
    "engineering notebook",
    "skills assessment platform",
  ],
  creator: "Kikandi",
};
