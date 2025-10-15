"use client";

import { signIn } from "next-auth/react";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white p-6 rounded-xl shadow">
        <h1 className="text-xl font-semibold mb-4">Sign in</h1>
        <p className="text-sm text-gray-600 mb-6">Use your account to create meetings, or continue as guest to join.</p>
        <div className="space-y-3">
          <button
            onClick={() => signIn("auth0", { callbackUrl: "/" })}
            className="w-full py-2.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 cursor-pointer transition-colors"
          >
            Continue to Login
          </button>
        </div>
      </div>
    </div>
  );
}
