"use client";

import { SessionProvider } from "next-auth/react";
import { NotificationProvider } from "./contexts/NotificationContext";
import { NotificationToast } from "./components/NotificationToast";

export default function Providers({ children }) {
  return (
    <SessionProvider>
      <NotificationProvider>
        {children}
        <NotificationToast />
      </NotificationProvider>
    </SessionProvider>
  );
}
