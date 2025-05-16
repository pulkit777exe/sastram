"use client"
import { ClerkLoading, useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation";

export default function Home() {

  const router = useRouter();

  const {isSignedIn, isLoaded} = useAuth();

  if (!isLoaded) {
    return <div><ClerkLoading /></div>
  }

  if (!isSignedIn) {
    router.push('/sign-in');
  }

  return <div className="flex justify-center items-center h-screen w-screen">
    This is the home page!
  </div>
}