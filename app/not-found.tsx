"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function NotFound() {
  const router = useRouter();
  return (
    <div className="h-screen w-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-8xl font-bold text-transparent bg-clip-text bg-indigo-500">
            404
          </h1>
          <div className="h-1 w-24 mx-auto bg-linear-to-r from-indigo-500/50 to-indigo-600/50 rounded-full" />
        </div>

        <div className="space-y-3">
          <h2 className="text-2xl font-bold tracking-tight">
            Page Not Found
          </h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Button
            asChild
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
          >
            <Link href="/dashboard">
              <Home className="w-4 h-4 mr-2" />
              Go to Dashboard
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>

        <div className="pt-8">
          <div className="flex items-center justify-center gap-2 text-zinc-600">
            <div className="h-px w-12 bg-zinc-800" />
            <span className="text-xs font-medium">Sastram</span>
            <div className="h-px w-12 bg-zinc-800" />

          </div>
          <div className="flex justify-center items-center pt-2">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}
