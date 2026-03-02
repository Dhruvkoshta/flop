import type { PersonalRoomResponse } from "@flop/shared";
import {
	AlertTriangle,
	Check,
	CheckCircle2,
	Clock,
	Download,
	Eye,
	EyeOff,
	File as FileIcon,
	Loader2,
	Lock,
	Shield,
	Trash2,
	Upload,
	User,
	X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
	usePersonalDownload,
	usePersonalRoom,
} from "@/hooks/usePersonalRoom";
import { hashPassword } from "@/lib/crypto";
import { cn, formatBytes } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

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
		<div
			className={cn(
				"flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer",
				fileState.selected && phase === "idle" ? "bg-primary/5" : "hover:bg-muted/30",
			)}
			onClick={(e) => {
				if (disabled) return;
				// Avoid double-toggle when clicking the actual checkbox or delete button
				if ((e.target as HTMLElement).closest("label") || (e.target as HTMLElement).closest("button")) {
					return;
				}
				onToggle();
			}}
		>
			<label htmlFor={checkId} className="shrink-0 cursor-pointer">
				<div
					className={cn(
						"w-4 h-4 border flex items-center justify-center transition-colors",
						fileState.selected ? "border-primary bg-primary" : "border-border",
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
						<svg
							className="h-2.5 w-2.5 text-primary-foreground"
							viewBox="0 0 10 10"
							fill="none"
							aria-hidden="true"
						>
							<path
								d="M1.5 5.5L4 8L8.5 2"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					)}
				</div>
			</label>

			<div className="bg-primary/10 p-1.5 shrink-0">
				<FileIcon className="h-4 w-4 text-primary" />
			</div>

			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium truncate text-foreground">
					{fileState.name}
				</p>
				<p className="text-xs text-muted-foreground">
					{formatBytes(fileState.size)}
				</p>
				{phase === "downloading" && (
					<div className="mt-1 h-0.5 bg-border w-full overflow-hidden">
						<div
							className="h-full bg-primary transition-all duration-200"
							style={{ width: `${fileState.progress.percent}%` }}
						/>
					</div>
				)}
				{phase === "error" && fileState.error && (
					<p className="text-xs text-destructive mt-0.5">{fileState.error}</p>
				)}
			</div>

			<div className="shrink-0 flex items-center gap-2">
				{(phase === "downloading" || phase === "decrypting") && (
					<Loader2 className="h-4 w-4 text-primary animate-spin" />
				)}
				{phase === "done" && (
					<CheckCircle2 className="h-4 w-4 text-secondary" />
				)}
				{phase === "error" && (
					<AlertTriangle className="h-4 w-4 text-destructive" />
				)}
				{isOwner && onDelete && phase === "idle" && (
					<button
						type="button"
						onClick={onDelete}
						className="text-muted-foreground hover:text-destructive transition-colors"
						aria-label="Delete file"
					>
						<Trash2 className="h-3.5 w-3.5" />
					</button>
				)}
			</div>
		</div>
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
		<div className="flex items-center gap-3 border-t border-border px-3 py-2.5">
			<div className="bg-primary/10 p-1.5 shrink-0">
				<FileIcon className="h-4 w-4 text-primary" />
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium truncate text-foreground">{name}</p>
				<p className="text-xs text-muted-foreground">{formatBytes(size)}</p>
				{phase === "uploading" && (
					<div className="mt-1 h-0.5 bg-border w-full overflow-hidden">
						<div
							className="h-full bg-primary transition-all duration-200"
							style={{ width: `${progress.percent}%` }}
						/>
					</div>
				)}
				{phase === "error" && error && (
					<p className="text-xs text-destructive mt-0.5">{error}</p>
				)}
			</div>
			<div className="shrink-0">
				{phase === "pending" && onRemove && (
					<button
						type="button"
						onClick={onRemove}
						className="text-muted-foreground hover:text-foreground transition-colors"
					>
						<X className="h-4 w-4" />
					</button>
				)}
				{(phase === "encrypting" || phase === "uploading") && (
					<Loader2 className="h-4 w-4 text-primary animate-spin" />
				)}
				{phase === "done" && <CheckCircle2 className="h-4 w-4 text-secondary" />}
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
		<div className="border border-border border-t-0 bg-card px-5 py-4 space-y-3">
			<p className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-2">
				<Lock className="h-3 w-3" />
				Owner Access
			</p>
			<div className="flex gap-2">
				<div className="flex-1 flex items-center border border-input focus-within:border-primary transition-colors bg-background">
					<input
						type={showPw ? "text" : "password"}
						placeholder="Enter owner password"
						value={pw}
						onChange={(e) => setPw(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && pw) onUnlock(pw);
						}}
						className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground px-3 py-2 outline-none"
					/>
					<button
						type="button"
						tabIndex={-1}
						onClick={() => setShowPw((v) => !v)}
						className="px-3 text-muted-foreground hover:text-foreground transition-colors"
					>
						{showPw ? (
							<EyeOff className="h-3.5 w-3.5" />
						) : (
							<Eye className="h-3.5 w-3.5" />
						)}
					</button>
				</div>
				<button
					type="button"
					disabled={!pw}
					onClick={() => pw && onUnlock(pw)}
					className={cn(
						"px-4 py-2 text-xs border uppercase tracking-wide transition-colors",
						pw
							? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
							: "border-border text-muted-foreground cursor-not-allowed",
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

	// Cache the password hash so deleteFile and uploadFiles don't rehash on every call
	const ownerPasswordHashRef = useRef<string | null>(null);

	const inputRef = useRef<HTMLInputElement>(null);
	const inputId = useId();

	useEffect(() => {
		if (alias) loadRoom(alias);
	}, [alias, loadRoom]);

	// Sync download file states whenever room updates
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
			// Cache hash so subsequent delete/upload calls don't rehash
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
		// Reload room to get updated file list
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
	const allSelected = selectedCount === totalCount && totalCount > 0;

	// Format expiry
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

			<main className="flex-1 flex flex-col items-center justify-start p-6 pt-10">
				<div className="w-full max-w-xl space-y-0">
					{/* Title block */}
					<div className="border border-border bg-card px-6 py-5 border-b-0">
						<div className="flex items-center gap-3">
							<User className="h-5 w-5 text-primary shrink-0" />
							<div>
								<h1 className="text-base font-bold uppercase tracking-widest text-foreground">
									{isLoading
										? "Loading..."
										: isError
											? "Room Unavailable"
											: (room?.label ?? `@${alias}`)}
								</h1>
								<p className="text-xs text-muted-foreground mt-0.5">
									{isLoading && "Fetching room..."}
									{isError && (loadError ?? "This room may not exist")}
									{isReady &&
										`${totalCount} ${totalCount === 1 ? "file" : "files"} · flop.app/u/${alias}`}
								</p>
							</div>
						</div>
					</div>

					{/* Loading */}
					{isLoading && (
						<div className="border border-border border-t-0 bg-card px-6 py-10 flex items-center justify-center gap-3">
							<Loader2 className="h-5 w-5 animate-spin text-primary" />
							<span className="text-sm text-muted-foreground uppercase tracking-wider">
								Loading...
							</span>
						</div>
					)}

					{/* Error */}
					{isError && (
						<div className="border border-destructive border-t-0 bg-destructive/5 px-6 py-8 flex flex-col items-center gap-3 text-center">
							<AlertTriangle className="h-8 w-8 text-destructive" />
							<p className="text-xs text-muted-foreground">
								{loadError ?? "This room may have expired or been deleted."}
							</p>
							<Link
								to="/"
								className="mt-2 border border-border text-foreground px-4 py-2 text-xs uppercase tracking-widest hover:border-primary/60 transition-colors"
							>
								Back to Home
							</Link>
						</div>
					)}

					{isReady && room && (
						<>
							{/* Expiry bar */}
							{expiryLabel && (
								<div className="border border-border border-t-0 bg-muted/20 px-4 py-2.5 flex items-center gap-2 text-xs text-muted-foreground">
									<Clock className="h-3 w-3 shrink-0" />
									{expiryLabel}
									{isOwner && (
										<span className="ml-auto flex items-center gap-1 text-secondary uppercase tracking-wide font-medium">
											<Lock className="h-3 w-3" />
											Owner
										</span>
									)}
								</div>
							)}

							{/* File list */}
							{totalCount > 0 ? (
								<>
									{/* Select all bar */}
									<div className="border border-border border-t-0 bg-muted/30 px-4 py-2 flex items-center justify-between">
										<label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground uppercase tracking-wide">
											<div
												className={cn(
													"w-3.5 h-3.5 border flex items-center justify-center transition-colors shrink-0",
													allSelected
														? "border-primary bg-primary"
														: "border-border",
												)}
											>
												<input
													type="checkbox"
													checked={allSelected}
													onChange={allSelected ? deselectAll : selectAll}
													className="sr-only"
												/>
												{allSelected && (
													<svg
														className="h-2 w-2 text-primary-foreground"
														viewBox="0 0 10 10"
														fill="none"
														aria-hidden="true"
													>
														<path
															d="M1.5 5.5L4 8L8.5 2"
															stroke="currentColor"
															strokeWidth="1.5"
															strokeLinecap="round"
															strokeLinejoin="round"
														/>
													</svg>
												)}
											</div>
											{allSelected ? "Deselect all" : "Select all"}
										</label>
										<span className="text-xs text-muted-foreground">
											{selectedCount} / {totalCount} selected
										</span>
									</div>

									<div className="border border-border border-t-0 divide-y divide-border">
										{fileStates.map((fs) => (
											<DownloadFileRow
												key={fs.fileId}
												fileState={fs}
												onToggle={() => toggleSelect(fs.fileId)}
												onDelete={
													isOwner ? () => handleDelete(fs.fileId) : undefined
												}
												disabled={false}
												isOwner={isOwner}
											/>
										))}
									</div>

									{/* Delete error */}
									{deleteError && (
										<div className="border border-destructive border-t-0 bg-destructive/5 px-4 py-3 flex items-center gap-2">
											<AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
											<p className="text-xs text-destructive">{deleteError}</p>
										</div>
									)}

									{/* Download action */}
									<div className="border border-border border-t-0 bg-card px-5 py-4">
										<button
											type="button"
											onClick={() => downloadSelected(room)}
											disabled={selectedCount === 0}
											className={cn(
												"w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-widest transition-colors",
												selectedCount > 0
													? "bg-primary text-primary-foreground hover:bg-primary/90"
													: "bg-muted text-muted-foreground cursor-not-allowed",
											)}
										>
											<Download className="h-4 w-4" />
											Download{" "}
											{selectedCount > 0 ? `${selectedCount} ` : ""}
											{selectedCount === 1 ? "File" : "Files"}
										</button>
									</div>
								</>
							) : (
								<div className="border border-border border-t-0 bg-card px-6 py-10 text-center">
									<p className="text-sm text-muted-foreground uppercase tracking-wide">
										No files yet
									</p>
									<p className="text-xs text-muted-foreground mt-1">
										{isOwner
											? "Upload files below to share them here"
											: "The owner hasn't uploaded any files yet"}
									</p>
								</div>
							)}

							{/* Owner section */}
							{!isOwner && (
								<>
									<PasswordGate onUnlock={handleUnlock} />
									{authError && (
										<div className="border border-destructive border-t-0 bg-destructive/5 px-4 py-3 flex items-center gap-2">
											<AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
											<p className="text-xs text-destructive">{authError}</p>
										</div>
									)}
								</>
							)}

							{isOwner && (
								<>
									{/* Drop zone */}
									<label
										htmlFor={inputId}
										className={cn(
											"relative flex flex-col items-center justify-center border border-border border-t-0 border-dashed p-8 cursor-pointer select-none transition-colors",
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
											onChange={(e) => {
												if (e.target.files) addFiles(e.target.files);
											}}
										/>
										<div className="flex flex-col items-center gap-2 text-center">
											<div
												className={cn(
													"p-3 border",
													isDragging
														? "border-primary bg-primary/10"
														: "border-border bg-muted",
												)}
											>
												<Upload
													className={cn(
														"h-5 w-5",
														isDragging
															? "text-primary"
															: "text-muted-foreground",
													)}
												/>
											</div>
											<p className="text-xs font-medium text-foreground uppercase tracking-wide">
												{isDragging ? "Drop files" : "Add files to upload"}
											</p>
											<p className="text-xs text-muted-foreground">
												or{" "}
												<span className="text-primary font-medium">
													click to browse
												</span>
											</p>
										</div>
									</label>

									{/* Pending + uploading files */}
									{(pendingFiles.length > 0 || uploadStates.length > 0) && (
										<div className="border border-border border-t-0 divide-y divide-border">
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
										<div className="border border-destructive border-t-0 bg-destructive/5 px-4 py-3">
											{sizeErrors.map((e) => (
												<p key={e} className="text-xs text-destructive">
													{e}
												</p>
											))}
										</div>
									)}

									{uploadError && (
										<div className="border border-destructive border-t-0 bg-destructive/5 px-4 py-3 flex items-center gap-2">
											<AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
											<p className="text-xs text-destructive">{uploadError}</p>
										</div>
									)}

									{/* Upload button */}
									<div className="border border-border border-t-0 bg-card px-5 py-4">
										{isUploading ? (
											<div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-1">
												<Loader2 className="h-4 w-4 animate-spin text-primary" />
												<span className="uppercase tracking-wider text-xs">
													{uploadPhase === "encrypting"
														? "Encrypting..."
														: "Uploading..."}
												</span>
											</div>
										) : uploadPhase === "done" ? (
											<div className="flex items-center justify-center gap-2 text-secondary text-xs py-1">
												<Check className="h-4 w-4" />
												<span className="uppercase tracking-wide font-medium">
													Files uploaded
												</span>
											</div>
										) : (
											<button
												type="button"
												disabled={pendingFiles.length === 0}
												onClick={handleUpload}
												className={cn(
													"w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-widest transition-colors",
													pendingFiles.length > 0
														? "bg-primary text-primary-foreground hover:bg-primary/90"
														: "bg-muted text-muted-foreground cursor-not-allowed",
												)}
											>
												<Lock className="h-4 w-4" />
												Encrypt & Upload {pendingFiles.length > 0 && pendingFiles.length}{" "}
												{pendingFiles.length === 1 ? "File" : "Files"}
											</button>
										)}
										{uploadPhase === "done" && (
											<button
												type="button"
												onClick={resetUpload}
												className="w-full mt-2 border border-border text-foreground px-4 py-2 text-xs uppercase tracking-widest hover:border-primary/60 transition-colors"
											>
												Upload More
											</button>
										)}
									</div>
								</>
							)}
						</>
					)}

					{/* Footer note */}
					<div className="px-5 py-3 flex items-start gap-2 text-xs text-muted-foreground border border-border border-t-0 bg-muted/30">
						<Shield className="h-3 w-3 mt-0.5 shrink-0" />
						<span>
							Files are encrypted in-browser with AES-GCM-256. Keys are stored
							per-file server-side. Your plaintext never reaches our servers.
						</span>
					</div>
				</div>
			</main>
		</div>
	);
}
