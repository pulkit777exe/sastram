"use client";

import { User } from "stream-chat";
import { createContext, useContext, useState } from "react";

type ContextState = {
  isLoading: boolean;
  error: string | null;
  chatUser: User | null;
  setChatUser: (user: User | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
};

const initialValue: ContextState = {
  isLoading: false,
  error: null,
  chatUser: null,
  setChatUser: () => {},
  setIsLoading: () => {},
  setError: () => {},
};

const Context = createContext<ContextState>(initialValue);

export const ContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [chatUser, setChatUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const store: ContextState = {
    isLoading,
    error,
    chatUser,
    setChatUser,
    setIsLoading,
    setError,
  };
  
  return <Context.Provider value={store}>{children}</Context.Provider>;
};

export const useContextProvider = () => useContext(Context);
