import {
	AlertTriangle,
	ArrowRight,
	Check,
	ChevronRight,
	Clock,
	Copy,
	ExternalLink,
	File as FileIcon,
	HelpCircle,
	Loader2,
	Lock,
	QrCode,
	Send,
	Shield,
	ShieldCheck,
	Sparkles,
	Upload,
	Wifi,
	X,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useSendTransfer } from "@/hooks/useSendTransfer";
import { cn, formatBytes } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UiTipBanner, UiTipsDrawer, UiTipTooltip } from "@/components/ui/UiTips";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const PHASE_LABEL: Record<string, string> = {
	encrypting: "Encrypting File Data...",
	uploading: "Uploading Encrypted Chunk...",
	waiting_for_peer: "Waiting for Recipient to Connect...",
	p2p_connecting: "Establishing WebRTC Peer Connection...",
	p2p_transferring: "Streaming Directly P2P...",
	done: "Transfer Completed",
	error: "Transfer Failed",
};

const SEND_TIPS = [
	{
		id: "e2ee-tip",
		title: "Zero-Knowledge Encryption",
		description: "Your file is encrypted in your browser using Web Crypto AES-GCM-256 before upload. Decryption key stays in the URL hash.",
		tag: "AES-256",
		icon: <Lock className="h-3.5 w-3.5 text-emerald-500" />,
	},
	{
		id: "webrtc-tip",
		title: "WebRTC Direct Transfer",
		description: "If the recipient opens the link while your tab is active, data streams peer-to-peer at full LAN/WAN speed.",
		tag: "P2P Stream",
		icon: <Wifi className="h-3.5 w-3.5 text-primary" />,
	},
	{
		id: "cloud-tip",
		title: "Encrypted S3 Fallback",
		description: "Files are stored in secure ephemeral cloud storage for 24 hours so recipient can download even if you close the tab.",
		tag: "24h Expiry",
		icon: <Clock className="h-3.5 w-3.5 text-amber-500" />,
	},
];

