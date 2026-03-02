import type { RoomFileDownloadState } from "@flop/shared";
import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	Download,
	File as FileIcon,
	Layers,
	Loader2,
	Shield,
} from "lucide-react";
import { useEffect, useId } from "react";
import { Link, useParams } from "react-router-dom";
import { useRoomDownload } from "@/hooks/useRoomTransfer";
import { cn, formatBytes } from "@/lib/utils";

function FileRow({
	fileState,
	onToggle,
	disabled,
}: {
	fileState: RoomFileDownloadState;
	onToggle: () => void;
	disabled: boolean;
}) {
	const checkId = useId();
	const phase = fileState.phase;

	return (
		<div
			className={cn(
				"flex items-center gap-3 px-3 py-2.5 transition-colors",
				fileState.selected && phase === "idle" ? "bg-primary/5" : "",
			)}
		>
			{/* Checkbox */}
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

			{/* File icon */}
			<div className="bg-primary/10 p-1.5 shrink-0">
				<FileIcon className="h-4 w-4 text-primary" />
			</div>

			{/* Info */}
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

			{/* Status icon */}
			<div className="shrink-0 w-5 flex items-center justify-center">
				{(phase === "downloading" || phase === "decrypting") && (
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

export function RoomDownloadPage() {
	const { roomId } = useParams<{ roomId: string }>();
	const {
		phase,
		roomMeta,
		fileStates,
		error,
		loadRoom,
		toggleSelect,
		selectAll,
		deselectAll,
		downloadSelected,
	} = useRoomDownload();

	useEffect(() => {
		if (roomId) loadRoom(roomId);
	}, [roomId, loadRoom]);

	const isLoading = phase === "loading";
	const isReady = phase === "ready";
	const isDownloading = phase === "downloading";
	const isDone = phase === "done";
	const isError = phase === "error";

	const selectedCount = fileStates.filter((f) => f.selected).length;
	const totalCount = fileStates.length;
	const allSelected = selectedCount === totalCount && totalCount > 0;
	const canDownload = isReady && selectedCount > 0;

	// Format expiry
	let expiryLabel = "";
	if (roomMeta?.expiresAt) {
		const diff = new Date(roomMeta.expiresAt).getTime() - Date.now();
		const hours = Math.floor(diff / 3_600_000);
		const mins = Math.floor((diff % 3_600_000) / 60_000);
		if (diff <= 0) expiryLabel = "Expired";
		else if (hours > 0) expiryLabel = `Expires in ${hours}h ${mins}m`;
		else expiryLabel = `Expires in ${mins}m`;
	}

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
									{isLoading && "Loading Room..."}
									{isReady &&
										(roomMeta?.label ? roomMeta.label : "Secure Room")}
									{isDownloading && "Downloading..."}
									{isDone && "Download Complete"}
									{isError && "Room Unavailable"}
								</h1>
								<p className="text-xs text-muted-foreground mt-0.5">
									{isLoading && "Fetching room metadata..."}
									{isReady &&
										`${totalCount} ${totalCount === 1 ? "file" : "files"} available · Select files to download`}
									{isDownloading && "Decrypting and saving your files..."}
									{isDone &&
										"All selected files have been saved to your device"}
									{isError &&
										(error ?? "This room may have expired or does not exist")}
								</p>
							</div>
						</div>
					</div>

					{/* Loading state */}
					{isLoading && (
						<div className="border border-border border-t-0 bg-card px-6 py-10 flex items-center justify-center gap-3">
							<Loader2 className="h-5 w-5 animate-spin text-primary" />
							<span className="text-sm text-muted-foreground uppercase tracking-wider">
								Loading...
							</span>
						</div>
					)}

					{/* Error state */}
					{isError && (
						<div className="border border-destructive border-t-0 bg-destructive/5 px-6 py-8 flex flex-col items-center gap-3 text-center">
							<AlertTriangle className="h-8 w-8 text-destructive" />
							<div>
								<p className="text-sm font-medium text-destructive uppercase tracking-wide">
									Room Not Found
								</p>
								<p className="text-xs text-muted-foreground mt-1">
									{error ?? "This room may have expired or been deleted."}
								</p>
							</div>
							<Link
								to="/send"
								className="mt-2 border border-border text-foreground px-4 py-2 text-xs uppercase tracking-widest hover:border-primary/60 transition-colors"
							>
								Send Files
							</Link>
						</div>
					)}

					{/* File list */}
					{(isReady || isDownloading || isDone) && fileStates.length > 0 && (
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
											disabled={!isReady}
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

							{/* File rows */}
							<div className="border border-border border-t-0 divide-y divide-border">
								{fileStates.map((fs) => (
									<FileRow
										key={fs.fileId}
										fileState={fs}
										onToggle={() => toggleSelect(fs.fileId)}
										disabled={!isReady}
									/>
								))}
							</div>
						</>
					)}

					{/* Policies bar */}
					{(isReady || isDownloading || isDone) && roomMeta && (
						<div className="border border-border border-t-0 bg-muted/20 px-4 py-2.5 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
							{expiryLabel && (
								<span className="flex items-center gap-1.5">
									<Clock className="h-3 w-3 shrink-0" />
									{expiryLabel}
								</span>
							)}
							{roomMeta.oneTimeDownload && (
								<span className="flex items-center gap-1.5 text-primary uppercase tracking-wide font-medium">
									<Shield className="h-3 w-3 shrink-0" />
									One-time download
								</span>
							)}
						</div>
					)}

					{/* Actions */}
					<div className="border border-border border-t-0 bg-card px-5 py-4">
						{isReady && (
							<button
								type="button"
								onClick={downloadSelected}
								disabled={!canDownload}
								className={cn(
									"w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-widest transition-colors",
									canDownload
										? "bg-primary text-primary-foreground hover:bg-primary/90"
										: "bg-muted text-muted-foreground cursor-not-allowed",
								)}
							>
								<Download className="h-4 w-4" />
								Download {selectedCount > 0 ? `${selectedCount} ` : ""}
								{selectedCount === 1 ? "File" : "Files"}
							</button>
						)}
						{isDownloading && (
							<div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-1">
								<Loader2 className="h-4 w-4 animate-spin text-primary" />
								<span className="uppercase tracking-wider text-xs">
									Decrypting & saving files...
								</span>
							</div>
						)}
						{isDone && (
							<div className="flex flex-col gap-2">
								<div className="flex items-center justify-center gap-2 text-secondary text-sm py-1">
									<CheckCircle2 className="h-4 w-4" />
									<span className="uppercase tracking-wider text-xs font-medium">
										Downloads complete
									</span>
								</div>
								<Link
									to="/send"
									className="w-full flex items-center justify-center gap-2 border border-border text-foreground px-4 py-3 text-xs uppercase tracking-widest hover:border-primary/60 transition-colors text-center"
								>
									Send Your Own Files
								</Link>
							</div>
						)}
						{isError && (
							<Link
								to="/"
								className="w-full flex items-center justify-center gap-2 border border-border text-foreground px-4 py-3 text-xs uppercase tracking-widest hover:border-primary/60 transition-colors text-center"
							>
								Back to Home
							</Link>
						)}
					</div>

					{/* Footer note */}
					<div className="px-5 py-3 flex items-start gap-2 text-xs text-muted-foreground border border-border border-t-0 bg-muted/30">
						<Shield className="h-3 w-3 mt-0.5 shrink-0" />
						<span>
							Files are decrypted in your browser using AES-GCM-256. Your
							plaintext data is never sent to the server.
						</span>
					</div>
				</div>
			</main>
		</div>
	);
}
