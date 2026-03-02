import type { RoomFileUploadState } from "@flop/shared";
import {
	AlertTriangle,
	Check,
	CheckCircle2,
	ChevronRight,
	Clock,
	Copy,
	ExternalLink,
	File as FileIcon,
	Layers,
	Loader2,
	Lock,
	Shield,
	Upload,
	X,
} from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { type RoomPolicy, useRoomUpload } from "@/hooks/useRoomTransfer";
import { cn, formatBytes } from "@/lib/utils";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

function FileRow({
	fileState,
	onRemove,
	isUploading,
}: {
	fileState: { file: File; uploadState?: RoomFileUploadState };
	onRemove: () => void;
	isUploading: boolean;
}) {
	const us = fileState.uploadState;
	const phase = us?.phase ?? "pending";

	return (
		<div className="flex items-center gap-3 border border-border bg-card px-3 py-2.5">
			<div className="bg-primary/10 p-1.5 shrink-0">
				<FileIcon className="h-4 w-4 text-primary" />
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium truncate text-foreground">
					{fileState.file.name}
				</p>
				<p className="text-xs text-muted-foreground">
					{formatBytes(fileState.file.size)}
				</p>
				{phase === "uploading" && us && (
					<div className="mt-1 h-0.5 bg-border w-full overflow-hidden">
						<div
							className="h-full bg-primary transition-all duration-200"
							style={{ width: `${us.progress.percent}%` }}
						/>
					</div>
				)}
			</div>
			<div className="shrink-0">
				{phase === "pending" && !isUploading && (
					<button
						type="button"
						onClick={onRemove}
						className="text-muted-foreground hover:text-foreground transition-colors"
						aria-label="Remove file"
					>
						<X className="h-4 w-4" />
					</button>
				)}
				{(phase === "encrypting" || phase === "uploading") && (
					<Loader2 className="h-4 w-4 text-primary animate-spin" />
				)}
				{phase === "done" && (
					<CheckCircle2 className="h-4 w-4 text-secondary" />
				)}
				{phase === "error" && (
					<AlertTriangle className="h-4 w-4 text-destructive" />
				)}
			</div>
		</div>
	);
}

