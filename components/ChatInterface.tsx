// import { useState, useEffect, useRef } from "react";
// import {
//   Search,
//   Hash,
//   Bell,
//   Pin,
//   Users,
//   MoreVertical,
//   Smile,
//   Paperclip,
//   Send,
//   Menu,
//   Volume2,
//   FileText,
//   Image as ImageIcon,
//   Video,
//   LogOut,
//   BellOff,
//   Check,
//   CheckCheck,
//   Circle,
// } from "lucide-react";
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Textarea } from "@/components/ui/textarea";
// import { Switch } from "@/components/ui/switch";
// import { ScrollArea } from "@/components/ui/scroll-area";
// import { Badge } from "@/components/ui/badge";
// import { Separator } from "@/components/ui/separator";
// import { Card } from "@/components/ui/card";
// import {
//   Sheet,
//   SheetContent,
//   SheetHeader,
//   SheetTitle,
// } from "@/components/ui/sheet";
// import { Conversation, Message } from "@/types";

// const mockConversations: Conversation[] = [
//   {
//     id: "1",
//     name: "general",
//     avatar: "",
//     lastMessage: "Let's discuss the new feature...",
//     timestamp: "2:30 PM",
//     unread: 3,
//     online: true,
//     type: "channel",
//   },
//   {
//     id: "2",
//     name: "random",
//     avatar: "",
//     lastMessage: "Anyone up for a game?",
//     timestamp: "1:15 PM",
//     unread: 0,
//     online: true,
//     type: "channel",
//   },
//   {
//     id: "3",
//     name: "Sarah Johnson",
//     avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
//     lastMessage: "Thanks for the help!",
//     timestamp: "Yesterday",
//     unread: 1,
//     online: false,
//     type: "dm",
//   },
//   {
//     id: "4",
//     name: "dev-team",
//     avatar: "",
//     lastMessage: "Code review needed",
//     timestamp: "Yesterday",
//     unread: 5,
//     online: true,
//     type: "channel",
//   },
// ];

// // {
// //   id: string;
// //   conversationId: string;
// //   senderId: string;
// //   sender: string;
// //   content: string;
// //   timestamp: string;
// //   avatar: string;
// //   isOwn: boolean;
// //   status?: "sent" | "delivered" | "read";
// // }

// const mockMessages: Message[] = [
//   {
//     id: "1",
//     sender: "Alex Chen",
//     content: "Hey everyone! Welcome to the general channel 👋",
//     timestamp: "10:30 AM",
//     avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
//     isOwn: false,
//   },
//   {
//     id: "2",
//     sender: "Jordan Smith",
//     content: "Thanks! Excited to be here. What are we working on today?",
//     timestamp: "10:32 AM",
//     avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan",
//     isOwn: false,
//   },
//   {
//     id: "3",
//     sender: "You",
//     content: "We're planning to review the new chat interface design and discuss implementation details.",
//     timestamp: "10:35 AM",
//     avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=You",
//     isOwn: true,
//     status: "read",
//   },
//   {
//     id: "4",
//     sender: "Alex Chen",
//     content: "Sounds great! I've prepared some mockups we can go through.",
//     timestamp: "10:36 AM",
//     avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
//     isOwn: false,
//   },
//   {
//     id: "5",
//     sender: "You",
//     content: "Perfect! Let's start with the overall layout and then dive into the component details.",
//     timestamp: "10:38 AM",
//     avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=You",
//     isOwn: true,
//     status: "delivered",
//   },
// ];

// export default function ChatInterface() {
//   const [selectedConversation, setSelectedConversation] = useState<string>("1");
//   const [message, setMessage] = useState("");
//   const [isSidebarOpen, setIsSidebarOpen] = useState(false);
//   const [isTyping, setIsTyping] = useState(true);
//   const [isSubscribed, setIsSubscribed] = useState(false);
//   const textareaRef = useRef<HTMLTextAreaElement>(null);

