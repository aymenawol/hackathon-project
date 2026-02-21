'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Customer, Drink } from '@/lib/types';
import { estimateBAC, bacRiskLevel, formatBAC, hoursUntilSober } from '@/lib/bac';
import { Wind, Send, ShieldCheck, Loader2 } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

//important

interface BreathyModalProps {
  customer: Customer;
  drinks: Drink[];
  hoursElapsed: number;
  onConfirmEnd: () => void;
}

export function BreathyModal({ customer, drinks, hoursElapsed, onConfirmEnd }: BreathyModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const bac = drinks.length > 0
    ? estimateBAC(drinks, customer.weight_lbs, customer.gender)
    : 0;
  const risk = bacRiskLevel(bac);
  const sobHours = hoursUntilSober(bac);
  const pacing = drinks.length / Math.max(hoursElapsed, 0.1);

  // Build session context once (passed to every API call)
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
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Send opening message automatically
  useEffect(() => {
    sendToBreathy([{ role: 'user', content: 'Hey Breathy, I\'m ready to close my tab. How did I do tonight?' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setCanClose(true); // Can close after first Breathy reply
    } catch {
      const fallback: ChatMessage = {
        role: 'assistant',
        content: `Hey ${customer.name.split(' ')[0]}! 👋 Your BAC is ${formatBAC(bac)} after ${drinks.length} drinks. ${bac >= 0.08 ? 'Please get a safe ride home! 🚕' : 'You\'re looking alright — stay safe!'} Ask me anything before you go!`,
      };
      setMessages((prev) => [...prev, fallback]);
      setCanClose(true);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput('');
    sendToBreathy(updatedHistory);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Quick reply suggestions
  const quickReplies = [
    'Can I drive?',
    'How long until sober?',
    'What did I drink?',
    'How am I feeling?',
  ];

  const showQuickReplies = messages.length >= 2 && messages.length <= 4 && !loading;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm">
      {/* Popup card anchored to bottom, max height 70vh */}
      <div className="w-full max-w-md mx-4 mb-4 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl" style={{ maxHeight: '70vh' }}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary/10">
            <Wind className="size-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold">Breathy</h2>
            <p className="text-xs text-muted-foreground truncate">
              {loading ? 'typing…' : 'Your AI session buddy'}
            </p>
          </div>
          <div className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            risk === 'danger' ? 'bg-rose-500/10 text-rose-500' :
            risk === 'caution' ? 'bg-amber-500/10 text-amber-500' :
            'bg-emerald-500/10 text-emerald-500'
          }`}>
            BAC {formatBAC(bac)}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {/* System notice */}
          <div className="flex justify-center">
            <span className="inline-block rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
              🔒 Chat with Breathy before closing your tab
            </span>
          </div>

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 mr-1.5 mt-1">
                  <Wind className="size-3 text-primary" />
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

          {/* Typing indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 mr-1.5 mt-1">
                <Wind className="size-3 text-primary" />
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

          {/* Quick replies */}
          {showQuickReplies && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {quickReplies.map((text) => (
                <button
                  key={text}
                  onClick={() => {
                    setInput('');
                    const userMsg: ChatMessage = { role: 'user', content: text };
                    const updated = [...messages, userMsg];
                    setMessages(updated);
                    sendToBreathy(updated);
                  }}
                  className="rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  {text}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Close tab button */}
        {canClose && !loading && (
          <div className="px-3 pb-1.5">
            <Button
              onClick={onConfirmEnd}
              variant={bac >= 0.08 ? 'destructive' : 'default'}
              className="w-full h-9 rounded-xl text-xs"
            >
              <ShieldCheck className="mr-1.5 size-3.5" />
              I understand — close my tab
            </Button>
          </div>
        )}

        {/* Input bar */}
        <div className="border-t px-3 py-2.5">
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
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
