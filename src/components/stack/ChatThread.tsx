import { FOUNDERS } from '../../data/founders';
import { cn } from '../../lib/cn';
import { initials } from '../../lib/leadInfo';
import { formatDateTime } from '../../lib/time';
import type { Lead, Message } from '../../state/types';
import { Avatar } from '../ui/Avatar';

interface ChatThreadProps {
  lead: Lead;
  messages: Message[];
  /** Letzte Nachricht des Leads hervorheben. */
  highlightLatestReply?: boolean;
  compact?: boolean;
}

export function ChatThread({ lead, messages, highlightLatestReply, compact }: ChatThreadProps) {
  const latestReplyId = highlightLatestReply ? [...messages].reverse().find((m) => m.from === 'lead')?.id : undefined;
  const leadName = `${lead.firstName} ${lead.lastName}`;

  return (
    <ol className={cn('flex flex-col', compact ? 'gap-3' : 'gap-4')}>
      {messages.map((message) => {
        const own = message.from === 'founder';
        const highlighted = message.id === latestReplyId;
        return (
          <li key={message.id} className={cn('flex items-end gap-2.5', own ? 'justify-end' : 'justify-start')}>
            {!own && <Avatar name={leadName} initials={initials(lead)} size={28} className="mb-0.5" />}
            <div className={cn('flex max-w-[82%] flex-col', own ? 'items-end' : 'items-start')}>
              <div className="mb-1 flex items-center gap-1.5 px-1 text-[11.5px] text-ink-3">
                {highlighted && (
                  <span className="mr-0.5 inline-flex items-center gap-1 font-medium text-accent">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    Neue Antwort
                  </span>
                )}
                <span>{own ? (message.label ?? FOUNDERS[message.founder ?? lead.owner].name) : lead.firstName}</span>
                <span aria-hidden>·</span>
                <span>{formatDateTime(message.at)}</span>
              </div>
              <div
                className={cn(
                  'whitespace-pre-wrap rounded-[20px] text-ink',
                  compact ? 'px-3.5 py-2.5 text-[13.5px] leading-[1.55]' : 'px-4 py-3 text-[14.5px] leading-[1.55]',
                  own ? 'rounded-br-md bg-surface-4' : 'rounded-bl-md border border-line bg-surface-2',
                  highlighted && 'border-accent/50 bg-accent-soft shadow-[0_0_0_4px_rgb(41_151_255/0.08)]',
                )}
              >
                {message.text}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
