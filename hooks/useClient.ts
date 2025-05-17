import { useEffect, useState } from "react";
import { StreamChat, TokenOrProvider, User } from "stream-chat";

export type UseClientOptions = {
    apiKey: string;
    user: User;
    tokenOrProvider: TokenOrProvider;
}

export const useClient = ({
    apiKey,
    user,
    tokenOrProvider,
}: UseClientOptions): StreamChat | undefined => {
    const [chatClient, setChatClient] = useState<StreamChat | undefined>(undefined);

    useEffect(() => {
        // Validate inputs
        if (!apiKey || !user || !tokenOrProvider) {
            console.error("Missing required parameters for Stream Chat client");
            return;
        }

        // Initialize client
        const client = StreamChat.getInstance(apiKey);
        let didUserConnectInterrupt = false;

        // Connect user and handle result
        const connectUser = async () => {
            try {
                await client.connectUser(user, tokenOrProvider);
                if (!didUserConnectInterrupt) {
                    setChatClient(client);
                }
            } catch (error) {
                console.error("Error connecting to Stream Chat:", error);
                if (!didUserConnectInterrupt) {
                    setChatClient(undefined);
                }
            }
        };

        // Start connection
        connectUser();

        // Cleanup function
        return () => {
            didUserConnectInterrupt = true;
            
            const disconnectUser = async () => {
                try {
                    if (client?.userID) {
                        await client.disconnectUser();
                        console.log('Stream Chat connection closed successfully');
                    }
                } catch (error) {
                    console.error('Error disconnecting from Stream Chat:', error);
                } finally {
                    setChatClient(undefined);
                }
            };
            
            disconnectUser();
        };
    }, [apiKey, user?.id, tokenOrProvider]);

    return chatClient;
}
