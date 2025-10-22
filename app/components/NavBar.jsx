"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export default function NavBar() {
  const { data: session, status } = useSession();

  return (
    <nav className="w-full border-b border-gray-200 bg-white/90 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto px-6 py-3 flex items-center justify-between">
        <Link
          href="/"
          className="text-xl cursor-pointer font-semibold tracking-tight text-gray-900 hover:text-gray-700 transition-colors"
        >
          Live Meeting
        </Link>

        <div className="flex items-center gap-3">
          {status === "loading" ? null : session?.user ? (
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 shadow-sm hover:shadow-md transition-all">
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="w-9 h-9 rounded-full border border-gray-200 object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 font-semibold border border-gray-300">
                  {(session?.user?.name || "U").charAt(0).toUpperCase()}
                </div>
              )}

              <span className="hidden sm:block text-sm font-medium text-gray-800 truncate max-w-[150px]">
                {session?.user?.name || session?.user?.email}
              </span>

              <button
                onClick={async () => {
                  await signOut({ redirect: false });
                  const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
                  const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
                  const returnTo = process.env.NEXT_PUBLIC_APP_BASE_URL;
                  const logoutUrl = `https://${domain}/v2/logout?client_id=${clientId}&returnTo=${encodeURIComponent(
                    returnTo
                  )}`;
                  window.location.href = logoutUrl;
                }}
                className="p-2 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-center"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn()}
              className="px-4 py-2.5 cursor-pointer rounded-full bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