export function SendPage() {
	const { phase, shareUrl, progress, error, send, reset } = useSendTransfer();

	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [sizeError, setSizeError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [showQr, setShowQr] = useState(false);

	const inputRef = useRef<HTMLInputElement>(null);
	const inputId = useId();
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clear copy-feedback timeout on unmount
	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		};
	}, []);

	const isIdle = phase === "idle";
	const isActive = phase !== "idle" && phase !== "done" && phase !== "error";
	const isWaiting = phase === "waiting_for_peer";
	const isDone = phase === "done";
	const isError = phase === "error";

	const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

	const handleFiles = useCallback((files: FileList | File[]) => {
		setSizeError(null);
		const validFiles: File[] = [];
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (file.size > MAX_FILE_SIZE) {
				setSizeError(`${file.name} exceeds the 100 MB limit`);
				continue;
			}
			validFiles.push(file);
		}
		setSelectedFiles((prev) => [...prev, ...validFiles]);
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);
			if (!isIdle) return;
			if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
		},
		[isIdle, handleFiles],
	);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files?.length) handleFiles(e.target.files);
	};

	const handleSend = async () => {
		if (selectedFiles.length === 0) return;
		await send(selectedFiles);
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
		setSelectedFiles([]);
		setSizeError(null);
		setCopied(false);
	};

	return (
		<div className="min-h-screen bg-background flex flex-col">
			<header className="border-b border-border px-6 py-4 flex items-center justify-between">
				<Link
					to="/"
					className="text-xl font-bold tracking-widest text-foreground uppercase flex items-center gap-2"
				>
					<span>flop</span>
					<span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
						Send
					</span>
				</Link>
				<div className="flex items-center gap-3 text-xs text-muted-foreground uppercase tracking-wider">
					<div className="flex items-center gap-1.5 text-emerald-500 font-mono">
						<Shield className="h-3.5 w-3.5" />
						AES-GCM-256
					</div>
					<ThemeToggle />
				</div>
			</header>

			<main className="flex-1 flex flex-col items-center justify-center p-6">
				<motion.div
					initial={{ opacity: 0, y: 15 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3 }}
					className="w-full max-w-xl space-y-4"
				>
					{/* Pipeline Progress Indicator */}
					{isActive && (
						<div className="p-3 rounded-2xl bg-card border border-border/80 shadow-sm flex items-center justify-between text-xs font-mono">
							<div className={cn("flex items-center gap-1.5", phase === "encrypting" ? "text-primary font-bold" : "text-emerald-500")}>
								<Lock className="h-3.5 w-3.5" />
								<span>1. Encrypt</span>
							</div>
							<ChevronRight className="h-3 w-3 text-muted-foreground/40" />
							<div className={cn("flex items-center gap-1.5", phase === "uploading" ? "text-primary font-bold" : (phase === "waiting_for_peer" || phase === "p2p_connecting" || phase === "p2p_transferring") ? "text-emerald-500" : "text-muted-foreground")}>
								<Upload className="h-3.5 w-3.5" />
								<span>2. Upload</span>
							</div>
							<ChevronRight className="h-3 w-3 text-muted-foreground/40" />
							<div className={cn("flex items-center gap-1.5", phase === "waiting_for_peer" ? "text-amber-500 font-bold animate-pulse" : (phase === "p2p_transferring" || phase === "p2p_connecting") ? "text-primary font-bold" : isDone ? "text-emerald-500" : "text-muted-foreground")}>
								<Wifi className="h-3.5 w-3.5" />
								<span>3. P2P / Share</span>
							</div>
						</div>
					)}

					{/* Main Card */}
					<div className="border border-border bg-card/90 backdrop-blur-md rounded-2xl overflow-hidden shadow-sm">
						{/* Title header */}
						<div className="p-6 border-b border-border bg-muted/20 flex items-center gap-3.5">
							<div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
								<Send className="h-5 w-5" />
							</div>
							<div className="flex-1 min-w-0">
								<h1 className="text-base font-bold uppercase tracking-wider text-foreground">
									{isIdle && "Send Encrypted File"}
									{isActive && (PHASE_LABEL[phase] ?? "Processing...")}
									{isDone && "File Transfer Complete"}
									{isError && "Transfer Error"}
								</h1>
								<p className="text-xs text-muted-foreground mt-0.5 truncate">
									{isIdle && "Files are encrypted in your browser before leaving your device"}
									{isWaiting && "Share the link below. Recipient can download immediately."}
									{isDone && "Recipient can download the file using your share link"}
									{isError && (error ?? "An error occurred during transfer")}
								</p>
							</div>
						</div>

						{/* Drop zone — only when idle & no files selected */}
						{isIdle && selectedFiles.length === 0 && (
							<label
								htmlFor={inputId}
								className="block p-4 cursor-pointer"
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
									multiple
									className="sr-only"
									onChange={handleInputChange}
								/>
								<motion.div
									animate={{ scale: isDragging ? 1.02 : 1 }}
									transition={{ duration: 0.15 }}
									className={cn(
										"flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 select-none transition-all",
										isDragging
											? "bg-primary/10 border-primary shadow-inner"
											: "bg-muted/10 border-border hover:border-primary/60 hover:bg-muted/30",
									)}
								>
									<div className={cn("p-4 rounded-2xl border transition-all mb-3", isDragging ? "bg-primary text-primary-foreground border-primary" : "bg-primary/10 text-primary border-primary/20")}>
										<Upload className="h-7 w-7" />
									</div>
									<p className="text-sm font-semibold text-foreground uppercase tracking-wider">
										{isDragging ? "Drop files to encrypt" : "Drag & drop files here"}
									</p>
									<p className="text-xs text-muted-foreground mt-1">
										or <span className="text-primary font-semibold underline underline-offset-2">browse files</span> from your computer
									</p>
									<span className="mt-4 px-2.5 py-1 rounded-md bg-muted text-[10px] font-mono text-muted-foreground">
										Up to 100 MB per file · Multiple files supported
									</span>
								</motion.div>
							</label>
						)}

						{/* Selected files list */}
						{selectedFiles.length > 0 && (
							<div className="p-4 space-y-2">
								<div className="flex items-center justify-between text-xs text-muted-foreground font-semibold px-2 uppercase tracking-wider">
									<span>Selected Payload ({selectedFiles.length})</span>
									<span className="font-mono text-foreground">{formatBytes(totalSize)}</span>
								</div>

								<div className="space-y-2 max-h-60 overflow-y-auto pr-1">
									<AnimatePresence>
										{selectedFiles.map((file, i) => (
											<motion.div
												key={`${file.name}-${i}`}
												initial={{ opacity: 0, x: -10 }}
												animate={{ opacity: 1, x: 0 }}
												exit={{ opacity: 0, x: 10 }}
												transition={{ duration: 0.2 }}
												className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-background hover:bg-muted/20 transition-colors"
											>
												<div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
													<FileIcon className="h-4 w-4" />
												</div>
												<div className="flex-1 min-w-0">
													<p className="text-xs font-semibold truncate text-foreground">
														{file.name}
													</p>
													<p className="text-[11px] text-muted-foreground font-mono">
														{formatBytes(file.size)}
													</p>
												</div>
												<div className="shrink-0">
													{isIdle && (
														<button
															type="button"
															onClick={() => setSelectedFiles((prev) => prev.filter((_, idx) => idx !== i))}
															className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
															title="Remove file"
														>
															<X className="h-4 w-4" />
														</button>
													)}
													{isActive && !isWaiting && (
														<Loader2 className="h-4 w-4 text-primary animate-spin" />
													)}
													{(isDone || isWaiting) && (
														<Check className="h-4 w-4 text-emerald-500" />
													)}
													{isError && (
														<AlertTriangle className="h-4 w-4 text-destructive" />
													)}
												</div>
											</motion.div>
										))}
									</AnimatePresence>
								</div>

								{/* Progress gauge when active */}
								{isActive && phase !== "waiting_for_peer" && (
									<div className="pt-2">
										<div className="p-3 rounded-xl bg-muted/30 border border-border/60 space-y-2">
											<div className="flex justify-between text-xs text-muted-foreground font-semibold">
												<span className="flex items-center gap-1.5 text-foreground">
													<Zap className="h-3.5 w-3.5 text-primary animate-pulse" />
													{PHASE_LABEL[phase] ?? "Processing..."}
												</span>
												<span className="font-mono text-primary font-bold">{progress.percent}%</span>
											</div>
											<div className="h-2 bg-muted rounded-full overflow-hidden">
												<motion.div
													className="h-full bg-primary rounded-full"
													animate={{ width: `${progress.percent}%` }}
													transition={{ duration: 0.2 }}
												/>
											</div>
										</div>
									</div>
								)}

								{/* Allow adding more files when idle */}
								{isIdle && (
									<button
										type="button"
										onClick={() => inputRef.current?.click()}
										className="w-full py-2 border border-dashed border-border hover:border-primary/50 rounded-xl text-xs text-muted-foreground hover:text-foreground font-semibold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
									>
										<Upload className="h-3.5 w-3.5" />
										Add More Files
									</button>
								)}
							</div>
						)}

						{/* Size error */}
						<AnimatePresence>
							{sizeError && (
								<motion.div
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									className="border-t border-destructive/30 bg-destructive/10 px-5 py-3 flex items-center gap-2"
								>
									<AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
									<p className="text-xs text-destructive font-medium">{sizeError}</p>
								</motion.div>
							)}
						</AnimatePresence>

						{/* Share link block */}
						<AnimatePresence>
							{shareUrl && (isWaiting || isDone) && (
								<motion.div
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									className="p-6 border-t border-border bg-muted/10 space-y-3.5"
								>
									<div className="flex items-center justify-between">
										<p className="text-xs uppercase tracking-wider text-foreground font-bold flex items-center gap-2">
											{isWaiting ? (
												<span className="flex h-2 w-2 relative">
													<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
													<span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
												</span>
											) : (
												<Check className="h-4 w-4 text-emerald-500" />
											)}
											<span>Encrypted Share Link</span>
										</p>
										<span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
											<Clock className="h-3 w-3" /> 24h Expiry
										</span>
									</div>

									<div className="flex gap-2">
										<input
											readOnly
											value={shareUrl}
											onFocus={(e) => e.target.select()}
											className="flex-1 bg-background border border-input rounded-xl text-xs text-foreground font-mono px-3.5 py-2.5 outline-none select-all focus:border-primary transition-colors"
										/>
										<button
											type="button"
											onClick={copyLink}
											className="border border-border bg-card px-4 py-2.5 rounded-xl hover:border-primary/60 transition-all text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 shrink-0"
										>
											{copied ? (
												<>
													<Check className="h-3.5 w-3.5 text-emerald-500" />
													<span className="text-emerald-500">Copied</span>
												</>
											) : (
												<>
													<Copy className="h-3.5 w-3.5" />
													Copy
												</>
											)}
										</button>
										<a
											href={shareUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="border border-border bg-card p-2.5 rounded-xl hover:border-primary/60 transition-all text-muted-foreground hover:text-foreground flex items-center shrink-0"
											title="Open in new tab"
										>
											<ExternalLink className="h-4 w-4" />
										</a>
									</div>

									<button
										type="button"
										onClick={() => setShowQr((v) => !v)}
										className="flex items-center justify-center gap-2 border border-border bg-background hover:bg-muted/40 px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider text-foreground transition-all w-full font-semibold"
									>
										<QrCode className="h-4 w-4 shrink-0 text-primary" />
										{showQr ? "Hide QR Code" : "Show Share QR Code"}
									</button>

									{showQr && (
										<motion.div
											initial={{ opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: "auto" }}
											exit={{ opacity: 0, height: 0 }}
											className="overflow-hidden border border-border rounded-xl p-4 bg-card flex flex-col items-center gap-2.5"
										>
											<div className="bg-white p-3 rounded-xl shadow-inner inline-block border border-border">
												<QRCode value={shareUrl} size={150} bgColor="#ffffff" fgColor="#000000" />
											</div>
											<p className="text-[11px] text-muted-foreground text-center">
												Scan to download file on another device
											</p>
										</motion.div>
									)}
								</motion.div>
							)}
						</AnimatePresence>

						{/* Action Buttons Footer */}
						<div className="p-6 border-t border-border bg-card">
							{isIdle && selectedFiles.length > 0 && (
								<button
									type="button"
									onClick={handleSend}
									className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-primary/90 transition-all shadow-md active:scale-[0.99]"
								>
									<Lock className="h-4 w-4" />
									<span>Encrypt & Send Files</span>
									<ChevronRight className="h-4 w-4 ml-auto" />
								</button>
							)}

							{isIdle && selectedFiles.length === 0 && (
								<p className="text-xs text-muted-foreground text-center uppercase tracking-wider py-1 font-medium">
									Select a file above to begin end-to-end encryption
								</p>
							)}

							{isDone && (
								<button
									type="button"
									onClick={handleReset}
									className="w-full flex items-center justify-center gap-2 border border-border text-foreground px-4 py-3 rounded-xl text-xs uppercase tracking-wider font-semibold hover:border-primary/60 hover:bg-muted/20 transition-all"
								>
									<span>Send Another File</span>
									<ArrowRight className="h-4 w-4 ml-auto" />
								</button>
							)}

							{isError && (
								<button
									type="button"
									onClick={handleReset}
									className="w-full flex items-center justify-center gap-2 border border-destructive text-destructive px-4 py-3 rounded-xl text-xs uppercase tracking-wider font-semibold hover:bg-destructive/5 transition-all"
								>
									<AlertTriangle className="h-4 w-4" />
									<span>Try Again</span>
								</button>
							)}
						</div>
					</div>

					{/* Expandable Tips Drawer */}
					<UiTipsDrawer tips={SEND_TIPS} title="File Transfer & Security Tips" />
				</motion.div>
			</main>
		</div>
	);
}

