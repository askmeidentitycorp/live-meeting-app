"use client";

import { Suspense } from "react";
import NavBar from "./components/NavBar";
import HomeContent from "./components/HomeContent";

export default function Home() {  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100">
      <NavBar />
      <Suspense fallback={
        <div className="flex items-center h-[70vh] justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      }>
        <HomeContent />
      </Suspense>
    </div>
  );
}
