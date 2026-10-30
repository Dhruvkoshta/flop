import type { PersonalRoomResponse } from "@flop/shared";
import {
	AlertTriangle,
	Check,
	CheckCircle2,
	Clock,
	Copy,
	Download,
	Eye,
	EyeOff,
	File as FileIcon,
	Key,
	Loader2,
	Lock,
	QrCode,
	Shield,
	ShieldCheck,
	Trash2,
	Upload,
	User,
	X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "react-qr-code";
import { motion, AnimatePresence } from "framer-motion";
import {
	usePersonalDownload,
	usePersonalRoom,
} from "@/hooks/usePersonalRoom";
import { hashPassword } from "@/lib/crypto";
import { cn, formatBytes } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UiTipsDrawer, UiTipTooltip } from "@/components/ui/UiTips";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const ROOM_PAGE_TIPS = [
	{
		id: "room-access",
		title: "Room Authorization",
		description: "Enter your owner password to unlock upload permissions and file deletion management.",
		tag: "Owner Key",
		icon: <Key className="h-3.5 w-3.5 text-primary" />,
	},
	{
		id: "batch-download",
		title: "Batch Download",
		description: "Select multiple files to download them sequentially in a single batch operation.",
		tag: "Multi-Download",
		icon: <Download className="h-3.5 w-3.5 text-emerald-500" />,
	},
	{
		id: "room-expiry",
		title: "Room Persistence",
		description: "This room and its files will automatically self-destruct once the expiration timer reaches zero.",
		tag: "Auto Cleanup",
		icon: <Clock className="h-3.5 w-3.5 text-amber-500" />,
	},
];

// ─── File row (download list) ─────────────────────────────────────────────────

function DownloadFileRow({
	fileState,
	onToggle,
	onDelete,
	disabled,
	isOwner,
}: {
	fileState: {
		fileId: string;
		name: string;
		size: number;
		phase: string;
		selected: boolean;
		progress: { percent: number };
		error: string | null;
	};
	onToggle: () => void;
	onDelete?: () => void;
	disabled: boolean;
	isOwner: boolean;
}) {
	const checkId = useId();
	const phase = fileState.phase;

	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: 5 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, scale: 0.95 }}
			className={cn(
				"flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer border-b border-border/60 last:border-b-0",
				fileState.selected && phase === "idle" ? "bg-primary/10 border-primary/20" : "hover:bg-muted/30",
			)}
			onClick={(e) => {
				if (disabled) return;
				if ((e.target as HTMLElement).closest("label") || (e.target as HTMLElement).closest("button")) {
					return;
				}
				onToggle();
			}}
		>
			<label htmlFor={checkId} className="shrink-0 cursor-pointer">
				<div
					className={cn(
						"w-4 h-4 rounded border flex items-center justify-center transition-all",
						fileState.selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
						disabled ? "opacity-50" : "",
					)}
				>
					<input
						id={checkId}
						type="checkbox"
						checked={fileState.selected}
						onChange={onToggle}
						disabled={disabled}
						className="sr-only"
					/>
					{fileState.selected && (
						<Check className="h-3 w-3 stroke-[3]" />
					)}
				</div>
			</label>

			<div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
				<FileIcon className="h-4 w-4" />
			</div>

			<div className="flex-1 min-w-0">
				<p className="text-xs font-semibold truncate text-foreground">
					{fileState.name}
				</p>
				<p className="text-[11px] text-muted-foreground font-mono">
					{formatBytes(fileState.size)}
				</p>
				{phase === "downloading" && (
					<div className="mt-1 h-1 bg-muted rounded-full overflow-hidden w-full">
						<motion.div
							className="h-full bg-primary"
							animate={{ width: `${fileState.progress.percent}%` }}
						/>
					</div>
				)}
				{phase === "error" && fileState.error && (
					<p className="text-[11px] text-destructive mt-0.5">{fileState.error}</p>
				)}
			</div>

			<div className="shrink-0 flex items-center gap-2">
				{(phase === "downloading" || phase === "decrypting") && (
					<Loader2 className="h-4 w-4 text-primary animate-spin" />
				)}
				{phase === "done" && (
					<CheckCircle2 className="h-4 w-4 text-emerald-500" />
				)}
				{phase === "error" && (
					<AlertTriangle className="h-4 w-4 text-destructive" />
				)}
				{isOwner && onDelete && phase === "idle" && (
					<button
						type="button"
						onClick={onDelete}
						className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
						aria-label="Delete file"
					>
						<Trash2 className="h-4 w-4" />
					</button>
				)}
			</div>
		</motion.div>
	);
}

