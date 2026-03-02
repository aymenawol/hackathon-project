'use client';

import { useState, useRef, useEffect } from 'react';
import { Customer, Drink } from '@/lib/types';
import { RiskAssessment } from '@/lib/impairment-types';
import { estimateBAC, bacRiskLevel, formatBAC, hoursUntilSober } from '@/lib/bac';
import { formatBACRange } from '@/lib/bac-range';
import { MessageCircle, X, Send, Wind, Loader2 } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface FloatingChatbotProps {
  customer: Customer;
  drinks: Drink[];
  hoursElapsed: number;
  /** Assessment results to give the chatbot context */
  assessment?: RiskAssessment | null;
}

export function FloatingChatbot({ customer, drinks, hoursElapsed, assessment }: FloatingChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const bac = drinks.length > 0
    ? estimateBAC(drinks, customer.weight_lbs, customer.gender)
    : 0;
  const risk = bacRiskLevel(bac);
  const sobHours = hoursUntilSober(bac);
  const pacing = drinks.length / Math.max(hoursElapsed, 0.1);

  const sessionContext = {
    name: customer.name,
    bac,
    drinkCount: drinks.length,
    drinks: drinks.map((d) => ({ name: d.name, volume_ml: d.volume_ml, abv: d.abv })),
    hours: hoursElapsed,
    riskLevel: risk,
    gender: customer.gender,
    weightLbs: customer.weight_lbs,
    hoursUntilSober: sobHours,
    pacing,
    // Include assessment context if available
    ...(assessment && {
      impairmentRiskLevel: assessment.impairmentRiskLevel,
      finalRiskScore: assessment.finalRiskScore,
      confidenceLevel: assessment.confidenceLevel,
      bacRange: assessment.bacRange ? formatBACRange(assessment.bacRange) : undefined,
      checksCompleted: assessment.checks.map((c) => c.type).join(', '),
    }),
  };

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  function openChat() {
    setIsOpen(true);
    if (!hasOpened) {
      setHasOpened(true);
      // Send greeting on first open
      const greeting: ChatMessage = { role: 'user', content: 'Hey, tell me about my session so far.' };
      setMessages([greeting]);
      sendToBreathy([greeting]);
    }
  }

  async function sendToBreathy(chatHistory: ChatMessage[]) {
    setLoading(true);
    try {
      const res = await fetch('/api/breathy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory, sessionContext }),
      });
      const data = await res.json();
      const assistantMsg: ChatMessage = { role: 'assistant', content: data.reply };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const fallback: ChatMessage = {
        role: 'assistant',
        content: `Hey ${customer.name.split(' ')[0]}! Your estimated BAC is ${formatBAC(bac)} after ${drinks.length} drinks over ${hoursElapsed.toFixed(1)} hours. ${bac >= 0.08 ? 'Please consider arranging safe transportation.' : 'You seem to be doing okay — stay mindful!'} Ask me anything!`,
      };
      setMessages((prev) => [...prev, fallback]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    sendToBreathy(updated);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  /** Allow external trigger to open with a specific prompt (e.g., "Talk to AI about results") */
  useEffect(() => {
    function handleOpenChatEvent(e: CustomEvent<{ prompt?: string }>) {
      setIsOpen(true);
      setHasOpened(true);
      if (e.detail?.prompt) {
        const userMsg: ChatMessage = { role: 'user', content: e.detail.prompt };
        setMessages((prev) => [...prev, userMsg]);
        sendToBreathy([...messages, userMsg]);
      }
    }
    window.addEventListener('open-chatbot', handleOpenChatEvent as EventListener);
    return () => window.removeEventListener('open-chatbot', handleOpenChatEvent as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const quickReplies = [
    'How am I doing?',
    'How long until sober?',
    'Suggest hydration pacing',
    assessment ? 'Explain my results' : 'What\'s my BAC?',
  ];

  const showQuickReplies = messages.length >= 2 && messages.length <= 4 && !loading;

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={openChat}
          className="fixed bottom-20 right-3 z-[90] flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 sm:bottom-24 sm:right-4 sm:size-14"
          aria-label="Open AI Assistant"
        >
          <MessageCircle className="size-5 sm:size-6" />
          {/* Notification dot when there's assessment data */}
          {assessment && (
            <span className="absolute -top-1 -right-1 size-4 rounded-full bg-rose-500 border-2 border-background" />
          )}
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed inset-x-0 bottom-16 z-[95] px-2 sm:inset-x-auto sm:bottom-24 sm:right-4 sm:px-0 sm:w-[calc(100vw-2rem)] sm:max-w-sm">
          <div className="flex flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden" style={{ maxHeight: '55dvh' }}>
            {/* Header */}
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
                <Wind className="size-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold">Breathy AI</h3>
                <p className="text-[10px] text-muted-foreground">
                  {loading ? 'typing…' : 'Your AI session assistant'}
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-full hover:bg-muted"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-[200px]">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Wind className="size-10 text-muted-foreground/20 mb-2" />
                  <p className="text-sm text-muted-foreground">Ask me anything about your session</p>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 mr-1 mt-1">
                      <Wind className="size-2.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted rounded-bl-md'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 mr-1 mt-1">
                    <Wind className="size-2.5 text-primary" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-bl-md px-3 py-2.5">
                    <div className="flex gap-1">
                      <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {showQuickReplies && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {quickReplies.map((text) => (
                    <button
                      key={text}
                      onClick={() => {
                        const userMsg: ChatMessage = { role: 'user', content: text };
                        const updated = [...messages, userMsg];
                        setMessages(updated);
                        sendToBreathy(updated);
                      }}
                      className="rounded-full border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted transition-colors"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t px-3 py-2">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Breathy anything…"
                  disabled={loading}
                  className="flex-1 rounded-full border bg-muted/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
                >
                  {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
