import { useClient } from "@/hooks/useClient";
import { useContextProvider } from "@/context/Context";
import { User, Event } from "stream-chat";
import {
  Channel,
  ChannelList,
  Chat,
  MessageInput,
  MessageList,
  Window,
  ChannelHeader,
  Thread,
  LoadingIndicator
} from "stream-chat-react";
import { useEffect, useState } from "react";
import { SignOutButton } from "@clerk/nextjs";

export default function MyChat({
  apiKey,
  user,
  token,
}: {
  apiKey: string;
  user: User;
  token: string;
}) {
  const { setIsLoading, isLoading, error } = useContextProvider();
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const chatClient = useClient({
    apiKey,
    user,
    tokenOrProvider: token,
  });

  useEffect(() => {
    // Set loading state based on client connection
    setIsLoading(!chatClient);

    // Handle connection events
    if (chatClient) {
      const handleConnectionError = (event: { error: Error }) => {
        console.error("Connection error:", event.error);
        setConnectionError(`Connection error: ${event.error.message}`);
      };

      chatClient.on('connection.error', handleConnectionError);

      return () => {
        chatClient.off('connection.error', handleConnectionError);
      };
    }
  }, [chatClient, setIsLoading]);

  // Show loading state
  if (isLoading || !chatClient) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingIndicator size={40} />
      </div>
    );
  }

  // Show error state
  if (error || connectionError) {
    return (
      <div className="flex flex-col justify-center items-center h-screen gap-4">
        <div className="text-red-500 text-xl">
          {error || connectionError || "An error occurred with the chat connection"}
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
        <SignOutButton>
          <button className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">
            Sign Out
          </button>
        </SignOutButton>
      </div>
    );
  }

  // Empty Channel Component
  const EmptyChannelComponent = () => (
    <div className="flex flex-col justify-center items-center h-full p-4">
      <h2 className="text-xl font-semibold mb-4">No channel selected</h2>
      <p className="text-gray-600 text-center">
        Select a channel from the sidebar or create a new one to start chatting.
      </p>
    </div>
  );

  return (
    <Chat client={chatClient} theme="str-chat__theme-light">
      <div className="flex h-screen w-screen">
        {/* Sidebar - Channel List */}
        <div className="w-[300px] border-r border-gray-300">
          <div className="p-3 border-b border-gray-300 flex justify-between items-center">
            <h2 className="font-semibold">Cortex Forum</h2>
            <SignOutButton>
              <button className="text-sm text-gray-600 hover:text-gray-900">
                Sign Out
              </button>
            </SignOutButton>
          </div>
          <ChannelList
            filters={{ members: { $in: [user.id!] } }}
            sort={{ last_message_at: -1 }}
            options={{ presence: true, state: true }}
          />
        </div>

        {/* Main Chat Area */}
        <div className="flex-1">
          <Channel EmptyStateIndicator={EmptyChannelComponent}>
            <Window>
              <ChannelHeader />
              <MessageList />
              <MessageInput />
            </Window>
            <Thread />
          </Channel>
        </div>
      </div>
    </Chat>
  );
}
