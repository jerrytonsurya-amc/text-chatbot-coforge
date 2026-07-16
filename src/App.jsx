import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import {
  subscribeToThreads,
  subscribeToMessages,
  createThread,
  updateThreadTitle,
  deleteThread,
  addMessage,
} from './lib/firebase';
import { sendChatMessage } from './lib/api';
import './App.css';

function generateTitle(message) {
  const trimmed = message.trim();
  if (trimmed.length <= 40) return trimmed;
  return trimmed.slice(0, 40) + '...';
}

export default function App() {
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const unsub = subscribeToThreads(setThreads);
    return unsub;
  }, []);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    const unsub = subscribeToMessages(activeThreadId, setMessages);
    return unsub;
  }, [activeThreadId]);

  const handleNewChat = useCallback(async () => {
    const id = await createThread();
    setActiveThreadId(id);
  }, []);

  const handleSelectThread = useCallback((id) => {
    setActiveThreadId(id);
  }, []);

  const handleDeleteThread = useCallback(async (id) => {
    await deleteThread(id);
    if (activeThreadId === id) {
      setActiveThreadId(null);
    }
  }, [activeThreadId]);

  const handleSend = useCallback(async (text) => {
    let threadId = activeThreadId;

    if (!threadId) {
      threadId = await createThread(generateTitle(text));
      setActiveThreadId(threadId);
    } else if (messages.length === 0) {
      await updateThreadTitle(threadId, generateTitle(text));
    }

    await addMessage(threadId, 'user', text);
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { answer, sources } = await sendChatMessage(text, history);
      await addMessage(threadId, 'assistant', answer, sources || []);
    } catch (err) {
      await addMessage(
        threadId,
        'assistant',
        `Sorry, I encountered an error: ${err.message}. Please try again.`
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeThreadId, messages]);

  return (
    <div className="app">
      <Sidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
        onDeleteThread={handleDeleteThread}
      />
      <ChatArea
        messages={messages}
        isLoading={isLoading}
        onSend={handleSend}
        disabled={false}
      />
    </div>
  );
}
