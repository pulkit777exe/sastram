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
  LoadingIndicator,
  ChannelPreview,
  Avatar
} from "stream-chat-react";
import { useEffect, useState } from "react";
import { SignOutButton, useUser } from "@clerk/nextjs";
import { PlusIcon, UserCircleIcon } from "@heroicons/react/24/outline";

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
  const { user: clerkUser } = useUser();
  const chatClient = useClient({
    apiKey,
    user,
    tokenOrProvider: token,
  });

  useEffect(() => {
    setIsLoading(!chatClient);

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

  if (isLoading || !chatClient) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <LoadingIndicator size={40} />
          <p className="text-gray-600">Connecting to chat...</p>
        </div>
      </div>
    );
  }

  if (error || connectionError) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-50 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md max-w-md w-full">
          <div className="text-red-500 text-xl font-semibold mb-4">
            {error || connectionError || "An error occurred with the chat connection"}
          </div>
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Retry Connection
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

  const EmptyChannelComponent = () => (
    <div className="flex flex-col justify-center items-center h-full p-8 bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-sm max-w-md w-full text-center">
        <div className="text-4xl mb-4">💬</div>
        <h2 className="text-2xl font-semibold mb-3 text-gray-800">Welcome to Cortex Forum</h2>
        <p className="text-gray-600 mb-6">
          Select a channel from the sidebar or create a new one to start chatting with your team.
        </p>
        <div className="text-sm text-gray-500">
          Your messages will appear here once you select a channel.
        </div>
      </div>
    </div>
  );

  const CustomChannelPreview = (props: any) => {
    const { channel, activeChannel } = props;
    const lastMessage = channel.state.messages[channel.state.messages.length - 1];
    const unreadCount = channel.countUnread();

    return (
      <div
        className={`p-3 rounded-lg cursor-pointer transition-colors ${
          activeChannel ? 'bg-blue-50' : 'hover:bg-gray-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-500 font-semibold">
            {channel.data?.name?.[0]?.toUpperCase() || '#'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="font-medium text-gray-800 truncate">
                {channel.data?.name || 'Unnamed Channel'}
              </div>
              {unreadCount > 0 && (
                <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                  {unreadCount}
                </div>
              )}
            </div>
            <div className="text-sm text-gray-500 truncate">
              {lastMessage?.text || 'No messages yet'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Chat client={chatClient} theme="str-chat__theme-light">
      <div className="flex h-screen w-screen bg-white">
        {/* Sidebar - Channel List */}
        <div className="w-[300px] border-r border-gray-200 bg-gray-50">
          <div className="p-4 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">
                  C
                </div>
                <h2 className="font-semibold text-gray-800">Cortex Forum</h2>
              </div>
              <SignOutButton>
                <button className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Sign Out
                </button>
              </SignOutButton>
            </div>
            <div className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg">
              <UserCircleIcon className="w-5 h-5 text-gray-500" />
              <span className="text-sm text-gray-700 truncate">
                {clerkUser?.fullName || clerkUser?.primaryEmailAddress?.emailAddress}
              </span>
            </div>
          </div>
          <div className="p-2">
            <div className="flex items-center justify-between mb-2 px-2">
              <h3 className="text-sm font-medium text-gray-500">Channels</h3>
              <button className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
                <PlusIcon className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <ChannelList
              filters={{ members: { $in: [user.id!] } }}
              sort={{ last_message_at: -1 }}
              options={{ presence: true, state: true }}
              Preview={CustomChannelPreview}
            />
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          <Channel EmptyStateIndicator={EmptyChannelComponent}>
            <Window>
              <div className="border-b border-gray-200 bg-white">
                <ChannelHeader />
              </div>
              <div className="flex-1 overflow-hidden bg-gray-50">
                <MessageList />
              </div>
              <div className="border-t border-gray-200 bg-white p-4">
                <MessageInput focus />
              </div>
            </Window>
            <Thread />
          </Channel>
        </div>
      </div>
    </Chat>
  );
}
