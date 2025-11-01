import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Conversation } from "@/types";
import axios from "axios";

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const response = await axios.get<Conversation[]>("/api/conversations");
      return response.data;
    },
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { 
      name: string; 
      type: "channel" | "dm"; 
      memberIds?: string[] 
    }) => {
      const response = await axios.post<Conversation>("/api/conversations", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}