// ─── Upload file row ──────────────────────────────────────────────────────────

function UploadFileRow({
	name,
	size,
	phase,
	progress,
	error,
	onRemove,
}: {
	name: string;
	size: number;
	phase: string;
	progress: { percent: number };
	error: string | null;
	onRemove?: () => void;
}) {
	return (
		<div className="flex items-center gap-3 border-t border-border px-4 py-3 bg-background">
			<div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
				<FileIcon className="h-4 w-4" />
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-xs font-semibold truncate text-foreground">{name}</p>
				<p className="text-[11px] text-muted-foreground font-mono">{formatBytes(size)}</p>
				{phase === "uploading" && (
					<div className="mt-1 h-1 bg-muted rounded-full overflow-hidden w-full">
						<motion.div
							className="h-full bg-primary"
							animate={{ width: `${progress.percent}%` }}
						/>
					</div>
				)}
				{phase === "error" && error && (
					<p className="text-[11px] text-destructive mt-0.5">{error}</p>
				)}
			</div>
			<div className="shrink-0">
				{phase === "pending" && onRemove && (
					<button
						type="button"
						onClick={onRemove}
						className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
					>
						<X className="h-4 w-4" />
					</button>
				)}
				{(phase === "encrypting" || phase === "uploading") && (
					<Loader2 className="h-4 w-4 text-primary animate-spin" />
				)}
				{phase === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
				{phase === "error" && (
					<AlertTriangle className="h-4 w-4 text-destructive" />
				)}
			</div>
		</div>
	);
}

// ─── Password gate ────────────────────────────────────────────────────────────

function PasswordGate({
	onUnlock,
}: {
	onUnlock: (password: string) => void;
}) {
	const [pw, setPw] = useState("");
	const [showPw, setShowPw] = useState(false);

	return (
		<div className="p-5 border border-border/80 rounded-2xl bg-card/90 backdrop-blur-md space-y-3 shadow-sm">
			<div className="flex items-center justify-between">
				<p className="text-xs uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
					<Lock className="h-3.5 w-3.5 text-primary" />
					<span>Owner Authentication</span>
				</p>
				<UiTipTooltip content="Enter the password you created this room with to gain upload and delete permissions." />
			</div>
			<div className="flex gap-2">
				<div className="flex-1 flex items-center border border-input rounded-xl focus-within:border-primary transition-all bg-background overflow-hidden">
					<input
						type={showPw ? "text" : "password"}
						placeholder="Enter owner password"
						value={pw}
						onChange={(e) => setPw(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && pw) onUnlock(pw);
						}}
						className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground px-3.5 py-2.5 outline-none"
					/>
					<button
						type="button"
						tabIndex={-1}
						onClick={() => setShowPw((v) => !v)}
						className="px-3.5 text-muted-foreground hover:text-foreground transition-colors"
					>
						{showPw ? (
							<EyeOff className="h-4 w-4" />
						) : (
							<Eye className="h-4 w-4" />
						)}
					</button>
				</div>
				<button
					type="button"
					disabled={!pw}
					onClick={() => pw && onUnlock(pw)}
					className={cn(
						"px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shrink-0 border",
						pw
							? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
							: "border-border bg-muted text-muted-foreground cursor-not-allowed",
					)}
				>
					Unlock
				</button>
			</div>
		</div>
	);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PersonalRoomPage() {
	const { alias } = useParams<{ alias: string }>();
	const {
		loadPhase,
		room,
		loadError,
		loadRoom,
		uploadPhase,
		uploadStates,
		uploadError,
		uploadFiles,
		resetUpload,
		deleteFile,
	} = usePersonalRoom();
	const { fileStates, initFiles, toggleSelect, selectAll, deselectAll, downloadSelected } =
		usePersonalDownload();

	const [ownerPassword, setOwnerPassword] = useState<string | null>(null);
	const [isOwner, setIsOwner] = useState(false);
	const [authError, setAuthError] = useState<string | null>(null);
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [sizeErrors, setSizeErrors] = useState<string[]>([]);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [showQr, setShowQr] = useState(false);
	const [copied, setCopied] = useState(false);

	const ownerPasswordHashRef = useRef<string | null>(null);

	const inputRef = useRef<HTMLInputElement>(null);
	const inputId = useId();

	useEffect(() => {
		if (alias) loadRoom(alias);
	}, [alias, loadRoom]);

	useEffect(() => {
		if (room && loadPhase === "ready") {
			initFiles(room);
		}
	}, [room, loadPhase, initFiles]);

	const handleUnlock = async (password: string) => {
		if (!room) return;
		setAuthError(null);
		try {
			const passwordHash = await hashPassword(password);

			const res = await fetch(`/api/rooms/${room.roomId}/password`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ passwordHash }),
			});
			if (!res.ok) {
				setAuthError("Incorrect password");
				return;
			}
			ownerPasswordHashRef.current = passwordHash;
			setOwnerPassword(password);
			setIsOwner(true);
		} catch {
			setAuthError("Authentication failed");
		}
	};

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

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);
			addFiles(e.dataTransfer.files);
		},
		[addFiles],
	);

	const handleUpload = async () => {
		if (!room || !ownerPasswordHashRef.current || pendingFiles.length === 0) return;
		await uploadFiles(pendingFiles, ownerPasswordHashRef.current, room.roomId);
		setPendingFiles([]);
		if (alias) await loadRoom(alias);
	};

	const handleDelete = async (fileId: string) => {
		if (!room || !ownerPasswordHashRef.current) return;
		setDeleteError(null);
		try {
			await deleteFile(fileId, ownerPasswordHashRef.current, room.roomId);
		} catch (err) {
			setDeleteError(err instanceof Error ? err.message : "Delete failed");
		}
	};

	const isUploading =
		uploadPhase === "encrypting" || uploadPhase === "uploading";

	const selectedCount = fileStates.filter((f) => f.selected).length;
	const totalCount = fileStates.length;
	const totalBytes = fileStates.reduce((acc, f) => acc + f.size, 0);
	const allSelected = selectedCount === totalCount && totalCount > 0;

	let expiryLabel = "";
	if (room?.expiresAt) {
		const diff = new Date(room.expiresAt).getTime() - Date.now();
		const hours = Math.floor(diff / 3_600_000);
		const mins = Math.floor((diff % 3_600_000) / 60_000);
		if (diff <= 0) expiryLabel = "Expired";
		else if (hours > 24) expiryLabel = `Expires in ${Math.floor(hours / 24)}d`;
		else if (hours > 0) expiryLabel = `Expires in ${hours}h`;
		else expiryLabel = `Expires in ${mins}m`;
	}

	const isLoading = loadPhase === "loading";
	const isReady = loadPhase === "ready";
	const isError = loadPhase === "error";

	const roomUrl = `${window.location.origin}/u/${alias}`;

	const copyRoomLink = async () => {
		await navigator.clipboard.writeText(roomUrl);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
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
						Personal Room
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

			<main className="flex-1 flex flex-col items-center justify-start p-6 pt-8">
				<motion.div
					initial={{ opacity: 0, y: 15 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3 }}
					className="w-full max-w-xl space-y-4"
				>
					{/* Title Block */}
					<div className="border border-border bg-card/90 backdrop-blur-md rounded-2xl overflow-hidden shadow-sm">
						<div className="p-6 border-b border-border bg-muted/20 flex items-center justify-between">
							<div className="flex items-center gap-3.5">
								<div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
									<User className="h-5 w-5" />
								</div>
								<div>
									<h1 className="text-base font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
										{isLoading
											? "Loading Room..."
											: isError
												? "Room Unavailable"
												: (room?.label ?? `@${alias}`)}
									</h1>
									<p className="text-xs text-muted-foreground mt-0.5 font-mono">
										{isLoading && "Fetching room payload..."}
										{isError && (loadError ?? "This room may not exist")}
										{isReady && `${totalCount} ${totalCount === 1 ? "file" : "files"} · ${formatBytes(totalBytes)} · /u/${alias}`}
									</p>
								</div>
							</div>

							{isReady && room && (
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={copyRoomLink}
										className="p-2 rounded-xl border border-border bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-all text-xs flex items-center gap-1 font-mono"
										title="Copy room link"
									>
										{copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
									</button>
									<button
										type="button"
										onClick={() => setShowQr(!showQr)}
										className="p-2 rounded-xl border border-border bg-background hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-all text-xs"
										title="Toggle QR Code"
									>
										<QrCode className="h-4 w-4" />
									</button>
								</div>
							)}
						</div>

						{/* QR Code expansion */}
						<AnimatePresence>
							{showQr && isReady && (
								<motion.div
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									className="overflow-hidden border-b border-border bg-muted/10 p-5 flex flex-col items-center gap-3"
								>
									<div className="bg-white p-3 rounded-xl shadow-inner inline-block border border-border">
										<QRCode value={roomUrl} size={150} bgColor="#ffffff" fgColor="#000000" />
									</div>
									<p className="text-[11px] text-muted-foreground text-center">
										Scan QR code to open <span className="font-mono text-primary">/u/{alias}</span> on another device
									</p>
								</motion.div>
							)}
						</AnimatePresence>

						{/* Expiry & Owner Status Bar */}
						{isReady && room && expiryLabel && (
							<div className="px-6 py-3 border-b border-border/80 bg-muted/30 flex items-center justify-between text-xs">
								<div className="flex items-center gap-2 text-muted-foreground font-mono">
									<Clock className="h-3.5 w-3.5 text-amber-500" />
									<span>{expiryLabel}</span>
								</div>
								{isOwner ? (
									<span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-mono text-[11px] font-semibold">
										<ShieldCheck className="h-3.5 w-3.5" /> Owner Unlocked
									</span>
								) : (
									<span className="text-[11px] text-muted-foreground">Guest View</span>
								)}
							</div>
						)}

						{/* Error Screen */}
						{isError && (
							<div className="p-8 flex flex-col items-center gap-3 text-center">
								<AlertTriangle className="h-8 w-8 text-destructive" />
								<p className="text-xs text-muted-foreground">
									{loadError ?? "This room may have expired or been deleted."}
								</p>
								<Link
									to="/"
									className="mt-2 border border-border text-foreground px-4 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider hover:border-primary/60 transition-colors"
								>
									Back to Home
								</Link>
							</div>
						)}

						{isReady && room && (
							<>
								{/* File list header & select all */}
								{totalCount > 0 ? (
									<>
										<div className="px-6 py-3 bg-muted/20 border-b border-border/60 flex items-center justify-between text-xs">
											<label className="flex items-center gap-2 cursor-pointer text-muted-foreground uppercase tracking-wider font-semibold">
												<div
													className={cn(
														"w-4 h-4 rounded border flex items-center justify-center transition-all",
														allSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
													)}
												>
													<input
														type="checkbox"
														checked={allSelected}
														onChange={allSelected ? deselectAll : selectAll}
														className="sr-only"
													/>
													{allSelected && <Check className="h-3 w-3 stroke-[3]" />}
												</div>
												<span>{allSelected ? "Deselect All" : "Select All"}</span>
											</label>
											<span className="font-mono text-muted-foreground">
												{selectedCount} / {totalCount} selected
											</span>
										</div>

										<div className="divide-y divide-border/60 max-h-80 overflow-y-auto">
											<AnimatePresence>
												{fileStates.map((fs) => (
													<DownloadFileRow
														key={fs.fileId}
														fileState={fs}
														onToggle={() => toggleSelect(fs.fileId)}
														onDelete={isOwner ? () => handleDelete(fs.fileId) : undefined}
														disabled={false}
														isOwner={isOwner}
													/>
												))}
											</AnimatePresence>
										</div>

										{/* Delete error */}
										<AnimatePresence>
											{deleteError && (
												<motion.div
													initial={{ opacity: 0, height: 0 }}
													animate={{ opacity: 1, height: "auto" }}
													exit={{ opacity: 0, height: 0 }}
													className="border-t border-destructive/30 bg-destructive/10 px-5 py-3 flex items-center gap-2"
												>
													<AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
													<p className="text-xs text-destructive font-medium">{deleteError}</p>
												</motion.div>
											)}
										</AnimatePresence>

										{/* Download Button */}
										<div className="p-6 border-t border-border bg-card">
											<button
												type="button"
												onClick={() => downloadSelected(room)}
												disabled={selectedCount === 0}
												className={cn(
													"w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all shadow-md active:scale-[0.99]",
													selectedCount > 0
														? "bg-primary text-primary-foreground hover:bg-primary/90"
														: "bg-muted text-muted-foreground cursor-not-allowed",
												)}
											>
												<Download className="h-4 w-4" />
												<span>
													Download {selectedCount > 0 ? `${selectedCount} ` : ""}
													{selectedCount === 1 ? "File" : "Files"}
												</span>
											</button>
										</div>
									</>
								) : (
									<div className="p-10 text-center space-y-1">
										<p className="text-sm font-semibold text-foreground uppercase tracking-wider">
											Room is Empty
										</p>
										<p className="text-xs text-muted-foreground">
											{isOwner
												? "Upload files below to share them in this personal room"
												: "The room owner has not uploaded any files yet"}
										</p>
									</div>
								)}

								{/* Owner Authentication Screen */}
								{!isOwner && (
									<div className="p-6 border-t border-border bg-muted/10 space-y-3">
										<PasswordGate onUnlock={handleUnlock} />
										<AnimatePresence>
											{authError && (
												<motion.div
													initial={{ opacity: 0, height: 0 }}
													animate={{ opacity: 1, height: "auto" }}
													exit={{ opacity: 0, height: 0 }}
													className="border border-destructive/30 rounded-xl bg-destructive/10 px-4 py-3 flex items-center gap-2"
												>
													<AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
													<p className="text-xs text-destructive font-medium">{authError}</p>
												</motion.div>
											)}
										</AnimatePresence>
									</div>
								)}

								{/* Owner Upload Dropzone */}
								{isOwner && (
									<div className="p-6 border-t border-border bg-muted/10 space-y-4">
										<div className="flex items-center justify-between">
											<p className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-2">
												<Upload className="h-4 w-4 text-primary" />
												<span>Owner File Upload</span>
											</p>
											<UiTipTooltip content="Upload additional files directly into this room using your owner privileges." />
										</div>

										<label
											htmlFor={inputId}
											className="block cursor-pointer"
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
												onChange={(e) => {
													if (e.target.files) addFiles(e.target.files);
												}}
											/>
											<div
												className={cn(
													"flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 select-none transition-all text-center",
													isDragging
														? "bg-primary/10 border-primary shadow-inner"
														: "bg-background border-border hover:border-primary/60 hover:bg-muted/30",
												)}
											>
												<div className={cn("p-2.5 rounded-xl border transition-all mb-2", isDragging ? "bg-primary text-primary-foreground border-primary" : "bg-primary/10 text-primary border-primary/20")}>
													<Upload className="h-5 w-5" />
												</div>
												<p className="text-xs font-semibold text-foreground uppercase tracking-wider">
													{isDragging ? "Drop files here" : "Add files to room"}
												</p>
												<p className="text-[11px] text-muted-foreground mt-0.5">
													or <span className="text-primary font-medium underline">browse files</span>
												</p>
											</div>
										</label>

										{/* Pending upload list */}
										{(pendingFiles.length > 0 || uploadStates.length > 0) && (
											<div className="rounded-xl border border-border/80 overflow-hidden divide-y divide-border">
												{isUploading
													? uploadStates.map((us) => (
															<UploadFileRow
																key={us.file.name}
																name={us.file.name}
																size={us.file.size}
																phase={us.phase}
																progress={us.progress}
																error={us.error}
															/>
														))
													: pendingFiles.map((f, i) => (
															<UploadFileRow
																key={f.name}
																name={f.name}
																size={f.size}
																phase="pending"
																progress={{ percent: 0 }}
																error={null}
																onRemove={() =>
																	setPendingFiles((prev) =>
																		prev.filter((_, idx) => idx !== i),
																	)
																}
															/>
														))}
											</div>
										)}

										{/* Size errors */}
										{sizeErrors.length > 0 && (
											<div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 space-y-1">
												{sizeErrors.map((e) => (
													<p key={e} className="text-xs text-destructive font-medium">
														{e}
													</p>
												))}
											</div>
										)}

										{uploadError && (
											<div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 flex items-center gap-2">
												<AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
												<p className="text-xs text-destructive font-medium">{uploadError}</p>
											</div>
										)}

										{/* Upload submit button */}
										{isUploading ? (
											<div className="flex items-center gap-2 text-xs text-muted-foreground justify-center py-2 font-mono">
												<Loader2 className="h-4 w-4 animate-spin text-primary" />
												<span className="uppercase">
													{uploadPhase === "encrypting" ? "Encrypting..." : "Uploading..."}
												</span>
											</div>
										) : uploadPhase === "done" ? (
											<div className="space-y-2">
												<div className="flex items-center justify-center gap-2 text-emerald-500 text-xs py-1 font-semibold uppercase tracking-wider">
													<Check className="h-4 w-4" />
													<span>Files successfully uploaded to room</span>
												</div>
												<button
													type="button"
													onClick={resetUpload}
													className="w-full border border-border text-foreground px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider font-semibold hover:border-primary/60 transition-all"
												>
													Upload More
												</button>
											</div>
										) : (
											<button
												type="button"
												disabled={pendingFiles.length === 0}
												onClick={handleUpload}
												className={cn(
													"w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all shadow-md active:scale-[0.99]",
													pendingFiles.length > 0
														? "bg-primary text-primary-foreground hover:bg-primary/90"
														: "bg-muted text-muted-foreground cursor-not-allowed",
												)}
											>
												<Lock className="h-4 w-4" />
												<span>
													Encrypt & Upload {pendingFiles.length > 0 && pendingFiles.length}{" "}
													{pendingFiles.length === 1 ? "File" : "Files"}
												</span>
											</button>
										)}
									</div>
								)}
							</>
						)}
					</div>

					{/* Expandable Tips Guide */}
					<UiTipsDrawer tips={ROOM_PAGE_TIPS} title="Personal Room Usage Guide" />
				</motion.div>
			</main>
		</div>
	);
}

