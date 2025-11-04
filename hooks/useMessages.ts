import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Message } from "@/types";
import axios from "axios";

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const response = await axios.get<Message[]>(
        `/api/conversations/${conversationId}/messages`
      );
      return response.data;
    },
    enabled: !!conversationId,
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { content: string; attachments?: any[] }) => {
      const response = await axios.post<Message>(
        `/api/conversations/${conversationId}/messages`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}