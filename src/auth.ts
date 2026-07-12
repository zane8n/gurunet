import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { getRuntimeEnv, requireRuntimeEnv } from "@/lib/runtime-env";

const providers = [];

if (getRuntimeEnv("AUTH_GOOGLE_ID") && getRuntimeEnv("AUTH_GOOGLE_SECRET")) {
  providers.push(
    Google({
      clientId: requireRuntimeEnv("AUTH_GOOGLE_ID"),
      clientSecret: requireRuntimeEnv("AUTH_GOOGLE_SECRET"),
    }),
  );
}
if (getRuntimeEnv("AUTH_APPLE_ID") && getRuntimeEnv("AUTH_APPLE_SECRET")) {
  providers.push(
    Apple({
      clientId: requireRuntimeEnv("AUTH_APPLE_ID"),
      clientSecret: requireRuntimeEnv("AUTH_APPLE_SECRET"),
    }),
  );
}
if (getRuntimeEnv("AUTH_GITHUB_ID") && getRuntimeEnv("AUTH_GITHUB_SECRET")) {
  providers.push(
    GitHub({
      clientId: requireRuntimeEnv("AUTH_GITHUB_ID"),
      clientSecret: requireRuntimeEnv("AUTH_GITHUB_SECRET"),
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: requireRuntimeEnv("AUTH_SECRET"),
  trustHost: true,
  session: {
    strategy: "database",
  },
  providers,
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