//   const currentConversation = mockConversations.find(
//     (c) => c.id === selectedConversation
//   );

//   // Keyboard support: Escape to close drawer
//   useEffect(() => {
//     const handleEscape = (e: KeyboardEvent) => {
//       if (e.key === "Escape" && isSidebarOpen) {
//         setIsSidebarOpen(false);
//       }
//     };

//     window.addEventListener("keydown", handleEscape);
//     return () => window.removeEventListener("keydown", handleEscape);
//   }, [isSidebarOpen]);

//   // Focus textarea on mount
//   useEffect(() => {
//     textareaRef.current?.focus();
//   }, []);

//   const handleSendMessage = () => {
//     if (message.trim()) {
//       // Handle send logic here
//       setMessage("");
//       textareaRef.current?.focus();
//     }
//   };

//   return (
//     <div className="flex h-screen bg-dark-primary text-foreground overflow-hidden">
//       {/* Mobile Drawer using Sheet for better animations and accessibility */}
//       <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
//         <SheetContent
//           side="left"
//           className="w-72 bg-dark-secondary border-r border-border p-0 lg:hidden"
//         >
//           <SheetHeader className="p-4 border-b border-border">
//             <SheetTitle className="text-lg font-semibold text-primary text-left">
//               We Write Code
//             </SheetTitle>
//           </SheetHeader>
//           <div className="p-4 border-b border-border">
//             <div className="relative">
//               <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
//               <Input
//                 placeholder="Search conversations..."
//                 className="pl-9 bg-dark-primary border-border focus-visible:ring-primary"
//                 aria-label="Search conversations"
//               />
//             </div>
//           </div>
//           <ScrollArea className="flex-1 h-[calc(100vh-8rem)]">
//             <div className="p-2 space-y-1">
//               {mockConversations.map((conv) => (
//                 <button
//                   key={conv.id}
//                   onClick={() => {
//                     setSelectedConversation(conv.id);
//                     setIsSidebarOpen(false);
//                   }}
//                   className={`
//                     w-full p-3 rounded-xl text-left transition-all
//                     hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none
//                     ${
//                       selectedConversation === conv.id
//                         ? "bg-accent shadow-inner"
//                         : ""
//                     }
//                   `}
//                   aria-label={`Open conversation with ${conv.name}`}
//                 >
//                   <div className="flex items-start gap-3">
//                     <div className="relative">
//                       {conv.type === "channel" ? (
//                         <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shadow-inner">
//                           <Hash className="h-5 w-5 text-primary" />
//                         </div>
//                       ) : (
//                         <Avatar className="w-10 h-10 border-2 border-border">
//                           <AvatarImage src={conv.avatar} />
//                           <AvatarFallback>{conv.name[0]}</AvatarFallback>
//                         </Avatar>
//                       )}
//                       {conv.online && (
//                         <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-dark-secondary" />
//                       )}
//                     </div>
//                     <div className="flex-1 min-w-0">
//                       <div className="flex items-center justify-between mb-1">
//                         <h3 className="font-medium text-sm text-foreground truncate">
//                           {conv.name}
//                         </h3>
//                         <span className="text-xs text-muted-foreground flex-shrink-0">
//                           {conv.timestamp}
//                         </span>
//                       </div>
//                       <div className="flex items-center justify-between">
//                         <p className="text-xs text-muted-foreground truncate flex-1">
//                           {conv.lastMessage}
//                         </p>
//                         {conv.unread > 0 && (
//                           <Badge className="ml-2 bg-secondary text-secondary-foreground px-2 py-0.5 text-xs shadow-inner">
//                             {conv.unread}
//                           </Badge>
//                         )}
//                       </div>
//                     </div>
//                   </div>
//                 </button>
//               ))}
//             </div>
//           </ScrollArea>
//         </SheetContent>
//       </Sheet>

