import * as React from "react"
import { ChatClient } from "@/components/chat-client"

export const generateStaticParams = () => {
  return [{ creatorId: 'test' }];
};

export default async function ChatPage({
    params,
  }: {
    params: Promise<{ creatorId: string }>
  }) {
  const { creatorId } = await params
  
  return <ChatClient creatorId={creatorId} />
}
