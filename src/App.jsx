import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { getTabMismatchMessage } from '../shared/companyGuard.js';
import { COMPANY_IDS } from './lib/companies';
import './App.css';

function generateTitle(message) {
  const trimmed = message.trim();
  if (trimmed.length <= 40) return trimmed;
  return trimmed.slice(0, 40) + '...';
}

export default function App() {
  const [threads, setThreads] = useState([]);
  const [activeCompany, setActiveCompany] = useState('Coforge');
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

  const companyThreads = useMemo(
    () => threads.filter((thread) => (thread.company || 'Coforge') === activeCompany),
    [threads, activeCompany]
  );

  useEffect(() => {
    if (!activeThreadId) return;
    const activeThread = threads.find((thread) => thread.id === activeThreadId);
    if (activeThread && (activeThread.company || 'Coforge') !== activeCompany) {
      setActiveThreadId(null);
    }
  }, [activeCompany, activeThreadId, threads]);

  const handleCompanyChange = useCallback((company) => {
    if (company === activeCompany) return;
    setActiveCompany(company);
    setActiveThreadId(null);
    setMessages([]);
  }, [activeCompany]);

  const handleNewChat = useCallback(async () => {
    const id = await createThread('New chat', activeCompany);
    setActiveThreadId(id);
  }, [activeCompany]);

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
      threadId = await createThread(generateTitle(text), activeCompany);
      setActiveThreadId(threadId);
    } else if (messages.length === 0) {
      await updateThreadTitle(threadId, generateTitle(text));
    }

    await addMessage(threadId, 'user', text);

    const tabMismatch = getTabMismatchMessage(activeCompany, text.trim());
    if (tabMismatch) {
      await addMessage(threadId, 'assistant', tabMismatch, []);
      return;
    }

    setIsLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { answer, sources } = await sendChatMessage(text, history, undefined, activeCompany);
      await addMessage(threadId, 'assistant', answer, sources || []);
    } catch (err) {
      await addMessage(
        threadId,
        'assistant',
        err.message?.includes('rate-limited')
          ? '⏳ The AI service is temporarily busy due to rate limits. Please wait about a minute and try again.'
          : `Sorry, I encountered an error: ${err.message}. Please try again.`
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeThreadId, activeCompany, messages]);

  return (
    <div className="app">
      <Sidebar
        threads={companyThreads}
        activeThreadId={activeThreadId}
        activeCompany={activeCompany}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
        onDeleteThread={handleDeleteThread}
      />
      <ChatArea
        company={activeCompany}
        companies={COMPANY_IDS}
        onCompanyChange={handleCompanyChange}
        messages={messages}
        isLoading={isLoading}
        onSend={handleSend}
        disabled={false}
      />
    </div>
  );
}