//       {/* Desktop Left Sidebar - Conversations */}
//       <div className="hidden lg:flex w-72 bg-dark-secondary border-r border-border flex-col h-full">
//         <div className="p-4 border-b border-border">
//           <h2 className="text-lg font-semibold text-primary mb-3">
//             We Write Code
//           </h2>
//           <div className="relative">
//             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
//             <Input
//               placeholder="Search conversations..."
//               className="pl-9 bg-dark-primary border-border focus-visible:ring-primary"
//               aria-label="Search conversations"
//             />
//           </div>
//         </div>

//         <ScrollArea className="flex-1">
//           <div className="p-2 space-y-1">
//             {mockConversations.map((conv) => (
//               <button
//                 key={conv.id}
//                 onClick={() => setSelectedConversation(conv.id)}
//                 className={`
//                   w-full p-3 rounded-xl text-left transition-all
//                   hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none
//                   ${
//                     selectedConversation === conv.id
//                       ? "bg-accent shadow-inner"
//                       : ""
//                   }
//                 `}
//                 aria-label={`Open conversation with ${conv.name}`}
//               >
//                 <div className="flex items-start gap-3">
//                   <div className="relative">
//                     {conv.type === "channel" ? (
//                       <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shadow-inner">
//                         <Hash className="h-5 w-5 text-primary" />
//                       </div>
//                     ) : (
//                       <Avatar className="w-10 h-10 border-2 border-border">
//                         <AvatarImage src={conv.avatar} />
//                         <AvatarFallback>{conv.name[0]}</AvatarFallback>
//                       </Avatar>
//                     )}
//                     {conv.online && (
//                       <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-dark-secondary" />
//                     )}
//                   </div>
//                   <div className="flex-1 min-w-0">
//                     <div className="flex items-center justify-between mb-1">
//                       <h3 className="font-medium text-sm text-foreground truncate">
//                         {conv.name}
//                       </h3>
//                       <span className="text-xs text-muted-foreground flex-shrink-0">
//                         {conv.timestamp}
//                       </span>
//                     </div>
//                     <div className="flex items-center justify-between">
//                       <p className="text-xs text-muted-foreground truncate flex-1">
//                         {conv.lastMessage}
//                       </p>
//                       {conv.unread > 0 && (
//                         <Badge className="ml-2 bg-secondary text-secondary-foreground px-2 py-0.5 text-xs shadow-inner">
//                           {conv.unread}
//                         </Badge>
//                       )}
//                     </div>
//                   </div>
//                 </div>
//               </button>
//             ))}
//           </div>
//         </ScrollArea>
//       </div>

//       {/* Main Chat Area */}
//       <div className="flex-1 flex flex-col min-w-0">
//         {/* Chat Header */}
//         <div className="h-14 border-b border-border px-4 flex items-center justify-between bg-dark-secondary shadow-sm">
//           <div className="flex items-center gap-3">
//             <Button
//               variant="ghost"
//               size="icon"
//               className="lg:hidden hover:bg-accent shadow-inner focus-visible:ring-2 focus-visible:ring-primary"
//               onClick={() => setIsSidebarOpen(true)}
//               aria-label="Open conversations menu"
//             >
//               <Menu className="h-5 w-5" />
//             </Button>
//             <Hash className="h-5 w-5 text-muted-foreground" />
//             <div>
//               <h2 className="font-semibold text-foreground">
//                 {currentConversation?.name || "general"}
//               </h2>
//               <p className="text-xs text-muted-foreground">
//                 {currentConversation?.online ? "Active now" : "Last seen 2h ago"}
//               </p>
//             </div>
//           </div>
//           <div className="flex items-center gap-2">
//             <Button
//               variant="ghost"
//               size="icon"
//               className="hover:bg-accent shadow-inner focus-visible:ring-2 focus-visible:ring-primary"
//               aria-label="Notifications"
//               tabIndex={0}
//             >
//               <Bell className="h-5 w-5" />
//             </Button>
//             <Button
//               variant="ghost"
//               size="icon"
//               className="hover:bg-accent shadow-inner focus-visible:ring-2 focus-visible:ring-primary"
//               aria-label="Pin messages"
//               tabIndex={0}
//             >
//               <Pin className="h-5 w-5" />
//             </Button>
//             <Button
//               variant="ghost"
//               size="icon"
//               className="hover:bg-accent shadow-inner focus-visible:ring-2 focus-visible:ring-primary"
//               aria-label="Members"
//               tabIndex={0}
//             >
//               <Users className="h-5 w-5" />
//             </Button>
//             <Button
//               variant="ghost"
//               size="icon"
//               className="hover:bg-accent shadow-inner focus-visible:ring-2 focus-visible:ring-primary"
//               aria-label="More options"
//               tabIndex={0}
//             >
//               <MoreVertical className="h-5 w-5" />
//             </Button>
//           </div>
//         </div>

