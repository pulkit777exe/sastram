import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Conversation } from "@/types";
import { getConversations, createConversation } from "@/modules/chat/actions";
import { toast } from "sonner";

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const result = await getConversations();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data as Conversation[];
    },
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      type: "channel" | "dm";
      memberIds?: string[]
    }) => {
      const result = await createConversation(data);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data as Conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Channel created successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create channel");
    }
  });
}