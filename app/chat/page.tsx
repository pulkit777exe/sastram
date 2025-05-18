"use client";

import { SignOutButton, useAuth, useUser } from "@clerk/nextjs";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { User } from "stream-chat";
import { LoadingIndicator } from "stream-chat-react";
import MyChat from "../_components/MyChat";
import { useContextProvider } from "@/context/Context";

type ChatState = {
  apiKey: string;
  user: User;
  token: string;
};

export default function ChatPage() {
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const { isSignedIn, isLoaded } = useAuth();
  const [chatState, setChatState] = useState<ChatState | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const { setIsLoading, setError: setContextError, setChatUser } = useContextProvider();

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  // Register user with Stream Chat
  const registerUser = useCallback(async () => {
    if (!clerkUser?.id || !clerkUser?.primaryEmailAddress?.emailAddress) {
      return null;
    }

    try {
      setIsLoading(true);
      const response = await axios.post("/api/register-user", {
        userId: clerkUser.id,
        email: clerkUser.primaryEmailAddress.emailAddress,
      });
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to register user";
      console.error("Error registering user:", error);
      setError(errorMessage);
      setContextError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [clerkUser, setIsLoading, setContextError]);

  // Get user token for Stream Chat
  const getUserToken = useCallback(async (userId: string, userName: string) => {
    try {
      setIsLoading(true);
      const response = await axios.post("/api/token", { userId });
      const token = response.data.token;

      if (!token) {
        throw new Error("No token received from server");
      }

      const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
      if (!apiKey) {
        throw new Error("Missing Stream API key in environment variables");
      }

      const user: User = {
        id: userId,
        name: userName,
        image: `https://getstream.io/random_png/?id=${userId}&name=${userName}`,
      };

      setChatUser(user);
      setChatState({ apiKey, user, token });
      setError(null);
      setContextError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to get user token";
      console.error("Error getting token:", error);
      setError(errorMessage);
      setContextError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, setContextError, setChatUser]);

  // Initialize chat when user is authenticated
  useEffect(() => {
    if (!isLoaded || !isSignedIn || chatState) return;

    const init = async () => {
      const userId = clerkUser?.id;
      const email = clerkUser?.primaryEmailAddress?.emailAddress;
      const isRegistered = Boolean(clerkUser?.publicMetadata?.streamRegistered);

      if (!userId || !email) return;

      try {
        if (!isRegistered) {
          await registerUser();
        }
        await getUserToken(userId, email);
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    init();
  }, [isLoaded, isSignedIn, clerkUser, chatState, registerUser, getUserToken]);

  // Show loading state
  if (!isLoaded || !clerkUser) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <LoadingIndicator size={40} />
          <p className="text-gray-600">Loading chat...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && !chatState) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-50 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md max-w-md w-full">
          <div className="text-red-500 text-xl font-semibold mb-4">
            Error: {error}
          </div>
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Retry
            </button>
            <SignOutButton>
              <button className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                Sign Out
              </button>
            </SignOutButton>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while waiting for chatState
  if (!chatState) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <LoadingIndicator size={40} />
          <p className="text-gray-600">Initializing chat...</p>
        </div>
      </div>
    );
  }

  // Render chat when everything is ready
  return (
    <div className="h-screen w-screen">
      <MyChat {...chatState} />
    </div>
  );
} 