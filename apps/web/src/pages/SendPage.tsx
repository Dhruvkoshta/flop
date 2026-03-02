import {
	AlertTriangle,
	ArrowRight,
	Check,
	ChevronRight,
	Clock,
	Copy,
	ExternalLink,
	File as FileIcon,
	Loader2,
	Lock,
	QrCode,
	Send,
	Shield,
	Upload,
	Wifi,
	X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { Link } from "react-router-dom";
import { useSendTransfer } from "@/hooks/useSendTransfer";
import { cn, formatBytes } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const PHASE_LABEL: Record<string, string> = {
	encrypting: "Encrypting...",
	uploading: "Uploading to secure storage...",
	waiting_for_peer: "Waiting for recipient...",
	p2p_connecting: "Connecting P2P...",
	p2p_transferring: "Transferring via P2P...",
	done: "Transfer complete",
	error: "Transfer failed",
};

export function SendPage() {
	const { phase, shareUrl, progress, error, send, reset } = useSendTransfer();

	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [sizeError, setSizeError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [showQr, setShowQr] = useState(false);

	const inputRef = useRef<HTMLInputElement>(null);
	const inputId = useId();
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clear copy-feedback timeout on unmount to avoid setState on unmounted component
	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		};
	}, []);

	const isIdle = phase === "idle";
	const isActive =
		phase !== "idle" && phase !== "done" && phase !== "error";
	const isWaiting = phase === "waiting_for_peer";
	const isDone = phase === "done";
	const isError = phase === "error";

	const handleFile = useCallback((file: File) => {
		setSizeError(null);
		if (file.size > MAX_FILE_SIZE) {
			setSizeError(`${file.name} exceeds the 100 MB limit`);
			return;
		}
		setSelectedFile(file);
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);
			if (!isIdle) return;
			const file = e.dataTransfer.files[0];
			if (file) handleFile(file);
		},
		[isIdle, handleFile],
	);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) handleFile(file);
	};

	const handleSend = async () => {
		if (!selectedFile) return;
		await send(selectedFile);
	};

	const copyLink = async () => {
		if (!shareUrl) return;
		await navigator.clipboard.writeText(shareUrl);
		setCopied(true);
		if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		copyTimeoutRef.current = setTimeout(() => setCopied(false), 2500);
	};

	const handleReset = () => {
		reset();
		setSelectedFile(null);
		setSizeError(null);
		setCopied(false);
	};

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
									{isIdle && "Send a File"}
									{isActive && (PHASE_LABEL[phase] ?? "Processing...")}
									{isDone && "Sent"}
									{isError && "Send Failed"}
								</h1>
								<p className="text-xs text-muted-foreground mt-0.5">
									{isIdle &&
										"Pick a file — encrypted in-browser, key lives only in the link"}
									{isWaiting &&
										"Share the link below. File is already uploaded as fallback."}
									{isDone && "Recipient can now download via the link"}
									{isError && (error ?? "An error occurred")}
								</p>
							</div>
						</div>
					</div>

					{/* Drop zone — only when idle */}
					{isIdle && !selectedFile && (
						<label
							htmlFor={inputId}
							className={cn(
								"relative flex flex-col items-center justify-center border border-border border-t-0 border-dashed p-10 cursor-pointer select-none transition-colors",
								isDragging
									? "bg-primary/5 border-primary"
									: "bg-card hover:border-primary/60 hover:bg-primary/5",
							)}
							onDrop={handleDrop}
							onDragOver={(e) => {
								e.preventDefault();
								setIsDragging(true);
							}}
							onDragLeave={() => setIsDragging(false)}
						>
							<input
								ref={inputRef}
								id={inputId}
								type="file"
								className="sr-only"
								onChange={handleInputChange}
							/>
							<div className="flex flex-col items-center gap-3 text-center">
								<div
									className={cn(
										"p-4 border",
										isDragging
											? "border-primary bg-primary/10"
											: "border-border bg-muted",
									)}
								>
									<Upload
										className={cn(
											"h-7 w-7",
											isDragging ? "text-primary" : "text-muted-foreground",
										)}
									/>
								</div>
								<div>
									<p className="text-sm font-medium text-foreground uppercase tracking-wide">
										{isDragging ? "Drop file here" : "Drag & drop a file"}
									</p>
									<p className="text-xs text-muted-foreground mt-1">
										or{" "}
										<span className="text-primary font-medium">
											click to browse
										</span>
									</p>
								</div>
								<p className="text-xs text-muted-foreground">
									Max 100 MB · One file per send
								</p>
							</div>
						</label>
					)}

					{/* Selected file */}
					{selectedFile && (
						<div className="border border-border border-t-0 bg-card">
							<div className="flex items-center gap-3 px-3 py-2.5">
								<div className="bg-primary/10 p-1.5 shrink-0">
									<FileIcon className="h-4 w-4 text-primary" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium truncate text-foreground">
										{selectedFile.name}
									</p>
									<p className="text-xs text-muted-foreground">
										{formatBytes(selectedFile.size)}
									</p>
									{isActive && phase !== "waiting_for_peer" && (
										<div className="mt-1 h-0.5 bg-border w-full overflow-hidden">
											<div
												className="h-full bg-primary transition-all duration-200"
												style={{ width: `${progress.percent}%` }}
											/>
										</div>
									)}
								</div>
								<div className="shrink-0">
									{isIdle && (
										<button
											type="button"
											onClick={() => setSelectedFile(null)}
											className="text-muted-foreground hover:text-foreground transition-colors"
										>
											<X className="h-4 w-4" />
										</button>
									)}
									{isActive && !isWaiting && (
										<Loader2 className="h-4 w-4 text-primary animate-spin" />
									)}
									{(isDone || isWaiting) && (
										<Check className="h-4 w-4 text-secondary" />
									)}
									{isError && (
										<AlertTriangle className="h-4 w-4 text-destructive" />
									)}
								</div>
							</div>
						</div>
					)}

					{/* Size error */}
					{sizeError && (
						<div className="border border-destructive border-t-0 bg-destructive/5 px-4 py-3 flex items-center gap-2">
							<AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
							<p className="text-xs text-destructive">{sizeError}</p>
						</div>
					)}

					{/* Share link — appears as soon as upload finishes (waiting_for_peer / done) */}
					{shareUrl && (isWaiting || isDone) && (
						<div className="border border-border border-t-0 bg-card px-5 py-4 space-y-3">
							<p className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-2">
								{isWaiting && (
									<span className="inline-block w-1.5 h-1.5 bg-primary animate-pulse" />
								)}
								{isDone && (
									<span className="inline-block w-1.5 h-1.5 bg-secondary" />
								)}
								Share Link
							</p>
							<div className="flex gap-2">
								<input
									readOnly
									value={shareUrl}
									onFocus={(e) => e.target.select()}
									className="flex-1 bg-background border border-input text-xs text-foreground font-mono px-3 py-2 outline-none select-all"
								/>
								<button
									type="button"
									onClick={copyLink}
									className="border border-border bg-card px-3 py-2 hover:border-primary/60 transition-colors text-muted-foreground hover:text-foreground"
									aria-label="Copy link"
								>
									{copied ? (
										<Check className="h-4 w-4 text-secondary" />
									) : (
										<Copy className="h-4 w-4" />
									)}
								</button>
								<a
									href={shareUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="border border-border bg-card px-3 py-2 hover:border-primary/60 transition-colors text-muted-foreground hover:text-foreground flex items-center"
									aria-label="Open link"
								>
									<ExternalLink className="h-4 w-4" />
								</a>
							</div>
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<Clock className="h-3 w-3 shrink-0" />
								<span>Expires in 24 hours</span>
							</div>
							<button
								type="button"
								onClick={() => setShowQr((v) => !v)}
								className="flex items-center gap-2 border border-border bg-card px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-primary/60 transition-colors w-full"
							>
								<QrCode className="h-3.5 w-3.5 shrink-0" />
								{showQr ? "Hide QR Code" : "Generate QR Code"}
							</button>
						</div>
					)}

					{/* QR code panel */}
					{shareUrl && (isWaiting || isDone) && showQr && (
						<div className="border border-border border-t-0 bg-card px-5 py-5 flex flex-col items-center gap-3">
							<p className="text-xs uppercase tracking-widest text-muted-foreground font-medium self-start">
								QR Code
							</p>
							<div className="bg-white p-4 inline-block">
								<QRCode value={shareUrl} size={180} bgColor="#ffffff" fgColor="#000000" />
							</div>
							<p className="text-xs text-muted-foreground text-center">
								Scan to open the share link
							</p>
						</div>
					)}

					{/* Waiting for peer indicator */}
					{isWaiting && (
						<div className="border border-border border-t-0 bg-muted/20 px-5 py-4">
							<div className="flex items-center gap-3">
								<Wifi className="h-4 w-4 text-primary animate-pulse shrink-0" />
								<div>
									<p className="text-xs font-medium text-foreground uppercase tracking-wide">
										Waiting for peer
									</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										When recipient opens the link, P2P transfer will begin.
										File is already available via S3 fallback.
									</p>
								</div>
							</div>
						</div>
					)}

					{/* P2P connecting/transferring */}
					{(phase === "p2p_connecting" || phase === "p2p_transferring") && (
						<div className="border border-border border-t-0 bg-muted/20 px-5 py-4">
							<div className="flex items-center gap-3">
								<Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
								<div>
									<p className="text-xs font-medium text-foreground uppercase tracking-wide">
										{phase === "p2p_connecting"
											? "Establishing P2P connection..."
											: "Transferring via P2P..."}
									</p>
									{phase === "p2p_transferring" && (
										<div className="mt-1.5 h-0.5 bg-border w-full overflow-hidden">
											<div
												className="h-full bg-primary transition-all duration-200"
												style={{ width: `${progress.percent}%` }}
											/>
										</div>
									)}
								</div>
							</div>
						</div>
					)}

					{/* Actions */}
					<div className="border border-border border-t-0 bg-card px-5 py-4">
						{isIdle && selectedFile && (
							<button
								type="button"
								onClick={handleSend}
								className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-3 text-sm font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors"
							>
								<Lock className="h-4 w-4" />
								Encrypt & Send
								<ChevronRight className="h-4 w-4 ml-auto" />
							</button>
						)}
						{isIdle && !selectedFile && (
							<p className="text-xs text-muted-foreground text-center uppercase tracking-wide py-1">
								Select a file above to continue
							</p>
						)}
						{(phase === "encrypting" || phase === "uploading") && (
							<div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-1">
								<Loader2 className="h-4 w-4 animate-spin text-primary" />
								<span className="uppercase tracking-wider text-xs">
									{PHASE_LABEL[phase]}
								</span>
							</div>
						)}
						{isWaiting && (
							<div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-1">
								<span className="uppercase tracking-wider text-xs">
									Keep this tab open for faster P2P transfer
								</span>
							</div>
						)}
						{isDone && (
							<button
								type="button"
								onClick={handleReset}
								className="w-full flex items-center justify-center gap-2 border border-border text-foreground px-4 py-3 text-xs uppercase tracking-widest hover:border-primary/60 transition-colors"
							>
								Send Another File
								<ArrowRight className="h-3.5 w-3.5 ml-auto" />
							</button>
						)}
						{isError && (
							<button
								type="button"
								onClick={handleReset}
								className="w-full flex items-center justify-center gap-2 border border-destructive text-destructive px-4 py-3 text-xs uppercase tracking-widest hover:bg-destructive/5 transition-colors"
							>
								<AlertTriangle className="h-4 w-4" />
								Try Again
							</button>
						)}
					</div>

					{/* Footer note */}
					<div className="px-5 py-3 flex items-start gap-2 text-xs text-muted-foreground border border-border border-t-0 bg-muted/30">
						<Shield className="h-3 w-3 mt-0.5 shrink-0" />
						<span>
							File encrypted with AES-GCM-256 in-browser. The decryption key
							lives only in the URL fragment — the server never sees it.
						</span>
					</div>
				</div>
			</main>
		</div>
	);
}