export function RoomUploadPage() {
	const { phase, roomUrl, fileStates, error, createRoomAndUpload, reset } =
		useRoomUpload();

	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [sizeErrors, setSizeErrors] = useState<string[]>([]);
	const [policy, setPolicy] = useState<RoomPolicy>({
		label: "",
		expiresIn: 24,
		oneTimeDownload: false,
	});
	const [copied, setCopied] = useState(false);

	const inputRef = useRef<HTMLInputElement>(null);
	const inputId = useId();
	const roomLabelId = useId();
	const oneTimeId = useId();

	const isIdle = phase === "idle";
	const isActive = phase !== "idle" && phase !== "done" && phase !== "error";
	const isDone = phase === "done";

	const addFiles = useCallback((incoming: FileList | File[]) => {
		const arr = Array.from(incoming);
		const errors: string[] = [];
		const valid: File[] = [];
		for (const f of arr) {
			if (f.size > MAX_FILE_SIZE) {
				errors.push(`${f.name} exceeds 100 MB`);
			} else {
				valid.push(f);
			}
		}
		setSizeErrors(errors);
		setPendingFiles((prev) => {
			const names = new Set(prev.map((f) => f.name));
			return [...prev, ...valid.filter((f) => !names.has(f.name))];
		});
	}, []);

	const removeFile = useCallback((index: number) => {
		setPendingFiles((prev) => prev.filter((_, i) => i !== index));
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);
			if (!isIdle) return;
			addFiles(e.dataTransfer.files);
		},
		[isIdle, addFiles],
	);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) addFiles(e.target.files);
	};

	const handleSend = async () => {
		if (pendingFiles.length === 0) return;
		await createRoomAndUpload(pendingFiles, policy);
	};

	const copyLink = async () => {
		if (!roomUrl) return;
		await navigator.clipboard.writeText(roomUrl);
		setCopied(true);
		setTimeout(() => setCopied(false), 2500);
	};

	const handleReset = () => {
		reset();
		setPendingFiles([]);
		setSizeErrors([]);
		setCopied(false);
	};

	// Map pendingFiles to upload states when active/done
	const combinedFiles = isIdle
		? pendingFiles.map((f) => ({ file: f }))
		: fileStates.map((fs) => ({ file: fs.file, uploadState: fs }));

	return (
		<div className="min-h-screen bg-background flex flex-col">
			{/* Header */}
			<header className="border-b border-border px-6 py-4 flex items-center justify-between">
				<Link
					to="/"
					className="text-xl font-bold tracking-widest text-foreground uppercase"
				>
					flop
				</Link>
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider">
					<Shield className="h-3 w-3" />
					AES-GCM-256
				</div>
			</header>

			<main className="flex-1 flex flex-col items-center justify-center p-6">
				<div className="w-full max-w-xl space-y-0">
					{/* Title block */}
					<div className="border border-border bg-card px-6 py-5 border-b-0">
						<div className="flex items-center gap-3">
							<Layers className="h-5 w-5 text-primary shrink-0" />
							<div>
								<h1 className="text-base font-bold uppercase tracking-widest text-foreground">
									{isIdle && "Create Room"}
									{isActive && "Uploading..."}
									{isDone && "Room Ready"}
									{phase === "error" && "Upload Failed"}
								</h1>
								<p className="text-xs text-muted-foreground mt-0.5">
									{isIdle && "Add files, set access policy, share one link"}
									{isActive && "Files are being encrypted and uploaded"}
									{isDone && "Share the link below with your recipient"}
									{phase === "error" && (error ?? "An error occurred")}
								</p>
							</div>
						</div>
					</div>

					{/* Drop zone — only when idle */}
					{isIdle && (
						<label
							htmlFor={inputId}
							className={cn(
								"relative flex flex-col items-center justify-center border border-border border-dashed p-10 cursor-pointer select-none transition-colors",
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
								multiple
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
										{isDragging ? "Drop files here" : "Drag & drop files"}
									</p>
									<p className="text-xs text-muted-foreground mt-1">
										or{" "}
										<span className="text-primary font-medium">
											click to browse
										</span>
									</p>
								</div>
								<p className="text-xs text-muted-foreground">
									Max 100 MB per file · Any type · Multiple files
								</p>
							</div>
						</label>
					)}

					{/* File list */}
					{combinedFiles.length > 0 && (
						<div className="border border-border border-t-0 space-y-0">
							{combinedFiles.map((item, i) => (
								<div
									key={item.file.name}
									className={i > 0 ? "border-t border-border" : ""}
								>
									<FileRow
										fileState={item}
										onRemove={() => removeFile(i)}
										isUploading={!isIdle}
									/>
								</div>
							))}
						</div>
					)}

					{/* Size errors */}
					{sizeErrors.length > 0 && (
						<div className="border border-destructive border-t-0 bg-destructive/5 px-4 py-3">
							{sizeErrors.map((e) => (
								<p key={e} className="text-xs text-destructive">
									{e}
								</p>
							))}
						</div>
					)}

					{/* Policy config — only when idle */}
					{isIdle && (
						<div className="border border-border border-t-0 bg-card px-5 py-4 space-y-4">
							<p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
								Access Policy
							</p>

							{/* Label */}
							<div className="space-y-1">
								<label
									htmlFor={roomLabelId}
									className="text-xs text-muted-foreground uppercase tracking-wide"
								>
									Room Label (optional)
								</label>
								<input
									id={roomLabelId}
									type="text"
									maxLength={80}
									placeholder="e.g. Project Assets Q4"
									value={policy.label ?? ""}
									onChange={(e) =>
										setPolicy((p) => ({ ...p, label: e.target.value }))
									}
									className="w-full bg-background border border-input text-sm text-foreground placeholder:text-muted-foreground px-3 py-2 outline-none focus:border-primary transition-colors font-sans"
								/>
							</div>

							{/* Expiry */}
							<div className="space-y-1">
								<p className="text-xs text-muted-foreground uppercase tracking-wide">
									Expires in
								</p>
								<div className="flex gap-2 flex-wrap">
									{[1, 6, 24, 48, 168].map((h) => (
										<button
											key={h}
											type="button"
											onClick={() => setPolicy((p) => ({ ...p, expiresIn: h }))}
											className={cn(
												"px-3 py-1.5 text-xs border uppercase tracking-wide transition-colors",
												policy.expiresIn === h
													? "border-primary bg-primary text-primary-foreground"
													: "border-border text-muted-foreground hover:border-primary/60",
											)}
										>
											{h < 24
												? `${h}h`
												: h === 24
													? "24h"
													: h === 48
														? "2d"
														: "7d"}
										</button>
									))}
								</div>
							</div>

							{/* One-time download */}
							<label
								htmlFor={oneTimeId}
								className="flex items-center gap-3 cursor-pointer select-none"
							>
								<div
									className={cn(
										"w-4 h-4 border flex items-center justify-center transition-colors shrink-0",
										policy.oneTimeDownload
											? "border-primary bg-primary"
											: "border-border",
									)}
								>
									<input
										id={oneTimeId}
										type="checkbox"
										checked={policy.oneTimeDownload}
										onChange={(e) =>
											setPolicy((p) => ({
												...p,
												oneTimeDownload: e.target.checked,
											}))
										}
										className="sr-only"
									/>
									{policy.oneTimeDownload && (
										<Check className="h-3 w-3 text-primary-foreground" />
									)}
								</div>
								<div>
									<p className="text-sm text-foreground">One-time download</p>
									<p className="text-xs text-muted-foreground">
										Each file can only be downloaded once
									</p>
								</div>
							</label>
						</div>
					)}

					{/* Share link — when done */}
					{isDone && roomUrl && (
						<div className="border border-border border-t-0 bg-card px-5 py-4 space-y-3">
							<p className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-2">
								<span className="inline-block w-1.5 h-1.5 bg-secondary animate-pulse" />
								Room Link
							</p>
							<div className="flex gap-2">
								<input
									readOnly
									value={roomUrl}
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
									href={roomUrl}
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
								<span>
									Expires in{" "}
									{policy.expiresIn === 1
										? "1 hour"
										: policy.expiresIn === 24
											? "24 hours"
											: policy.expiresIn === 48
												? "2 days"
												: "7 days"}
									{policy.oneTimeDownload && " · One-time download enabled"}
								</span>
							</div>
						</div>
					)}

					{/* Actions */}
					<div className="border border-border border-t-0 bg-card px-5 py-4">
						{isIdle && pendingFiles.length > 0 && (
							<button
								type="button"
								onClick={handleSend}
								className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-3 text-sm font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors"
							>
								<Lock className="h-4 w-4" />
								Encrypt & Upload {pendingFiles.length}{" "}
								{pendingFiles.length === 1 ? "File" : "Files"}
								<ChevronRight className="h-4 w-4 ml-auto" />
							</button>
						)}
						{isIdle && pendingFiles.length === 0 && (
							<p className="text-xs text-muted-foreground text-center uppercase tracking-wide py-1">
								Add files above to continue
							</p>
						)}
						{isActive && (
							<div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-1">
								<Loader2 className="h-4 w-4 animate-spin text-primary" />
								<span className="uppercase tracking-wider text-xs">
									{phase === "creating_room" && "Creating room..."}
									{phase === "encrypting" && "Encrypting files..."}
									{phase === "uploading" && "Uploading to secure storage..."}
								</span>
							</div>
						)}
						{isDone && (
							<button
								type="button"
								onClick={handleReset}
								className="w-full flex items-center justify-center gap-2 border border-border text-foreground px-4 py-3 text-xs uppercase tracking-widest hover:border-primary/60 transition-colors"
							>
								Create Another Room
							</button>
						)}
						{phase === "error" && (
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
							Files encrypted in-browser with AES-GCM-256 before upload.
							Decryption keys are stored per-file and included in the room link.
							The server never sees your plaintext.
						</span>
					</div>
				</div>
			</main>
		</div>
	);
}
