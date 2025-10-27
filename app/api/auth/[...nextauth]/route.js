import NextAuth from "next-auth";
import Auth0Provider from "next-auth/providers/auth0";

export const authOptions = {
  providers: [
    Auth0Provider({
      clientId: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID || "",
      clientSecret: process.env.AUTH0_CLIENT_SECRET || "",
      issuer: process.env.NEXT_PUBLIC_AUTH0_DOMAIN ? `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}` : (process.env.AUTH0_ISSUER || ""),
    }),
  ],
  secret: process.env.AUTH0_SECRET,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.provider = account.provider;
      }
      if (profile) {
        token.name = profile.name || token.name;
        token.email = profile.email || token.email;
        token.picture = profile.picture || token.picture;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = session.user || {};
      session.user.name = token.name || session.user.name;
      session.user.email = token.email || session.user.email;
      session.user.image = token.picture || session.user.image;
      session.provider = token.provider;
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  // Set base URL for redirects
  baseUrl: process.env.NEXT_PUBLIC_APP_BASE_URL || "https://localhost:3000",
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
