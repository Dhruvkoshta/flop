import {
	AlertTriangle,
	CheckCircle2,
	Download,
	File as FileIcon,
	Loader2,
	Send,
	Shield,
	Wifi,
	WifiOff,
} from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useReceiveTransfer } from "@/hooks/useSendTransfer";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const PHASE_LABEL: Record<string, string> = {
	connecting: "Connecting...",
	p2p_connecting: "Connecting to sender P2P...",
	p2p_receiving: "Receiving via P2P...",
	fallback_downloading: "Downloading from secure storage...",
	decrypting: "Decrypting...",
	done: "Download Complete",
	error: "Download Failed",
};

export function ReceivePage() {
	const { roomId } = useParams<{ roomId: string }>();
	const { phase, filename, progress, error, receive, reset } =
		useReceiveTransfer();

	useEffect(() => {
		if (!roomId) return;
		receive(roomId);
		return () => {
			reset();
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [roomId]);

	const isConnecting = phase === "connecting" || phase === "p2p_connecting";
	const isReceiving =
		phase === "p2p_receiving" || phase === "fallback_downloading";
	const isDecrypting = phase === "decrypting";
	const isDone = phase === "done";
	const isError = phase === "error";

	const isP2P = phase === "p2p_connecting" || phase === "p2p_receiving";
	const isFallback =
		phase === "fallback_downloading" || phase === "decrypting";

	return (
		<div className="min-h-screen bg-background flex flex-col">
		<header className="border-b border-border px-6 py-4 flex items-center justify-between">
			<Link
				to="/"
				className="text-xl font-bold tracking-widest text-foreground uppercase"
			>
				flop
			</Link>
			<div className="flex items-center gap-3 text-xs text-muted-foreground uppercase tracking-wider">
				<div className="flex items-center gap-1.5">
					<Shield className="h-3 w-3" />
					AES-GCM-256
				</div>
				<ThemeToggle />
			</div>
		</header>

			<main className="flex-1 flex flex-col items-center justify-center p-6">
				<div className="w-full max-w-xl space-y-0">
					{/* Title block */}
					<div className="border border-border bg-card px-6 py-5 border-b-0">
						<div className="flex items-center gap-3">
							<Send className="h-5 w-5 text-primary shrink-0" />
							<div>
								<h1 className="text-base font-bold uppercase tracking-widest text-foreground">
									{isDone ? "Download Complete" : isError ? "Download Failed" : "Receiving File"}
								</h1>
								<p className="text-xs text-muted-foreground mt-0.5">
									{isDone && "File decrypted and saved to your device"}
									{isError && (error ?? "Something went wrong")}
									{!isDone && !isError && (PHASE_LABEL[phase] ?? "Processing...")}
								</p>
							</div>
						</div>
					</div>

					{/* File info */}
					{filename && (
						<div className="border border-border border-t-0 bg-card">
							<div className="flex items-center gap-3 px-3 py-2.5">
								<div className="bg-primary/10 p-1.5 shrink-0">
									<FileIcon className="h-4 w-4 text-primary" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium truncate text-foreground">
										{filename}
									</p>
									{(isReceiving || isDecrypting) && (
										<div className="mt-1 h-0.5 bg-border w-full overflow-hidden">
											<div
												className="h-full bg-primary transition-all duration-200"
												style={{ width: `${progress.percent}%` }}
											/>
										</div>
									)}
								</div>
								<div className="shrink-0">
									{(isConnecting || isReceiving || isDecrypting) && (
										<Loader2 className="h-4 w-4 text-primary animate-spin" />
									)}
									{isDone && (
										<CheckCircle2 className="h-4 w-4 text-secondary" />
									)}
									{isError && (
										<AlertTriangle className="h-4 w-4 text-destructive" />
									)}
								</div>
							</div>
						</div>
					)}

					{/* Status / progress panel */}
					{!isDone && !isError && (
						<div className="border border-border border-t-0 bg-muted/20 px-5 py-4">
							<div className="flex items-center gap-3">
								{isP2P ? (
									<Wifi className="h-4 w-4 text-primary animate-pulse shrink-0" />
								) : isFallback ? (
									<WifiOff className="h-4 w-4 text-muted-foreground shrink-0" />
								) : (
									<Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
								)}
								<div className="flex-1">
									<p className="text-xs font-medium text-foreground uppercase tracking-wide">
										{isP2P && "P2P Transfer"}
										{isFallback && "Secure Storage Fallback"}
										{isConnecting && !isP2P && !isFallback && "Connecting"}
									</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										{phase === "p2p_connecting" &&
											"Establishing direct connection to sender..."}
										{phase === "p2p_receiving" &&
											`Receiving encrypted data... ${progress.percent}%`}
										{phase === "fallback_downloading" &&
											`Downloading encrypted file... ${progress.percent}%`}
										{phase === "decrypting" &&
											"Decrypting in your browser..."}
										{phase === "connecting" && "Fetching room info..."}
									</p>
								</div>
							</div>
						</div>
					)}

					{/* Done state */}
					{isDone && (
						<div className="border border-border border-t-0 bg-card px-5 py-6 flex flex-col items-center gap-3 text-center">
							<CheckCircle2 className="h-8 w-8 text-secondary" />
							<div>
								<p className="text-sm font-medium text-foreground uppercase tracking-wide">
									File Saved
								</p>
								<p className="text-xs text-muted-foreground mt-1">
									{filename} has been decrypted and saved to your downloads.
								</p>
							</div>
							<div className="flex gap-3 mt-2">
								<Link
									to="/send"
									className={cn(
										"flex items-center gap-2 border border-border text-foreground px-4 py-2 text-xs uppercase tracking-widest hover:border-primary/60 transition-colors",
									)}
								>
									<Download className="h-3.5 w-3.5" />
									Send a File
								</Link>
								<Link
									to="/"
									className="border border-border text-foreground px-4 py-2 text-xs uppercase tracking-widest hover:border-primary/60 transition-colors"
								>
									Home
								</Link>
							</div>
						</div>
					)}

					{/* Error state */}
					{isError && (
						<div className="border border-destructive border-t-0 bg-destructive/5 px-6 py-8 flex flex-col items-center gap-3 text-center">
							<AlertTriangle className="h-8 w-8 text-destructive" />
							<div>
								<p className="text-sm font-medium text-destructive uppercase tracking-wide">
									Download Failed
								</p>
								<p className="text-xs text-muted-foreground mt-1">
									{error ?? "The room may have expired or the file is unavailable."}
								</p>
							</div>
							<Link
								to="/"
								className="mt-2 border border-border text-foreground px-4 py-2 text-xs uppercase tracking-widest hover:border-primary/60 transition-colors"
							>
								Back to Home
							</Link>
						</div>
					)}

					{/* Footer note */}
					<div className="px-5 py-3 flex items-start gap-2 text-xs text-muted-foreground border border-border border-t-0 bg-muted/30">
						<Shield className="h-3 w-3 mt-0.5 shrink-0" />
						<span>
							Files are encrypted with AES-GCM-256. Decryption happens entirely
							in your browser — your plaintext never leaves this device.
						</span>
					</div>
				</div>
			</main>
		</div>
	);
}
