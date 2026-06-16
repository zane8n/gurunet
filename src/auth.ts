import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { getRuntimeEnv, requireRuntimeEnv } from "@/lib/runtime-env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: requireRuntimeEnv("AUTH_SECRET"),
  trustHost: true,
  session: {
    strategy: "database",
  },
  providers: [
    Google({
      clientId: requireRuntimeEnv("AUTH_GOOGLE_ID"),
      clientSecret: requireRuntimeEnv("AUTH_GOOGLE_SECRET"),
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        const sessionUser = session.user as typeof session.user & { id: string };
        sessionUser.id = user.id;
      }
      return session;
    },
    redirect({ url, baseUrl }) {
      const configuredUrl = getRuntimeEnv("AUTH_URL") ?? baseUrl;
      if (url.startsWith("/")) return `${configuredUrl}${url}`;
      if (new URL(url).origin === configuredUrl) return url;
      return configuredUrl;
    },
  },
});
