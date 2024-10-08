import React, { useEffect, useRef, useState } from "react";
import { ChatLayout } from "@/components/chat/chat-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import UsernameForm from "@/components/username-form";
import { getSelectedModel } from "@/lib/model-helper";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import useChatStore from "./hooks/useChatStore";

export default function Home() {
  const [chatId, setChatId] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>(getSelectedModel());
  const [open, setOpen] = useState(false);
  const [ollama, setOllama] = useState<ChatOllama | null>(null);
  const env = process.env.NODE_ENV;
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const base64Images = useChatStore((state) => state.base64Images);
  const setBase64Images = useChatStore((state) => state.setBase64Images);

  useEffect(() => {
    if (messages.length < 1) {
      // Generate a random id for the chat
      const id = uuidv4();
      setChatId(id);
    }
  }, [messages]);

  useEffect(() => {
    if (!isLoading && !error && chatId && messages.length > 0) {
      localStorage.setItem(`chat_${chatId}`, JSON.stringify(messages));
      window.dispatchEvent(new Event("storage"));
    }
  }, [chatId, isLoading, error]);

  // Function to manually connect to Ollama
  const connectToOllama = () => {
    if (env === "production") {
      const newOllama = new ChatOllama({
        baseUrl: process.env.NEXT_PUBLIC_OLLAMA_URL || "http://localhost:11434",
        model: selectedModel,
      });
      setOllama(newOllama);
      toast.success("Connected to Ollama successfully!");
    } else {
      toast.error("Failed to connect. Ensure you're in production.");
    }
  };

  const addMessage = (Message: Message) => {
    messages.push(Message);
    window.dispatchEvent(new Event("storage"));
    setMessages([...messages]);
  };

  const handleSubmitProduction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    addMessage({ role: "user", content: input, id: chatId });
    setInput("");

    if (ollama) {
      try {
        const parser = new BytesOutputParser();
        const stream = await ollama
          .pipe(parser)
          .stream(
            (messages as Message[]).map((m) =>
              m.role == "user"
                ? new HumanMessage(m.content)
                : new AIMessage(m.content)
            )
          );

        const decoder = new TextDecoder();
        let responseMessage = "";
        for await (const chunk of stream) {
          const decodedChunk = decoder.decode(chunk);
          responseMessage += decodedChunk;
          setLoadingSubmit(false);
          setMessages([
            ...messages,
            { role: "assistant", content: responseMessage, id: chatId },
          ]);
        }
        addMessage({ role: "assistant", content: responseMessage, id: chatId });
        setMessages([...messages]);

        localStorage.setItem(`chat_${chatId}`, JSON.stringify(messages));
        window.dispatchEvent(new Event("storage"));
      } catch (error) {
        toast.error("An error occurred. Please try again.");
        setLoadingSubmit(false);
      }
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoadingSubmit(true);

    const attachments: Attachment[] = base64Images
      ? base64Images.map((image) => ({
          contentType: "image/base64",
          url: image,
        }))
      : [];

    const requestOptions: ChatRequestOptions = {
      options: {
        body: {
          selectedModel: selectedModel,
        },
      },
      ...(base64Images && {
        data: {
          images: base64Images,
        },
        experimental_attachments: attachments,
      }),
    };

    if (env === "production") {
      handleSubmitProduction(e);
      setBase64Images(null);
    } else {
      handleSubmit(e, requestOptions);
      setBase64Images(null);
    }
  };

  const onOpenChange = (isOpen: boolean) => {
    const username = localStorage.getItem("ollama_user");
    if (username) return setOpen(isOpen);

    localStorage.setItem("ollama_user", "Anonymous");
    window.dispatchEvent(new Event("storage"));
    setOpen(isOpen);
  };

  return (
    <main className="flex h-[calc(100dvh)] flex-col items-center">
      <Dialog open={open} onOpenChange={onOpenChange}>
        <ChatLayout
          chatId=""
          setSelectedModel={setSelectedModel}
          messages={messages}
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={onSubmit}
          isLoading={isLoading}
          loadingSubmit={loadingSubmit}
          error={error}
          stop={stop}
          navCollapsedSize={10}
          defaultLayout={[30, 160]}
          formRef={formRef}
          setMessages={setMessages}
          setInput={setInput}
        />

        {/* Dialog for username */}
        <DialogContent className="flex flex-col space-y-4">
          <DialogHeader className="space-y-2">
            <DialogTitle>Welcome to Ollama!</DialogTitle>
            <DialogDescription>
              Enter your name to get started. This is just to personalize your experience.
            </DialogDescription>
            <UsernameForm setOpen={setOpen} />
          </DialogHeader>
        </DialogContent>

        {/* Button to connect to Ollama */}
        <div className="flex justify-center my-4">
          <Button onClick={connectToOllama}>Connect to Ollama</Button>
        </div>
      </Dialog>
    </main>
  );
}
