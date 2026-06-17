import type { Metadata } from "next";
import { AdminBackend } from "@/components/admin-backend";

export const metadata: Metadata = {
  title: "GURUnet Backend",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return <AdminBackend />;
}