//         {/* Messages Area */}
//         <ScrollArea className="flex-1 px-4 bg-dark-primary">
//           <div className="py-4 space-y-6 max-w-5xl mx-auto">
//             {/* Date Separator */}
//             <div className="flex items-center gap-3">
//               <Separator className="flex-1 bg-border" />
//               <span className="text-xs text-muted-foreground font-medium px-2">
//                 Today
//               </span>
//               <Separator className="flex-1 bg-border" />
//             </div>

//             {/* Messages */}
//             {mockMessages.map((msg) => (
//               <div
//                 key={msg.id}
//                 className={`flex gap-3 ${msg.isOwn ? "flex-row-reverse" : ""}`}
//               >
//                 {!msg.isOwn && (
//                   <Avatar className="w-10 h-10 border-2 border-border flex-shrink-0">
//                     <AvatarImage src={msg.avatar} />
//                     <AvatarFallback>{msg.sender[0]}</AvatarFallback>
//                   </Avatar>
//                 )}
//                 <div
//                   className={`flex flex-col ${
//                     msg.isOwn ? "items-end" : "items-start"
//                   } flex-1 min-w-0`}
//                 >
//                   {!msg.isOwn && (
//                     <span className="text-sm font-medium text-primary mb-1">
//                       {msg.sender}
//                     </span>
//                   )}
//                   <div
//                     className={`
//                     px-4 py-2.5 rounded-2xl max-w-2xl
//                     ${
//                       msg.isOwn
//                         ? "bg-secondary text-secondary-foreground shadow-inner"
//                         : "bg-accent text-foreground shadow-sm"
//                     }
//                   `}
//                   >
//                     <p className="text-sm leading-relaxed break-words">
//                       {msg.content}
//                     </p>
//                   </div>
//                   <div className="flex items-center gap-2 mt-1">
//                     <span className="text-xs text-muted-foreground">
//                       {msg.timestamp}
//                     </span>
//                     {msg.isOwn && msg.status && (
//                       <div className="flex items-center" aria-label={`Message ${msg.status}`}>
//                         {msg.status === "read" ? (
//                           <CheckCheck className="h-3.5 w-3.5 text-secondary" aria-label="Read" />
//                         ) : msg.status === "delivered" ? (
//                           <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" aria-label="Delivered" />
//                         ) : (
//                           <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sent" />
//                         )}
//                       </div>
//                     )}
//                   </div>
//                 </div>
//                 {msg.isOwn && (
//                   <Avatar className="w-10 h-10 border-2 border-secondary flex-shrink-0">
//                     <AvatarImage src={msg.avatar} />
//                     <AvatarFallback>Y</AvatarFallback>
//                   </Avatar>
//                 )}
//               </div>
//             ))}

