import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, Info, X, ChevronDown, ShieldCheck, Zap, Lock, Key, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TipItem {
  id: string;
  icon?: React.ReactNode;
  title: string;
  description: string;
  tag?: string;
}

interface UiTipBannerProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  className?: string;
  actionText?: string;
  onAction?: () => void;
  dismissible?: boolean;
}

export function UiTipBanner({
  icon = <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />,
  title,
  description,
  className,
  actionText,
  onAction,
  dismissible = true,
}: UiTipBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: "hidden" }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={cn(
          "relative flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-foreground shadow-sm backdrop-blur-sm",
          className
        )}
      >
        <div className="p-1 rounded-lg bg-amber-500/10 shrink-0 mt-0.5">{icon}</div>
        <div className="flex-1 space-y-0.5 min-w-0 pr-4">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            {title}
          </div>
          <p className="text-muted-foreground leading-relaxed">{description}</p>
          {actionText && (
            <button
              type="button"
              onClick={onAction}
              className="mt-2 font-medium text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1 text-[11px]"
            >
              {actionText}
            </button>
          )}
        </div>
        {dismissible && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
            title="Dismiss tip"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

interface UiTipTooltipProps {
  content: React.ReactNode;
  children?: React.ReactNode;
  title?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function UiTipTooltip({
  content,
  children,
  title,
  icon = <HelpCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-primary transition-colors cursor-pointer" />,
  className,
}: UiTipTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <div
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center focus:outline-none cursor-pointer"
      >
        {children || icon}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 5 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-popover text-popover-foreground border border-border rounded-xl shadow-xl z-50 text-xs pointer-events-none"
          >
            {title && <div className="font-semibold mb-1 text-foreground">{title}</div>}
            <div className="text-muted-foreground leading-relaxed">{content}</div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-popover" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface UiTipsDrawerProps {
  title?: string;
  tips: TipItem[];
  defaultOpen?: boolean;
  className?: string;
}

export function UiTipsDrawer({
  title = "Pro Tips & Room Security Guide",
  tips,
  defaultOpen = false,
  className,
}: UiTipsDrawerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn("rounded-xl border border-border/80 bg-card/60 backdrop-blur-md overflow-hidden transition-all shadow-sm", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground">
          <Lightbulb className="h-4 w-4 text-amber-500 animate-pulse" />
          <span>{title}</span>
          <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono">
            {tips.length} tips
          </span>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden border-t border-border/50 bg-background/30"
          >
            <div className="p-4 grid gap-3 sm:grid-cols-2">
              {tips.map((tip) => (
                <div
                  key={tip.id}
                  className="p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors flex items-start gap-2.5"
                >
                  <div className="p-1 rounded bg-primary/10 text-primary shrink-0 mt-0.5">
                    {tip.icon || <Info className="h-3.5 w-3.5" />}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground truncate">{tip.title}</p>
                      {tip.tag && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-mono">
                          {tip.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{tip.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
