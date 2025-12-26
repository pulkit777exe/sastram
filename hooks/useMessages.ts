import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Message } from "@/types";
import { getMessages, sendMessage } from "@/modules/chat/actions";
import { toast } from "sonner";
import type { AttachmentInput } from "@/lib/types/index";

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const result = await getMessages(conversationId);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data as Message[];
    },
    enabled: !!conversationId,
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { content: string; attachments?: AttachmentInput[] }) => {
      const result = await sendMessage({ ...data, conversationId });
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data as Message;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send message");
    }
  });
}