//             {/* Typing Indicator */}
//             {isTyping && (
//               <div className="flex gap-3">
//                 <Avatar className="w-10 h-10 border-2 border-border">
//                   <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alex" />
//                   <AvatarFallback>A</AvatarFallback>
//                 </Avatar>
//                 <div className="flex flex-col">
//                   <span className="text-sm font-medium text-primary mb-1">
//                     Alex Chen
//                   </span>
//                   <div className="bg-accent px-4 py-3 rounded-2xl shadow-sm">
//                     <div className="flex gap-1">
//                       <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
//                       <div
//                         className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
//                         style={{ animationDelay: "0.2s" }}
//                       />
//                       <div
//                         className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
//                         style={{ animationDelay: "0.4s" }}
//                       />
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             )}
//           </div>
//         </ScrollArea>

//         {/* Message Composer */}
//         <div className="border-t border-border bg-dark-secondary p-4">
//           <div className="max-w-5xl mx-auto">
//             <Card className="bg-dark-primary border-border shadow-lg">
//               <div className="p-3">
//                 <Textarea
//                   ref={textareaRef}
//                   value={message}
//                   onChange={(e) => setMessage(e.target.value)}
//                   placeholder="Type a message... (Press Enter to send, Shift+Enter for newline)"
//                   className="min-h-[60px] resize-none border-0 focus-visible:ring-0 bg-transparent text-foreground placeholder:text-muted-foreground"
//                   onKeyDown={(e) => {
//                     if (e.key === "Enter" && !e.shiftKey) {
//                       e.preventDefault();
//                       handleSendMessage();
//                     }
//                   }}
//                   aria-label="Message input"
//                 />
//                 <div className="flex items-center justify-between mt-2">
//                   <div className="flex items-center gap-1">
//                     <Button
//                       variant="ghost"
//                       size="icon"
//                       className="h-9 w-9 hover:bg-accent shadow-inner focus-visible:ring-2 focus-visible:ring-primary"
//                       aria-label="Attach file"
//                       tabIndex={0}
//                     >
//                       <Paperclip className="h-5 w-5" />
//                     </Button>
//                     <Button
//                       variant="ghost"
//                       size="icon"
//                       className="h-9 w-9 hover:bg-accent shadow-inner focus-visible:ring-2 focus-visible:ring-primary"
//                       aria-label="Add emoji"
//                       tabIndex={0}
//                     >
//                       <Smile className="h-5 w-5" />
//                     </Button>
//                   </div>
//                   <Button
//                     className="bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-inner focus-visible:ring-2 focus-visible:ring-primary"
//                     size="sm"
//                     onClick={handleSendMessage}
//                     disabled={!message.trim()}
//                     tabIndex={0}
//                   >
//                     <Send className="h-4 w-4 mr-2" />
//                     Send
//                   </Button>
//                 </div>
//               </div>
//             </Card>
//             <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-2 flex-wrap">
//               <span className="flex items-center gap-1">
//                 <kbd className="px-1.5 py-0.5 bg-accent rounded text-foreground">Tab</kbd> to navigate
//               </span>
//               <span>•</span>
//               <span className="flex items-center gap-1">
//                 <kbd className="px-1.5 py-0.5 bg-accent rounded text-foreground">Enter</kbd> to send
//               </span>
//               <span>•</span>
//               <span className="flex items-center gap-1">
//                 <kbd className="px-1.5 py-0.5 bg-accent rounded text-foreground">Shift+Enter</kbd> for newline
//               </span>
//               <span>•</span>
//               <span className="flex items-center gap-1">
//                 <kbd className="px-1.5 py-0.5 bg-accent rounded text-foreground">Esc</kbd> to close
//               </span>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Right Sidebar - Channel/User Details */}
//       <div className="hidden xl:flex w-80 bg-dark-secondary border-l border-border flex-col">
//         <div className="p-4 border-b border-border">
//           <h3 className="font-semibold text-foreground mb-1">Channel Details</h3>
//           <p className="text-sm text-muted-foreground">
//             {currentConversation?.type === "channel"
//               ? "Public discussion channel"
//               : "Direct message"}
//           </p>
//         </div>

//         <ScrollArea className="flex-1">
//           <div className="p-4 space-y-6">
//             {/* Subscribe Section */}
//             <Card className="bg-dark-primary border-border shadow-lg">
//               <div className="p-4">
//                 <div className="flex items-start gap-3 mb-3">
//                   <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center">
//                     <Bell className="h-5 w-5 text-secondary" />
//                   </div>
//                   <div className="flex-1">
//                     <h4 className="font-semibold text-sm text-foreground mb-1">
//                       Newsletter
//                     </h4>
//                     <p className="text-xs text-muted-foreground">
//                       Get updates delivered to your email
//                     </p>
//                   </div>
//                 </div>
//                 <Button
//                   className={`w-full shadow-inner ${
//                     isSubscribed
//                       ? "bg-accent text-foreground hover:bg-accent/80"
//                       : "bg-secondary text-secondary-foreground hover:bg-secondary/90"
//                   }`}
//                   onClick={() => setIsSubscribed(!isSubscribed)}
//                 >
//                   {isSubscribed ? (
//                     <>
//                       <Check className="h-4 w-4 mr-2" />
//                       Subscribed
//                     </>
//                   ) : (
//                     <>
//                       <Bell className="h-4 w-4 mr-2" />
//                       Subscribe
//                     </>
//                   )}
//                 </Button>
//               </div>
//             </Card>

//             {/* Members */}
//             <div>
//               <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
//                 <Users className="h-4 w-4" />
//                 Members (142)
//               </h4>
//               <div className="space-y-2">
//                 {["Alex Chen", "Jordan Smith", "Sarah Johnson", "Mike Davis"].map(
//                   (name, i) => (
//                     <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors">
//                       <div className="relative">
//                         <Avatar className="w-8 h-8 border border-border">
//                           <AvatarImage
//                             src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`}
//                           />
//                           <AvatarFallback>{name[0]}</AvatarFallback>
//                         </Avatar>
//                         <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border border-dark-secondary" />
//                       </div>
//                       <span className="text-sm text-foreground">{name}</span>
//                     </div>
//                   )
//                 )}
//               </div>
//             </div>

//             <Separator className="bg-border" />

//             {/* Shared Files */}
//             <div>
//               <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
//                 <FileText className="h-4 w-4" />
//                 Shared Files
//               </h4>
//               <div className="space-y-2">
//                 {[
//                   { name: "design-mockup.fig", icon: FileText, size: "2.4 MB" },
//                   { name: "screenshot.png", icon: ImageIcon, size: "1.1 MB" },
//                   { name: "demo-video.mp4", icon: Video, size: "15.8 MB" },
//                 ].map((file, i) => (
//                   <button
//                     key={i}
//                     className="w-full p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-left group"
//                   >
//                     <div className="flex items-center gap-3">
//                       <div className="w-10 h-10 rounded-lg bg-dark-primary flex items-center justify-center shadow-inner">
//                         <file.icon className="h-5 w-5 text-primary" />
//                       </div>
//                       <div className="flex-1 min-w-0">
//                         <p className="text-sm font-medium text-foreground truncate">
//                           {file.name}
//                         </p>
//                         <p className="text-xs text-muted-foreground">
//                           {file.size}
//                         </p>
//                       </div>
//                     </div>
//                   </button>
//                 ))}
//               </div>
//             </div>

//             <Separator className="bg-border" />

//             {/* Actions */}
//             <div className="space-y-2">
//               <Button
//                 variant="outline"
//                 className="w-full justify-start shadow-inner hover:bg-accent border-border"
//               >
//                 <BellOff className="h-4 w-4 mr-2" />
//                 Mute Notifications
//               </Button>
//               <Button
//                 variant="outline"
//                 className="w-full justify-start shadow-inner hover:bg-destructive hover:text-destructive-foreground border-border"
//               >
//                 <LogOut className="h-4 w-4 mr-2" />
//                 Leave Channel
//               </Button>
//             </div>
//           </div>
//         </ScrollArea>
//       </div>
//     </div>
//   );
// }
